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
  private target: { level: number; rpm: number; anomaly: number } = {
    level: 0,
    rpm: 0,
    anomaly: 0,
  };
  available = true;

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
    };
  }

  /** Smoothly apply targets — call ~4×/s from the React tick. */
  update(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const smooth = 0.25;
    this.master.gain.setTargetAtTime(this.target.level, t, smooth);
    const f = Math.max(4, (this.target.rpm / 60) * 2.0); // 2 electrical passes per rev
    for (const osc of this.oscs) {
      const mult = (osc as OscillatorNode & { _mult?: number })._mult ?? 1;
      osc.frequency.setTargetAtTime(f * mult, t, smooth);
    }
    if (this.noiseFilter)
      this.noiseFilter.frequency.setTargetAtTime(300 + this.target.anomaly * 900, t, smooth);
    if (this.noiseGain)
      this.noiseGain.gain.setTargetAtTime(0.1 + this.target.anomaly * 0.25, t, smooth);
    if (this.lfo) this.lfo.frequency.setTargetAtTime(6 + this.target.anomaly * 9, t, smooth);
    if (this.lfoGain)
      this.lfoGain.gain.setTargetAtTime(this.target.anomaly * 0.18, t, smooth);
  }

  stop(): void {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }

  dispose(): void {
    try {
      this.oscs.forEach((o) => o.stop());
      this.noiseSrc?.stop();
      this.lfo?.stop();
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.oscs = [];
    this.oscGains = [];
  }
}
