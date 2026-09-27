/**
 * MachineAudio — synthesized industrial motor hum via Web Audio API.
 *
 * No audio files needed: layered oscillators + filtered noise produce a
 * believable motor tone. Volume and character follow the central machine
 * state (NORMAL smooth, HEAVY LOAD deeper/louder, ANOMALY irregular).
 * Audio is only created/resumed after the user clicks START MOTOR, so no
 * autoplay-policy issues. If Web Audio is unavailable the app continues
 * silently (visual simulation is unaffected).
 */
import type { MachineState } from "@/core/edgesense";

export class MachineAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private oscs: OscillatorNode[] = [];
  private oscGains: GainNode[] = [];
  private noiseSrc: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  /** Updated by the render loop from the central machine state. */
  private target: { level: number; rpm: number; anomaly: number; behaviour: string } = {
    level: 0,
    rpm: 0,
    anomaly: 0,
    behaviour: "NORMAL",
  };
  /** Extra gain ramp on start/stop so the motor spins up/down audibly. */
  private envelope = 0;
  available = true;
  /** Alarm siren nodes (created on first anomaly). */
  private alarmOsc: OscillatorNode | null = null;
  private alarmGain: GainNode | null = null;
  private alarmOn = false;

  /** Must be called from a user-gesture handler (START MOTOR click). */
  start(): void {
    try {
      if (!this.ctx) {
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) {
          this.available = false;
          console.warn("[EdgeSense] Audio unavailable: Web Audio API missing");
          return;
        }
        this.ctx = new AC();
        this.build();
      }
      void this.ctx.resume();
    } catch (e) {
      this.available = false;
      console.warn("[EdgeSense] Audio unavailable:", e);
    }
  }

  private build(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // Layered tones: rotation fundamental + harmonics. Frequencies track RPM.
    const layers: Array<{ mult: number; gain: number; type: OscillatorType }> = [
      { mult: 1, gain: 0.5, type: "sine" },
      { mult: 2, gain: 0.22, type: "triangle" },
      { mult: 3.2, gain: 0.1, type: "sawtooth" },
    ];
    for (const l of layers) {
      const osc = ctx.createOscillator();
      osc.type = l.type;
      const g = ctx.createGain();
      g.gain.value = l.gain;
      osc.connect(g);
      g.connect(this.master);
      osc.start();
      this.oscs.push(osc);
      this.oscGains.push(g);
      (osc as OscillatorNode & { _mult?: number })._mult = l.mult;
    }

    // Broadband mechanical noise through a lowpass filter.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = 0.97 * last + 0.03 * white; // brownish noise
      data[i] = last * 3;
    }
    this.noiseSrc = ctx.createBufferSource();
    this.noiseSrc.buffer = buf;
    this.noiseSrc.loop = true;
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = "lowpass";
    this.noiseFilter.frequency.value = 400;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.12;
    this.noiseSrc.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.master);
    this.noiseSrc.start();

    // Irregularity LFO: near-zero at normal, stronger when anomalous.
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 7;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.master.gain);
    this.lfo.start();
  }

  /** Set targets from the central machine state (cheap, no audio param churn). */
  setTarget(state: MachineState): void {
    const on = state.power === "ON" || state.power === "STARTING";
    this.target = {
      level: on ? 0.35 + Math.min(0.35, state.acousticLevel / 250) : 0,
      rpm: state.rpm,
      anomaly: state.fusedAnomalyScore,
      behaviour: state.behaviour,
    };
  }

  /** Smoothly apply targets — call ~4×/s from the React tick. */
  update(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;

    // Envelope: slow spin-up (~2.5 s) when running, slow coast-down (~2.5 s)
    // when stopped — a real machine never snaps on/off.
    const running = this.target.level > 0;
    const envRate = running ? 1 / 2.5 : -1 / 2.5; // envelope units per second
    this.envelope = Math.max(0, Math.min(1, this.envelope + envRate * 0.25));
    // Soft-saturation curve for a natural swell.
    const env = this.envelope * this.envelope * (3 - 2 * this.envelope); // smoothstep

    // Per-behaviour tone shaping.
    const b = this.target.behaviour;
    const heavy = b === "HEAVY_LOAD" ? 1 : 0;
    const anom = b === "ANOMALY" ? 1 : 0;

    const baseLevel = this.target.level;
    this.master.gain.setTargetAtTime(baseLevel * env, t, 0.25);

    const f = Math.max(4, (this.target.rpm / 60) * 2.0); // 2 electrical passes per rev
    // HEAVY LOAD ≈ 8% lower pitch (strained), ANOMALY ≈ 10% higher + wobble.
    const pitchShift = 1 - heavy * 0.08 + anom * 0.1;
    for (const osc of this.oscs) {
      const mult = (osc as OscillatorNode & { _mult?: number })._mult ?? 1;
      osc.frequency.setTargetAtTime(f * mult * pitchShift, t, 0.3);
    }
    // Mix: heavy load favours the low layer, anomaly brightens the top layers.
    if (this.oscGains.length >= 3) {
      this.oscGains[0].gain.setTargetAtTime(0.5 + heavy * 0.2 - anom * 0.1, t, 0.3);
      this.oscGains[1].gain.setTargetAtTime(0.22 + anom * 0.15, t, 0.3);
      this.oscGains[2].gain.setTargetAtTime(0.1 + anom * 0.22, t, 0.3);
    }
    if (this.noiseFilter)
      this.noiseFilter.frequency.setTargetAtTime(
        300 + this.target.anomaly * 900 + heavy * 150,
        t,
        0.3,
      );
    if (this.noiseGain)
      this.noiseGain.gain.setTargetAtTime((0.1 + this.target.anomaly * 0.25) * env, t, 0.3);
    // Irregularity: gentle at normal, pronounced roughness at anomaly.
    if (this.lfo) this.lfo.frequency.setTargetAtTime(6 + anom * 9 + heavy * 2, t, 0.3);
    if (this.lfoGain) this.lfoGain.gain.setTargetAtTime((anom * 0.22 + heavy * 0.06) * env, t, 0.3);
  }

  /**
   * Large-sounding anomaly alarm — a two-tone industrial siren layered over
   * the machine sound. Fades in while the anomaly persists, stops after it
   * clears.
   */
  setAlarm(active: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    if (active && !this.alarmOn) {
      this.alarmOn = true;
      const osc = ctx.createOscillator();
      osc.type = "square";
      const g = ctx.createGain();
      g.gain.value = 0;
      // Siren sweep 660 ↔ 880 Hz.
      const sweep = ctx.createOscillator();
      sweep.type = "sine";
      sweep.frequency.value = 2.2;
      const sweepDepth = ctx.createGain();
      sweepDepth.gain.value = 110;
      sweep.connect(sweepDepth);
      sweepDepth.connect(osc.frequency);
      osc.frequency.value = 770;
      osc.connect(g);
      // Route the alarm independently of the motor master gain so it stays
      // loud even as the motor envelope changes, but respect overall level.
      const out = ctx.createGain();
      out.gain.value = 0.5;
      g.connect(out);
      out.connect(ctx.destination);
      osc.start();
      sweep.start();
      g.gain.setTargetAtTime(0.35, ctx.currentTime, 0.15);
      this.alarmOsc = osc;
      this.alarmGain = g;
      (osc as OscillatorNode & { _sweep?: OscillatorNode })._sweep = sweep;
    } else if (!active && this.alarmOn) {
      this.alarmOn = false;
      if (this.alarmGain && this.alarmOsc) {
        this.alarmGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
        const osc = this.alarmOsc;
        const sweep = (osc as OscillatorNode & { _sweep?: OscillatorNode })._sweep ?? null;
        window.setTimeout(() => {
          try {
            osc.stop();
            sweep?.stop();
          } catch {
            /* ignore */
          }
        }, 1200);
      }
      this.alarmOsc = null;
      this.alarmGain = null;
    }
  }

  stop(): void {
    if (!this.ctx || !this.master) return;
    // Envelope in update() handles the slow coast-down; just mark stopped.
    this.target = { level: 0, rpm: 0, anomaly: 0, behaviour: this.target.behaviour };
  }

  dispose(): void {
    try {
      this.oscs.forEach((o) => o.stop());
      this.noiseSrc?.stop();
      this.lfo?.stop();
      this.alarmOsc?.stop();
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.oscs = [];
    this.oscGains = [];
  }
}
