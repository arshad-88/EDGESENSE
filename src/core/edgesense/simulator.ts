/**
 * Simulator of a small DC motor with ADXL345 vibration and INMP441 acoustic
 * emission. Generates meaningful periodic components (not random noise) so
 * FFT features have physical meaning.
 *
 * The simulator is the current SensorSource implementation; the downstream
 * pipeline never knows or cares whether samples are synthetic.
 */
import { gaussian, makeRng } from "./rng";
import {
  DEFAULT_SIMULATOR_CONFIG,
  type MachineMode,
  type SensorWindow,
  type SimulatorConfig,
  SensorWindowSchema,
} from "./types";

/** Samples per second for the synthetic signal chain. */
export const SAMPLE_RATE = 512;
/** 1-second processing windows (configurable). */
export const WINDOW_SECONDS = 1;
export const WINDOW_SIZE = SAMPLE_RATE * WINDOW_SECONDS;

export const VIBRATION_CHANNELS = ["x", "y", "z"];

/** Slight per-axis gains so x/y/z are not identical. */
const AXIS_GAINS = [1.0, 0.82, 0.63];

export class SyntheticSensorSource {
  private cfg: SimulatorConfig;
  private rng: () => number;
  private phase = 0;
  /** Total elapsed simulated seconds. */
  t = 0;
  private modeSeconds = 0;
  /** Smoothed amplitude/frequency so transitions are continuous, not steps. */
  private smoothAmp: number;
  private smoothFreq: number;
  private smoothNoise: number;
  private smoothAnomaly: number;
  private smoothAcoustic: number;

  constructor(seed = 42, config: SimulatorConfig = DEFAULT_SIMULATOR_CONFIG) {
    this.cfg = { ...config };
    this.rng = makeRng(seed);
    this.smoothAmp = config.vibrationAmplitude;
    this.smoothFreq = config.rotationFrequencyHz;
    this.smoothNoise = config.noiseLevel;
    this.smoothAnomaly = config.anomalyIntensity;
    this.smoothAcoustic = config.acousticEnergy;
  }

  /** Update the live configuration (applied smoothly on subsequent samples). */
  setConfig(config: Partial<SimulatorConfig>): void {
    this.cfg = { ...this.cfg, ...config };
  }

  getConfig(): SimulatorConfig {
    return { ...this.cfg };
  }

  /**
   * Read one 3-axis vibration + mono acoustic frame at the current instant.
   * Advances the internal clock by one sample period.
   */
  private readSample(): Sample {
    const dt = 1 / SAMPLE_RATE;
    this.t += dt;
    this.modeSeconds += dt;

    // Smooth parameter changes (exponential approach) so the signal morphs.
    const alpha = 0.02;
    this.smoothAmp += (this.cfg.vibrationAmplitude - this.smoothAmp) * alpha;
    this.smoothFreq += (this.cfg.rotationFrequencyHz - this.smoothFreq) * alpha;
    this.smoothNoise += (this.cfg.noiseLevel - this.smoothNoise) * alpha;
    this.smoothAnomaly +=
      (this.cfg.anomalyIntensity - this.smoothAnomaly) * alpha;
    this.smoothAcoustic +=
      (this.cfg.acousticEnergy - this.smoothAcoustic) * alpha;

    const amp = this.smoothAmp;
    const f = this.smoothFreq;
    const intensity = this.smoothAnomaly;
    const noise = this.smoothNoise;

    // Base rotation component + harmonics.
    this.phase += 2 * Math.PI * f * dt;
    const harm = this.cfg.harmonicStrength;
    const base =
      Math.sin(this.phase) +
      harm * 0.5 * Math.sin(2 * this.phase + 0.7) +
      harm * 0.25 * Math.sin(3 * this.phase + 1.9);

    // Mechanical imbalance: amplitude grows with 1× rotational frequency,
    // strongest on the x-axis, plus a slow wobble.
    const imbalance =
      intensity * amp * 1.8 * Math.sin(this.phase + 0.3) * (this.modeSeconds % 7 < 3.5 ? 1 : 0.85);

    // Bearing-like disturbance: high-frequency impulses at a characteristic
    // rate (roughly 3.6× rotation), visible as bursts.
    const bearingRate = 3.6;
    const bp = this.phase * bearingRate;
    const bearing =
      intensity *
      amp *
      (Math.sin(bp) * 0.6 +
        (this.rng() < 0.02 ? (this.rng() - 0.5) * 6 * intensity : 0));

    // Acoustic disturbance: broadband acoustic energy rise.
    const acousticBurst =
      this.cfg.mode === "acoustic-disturbance" ? intensity : 0;

    const vibX =
      amp * AXIS_GAINS[0] * base + amp * AXIS_GAINS[0] * imbalance * 0.9 + bearing * 0.4;
    const vibY =
      amp * AXIS_GAINS[1] * base * 0.9 + amp * AXIS_GAINS[1] * imbalance * 0.7 + bearing * 0.5;
    const vibZ =
      amp * AXIS_GAINS[2] * base * 0.7 + amp * AXIS_GAINS[2] * imbalance * 0.5 + bearing * 0.3;

    // Acoustic: rotation-locked tone + harmonics + broadband hiss.
    const tone =
      0.5 * Math.sin(this.phase * 0.5) +
      this.smoothAcoustic * 0.4 * Math.sin(2 * this.phase * 0.5 + 0.4) +
      acousticBurst * 1.5 * Math.sin(this.phase * 1.25 + 1.1);
    const hiss = gaussian(this.rng) * (0.08 + noise * 0.5 + acousticBurst * 0.9);
    const acoustic = tone * (0.4 + this.smoothAcoustic) + hiss;

    // Global sensor noise floor.
    const n = noise * 0.25;
    const out = {
      vibration: [
        vibX + gaussian(this.rng) * n,
        vibY + gaussian(this.rng) * n,
        vibZ + gaussian(this.rng) * n,
      ] as [number, number, number],
      acoustic: acoustic + gaussian(this.rng) * n * 0.5,
      mode: this.cfg.mode,
    };
    return out;
  }

  /**
   * Read one window of samples. Each modality becomes a SensorWindow; the
   * vibration window holds 3 interleaved channels, the acoustic one mono.
   */
  readWindow(): { vibration: SensorWindow; acoustic: SensorWindow } {
    const ts = this.t;
    const vib: number[] = [];
    const ac: number[] = [];
    let mode: MachineMode = this.cfg.mode;
    for (let i = 0; i < WINDOW_SIZE; i++) {
      const s = this.readSample();
      mode = s.mode;
      vib.push(s.vibration[0], s.vibration[1], s.vibration[2]);
      ac.push(s.acoustic);
    }
    return {
      vibration: SensorWindowSchema.parse({
        sensor: "ADXL345",
        modality: "vibration",
        timestamp: ts,
        sampleRate: SAMPLE_RATE,
        channels: [...VIBRATION_CHANNELS],
        samples: vib,
        metadata: { machineMode: mode, simulated: true },
      }),
      acoustic: SensorWindowSchema.parse({
        sensor: "INMP441",
        modality: "acoustic",
        timestamp: ts,
        sampleRate: SAMPLE_RATE,
        channels: ["mono"],
        samples: ac,
        metadata: { machineMode: mode, simulated: true },
      }),
    };
  }

  /** Historical method name kept for API compat. */
  readWindowWindow(): { vibration: SensorWindow; acoustic: SensorWindow } {
    return this.readWindow();
  }
}

interface Sample {
  vibration: [number, number, number];
  acoustic: number;
  mode: MachineMode;
}

/* ------------------------------------------------------------------ */
/* Scenario library                                                    */
/* ------------------------------------------------------------------ */

export interface ScenarioStep {
  /** Seconds to hold this configuration. */
  seconds: number;
  config: Partial<SimulatorConfig>;
  label: string;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  steps: ScenarioStep[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: "normal",
    title: "Normal Operation",
    description:
      "Steady baseline: constant speed, low noise, no anomaly. The system should stay HEALTHY.",
    steps: [
      {
        seconds: 30,
        label: "steady normal",
        config: {
          mode: "normal",
          anomalyIntensity: 0,
          vibrationAmplitude: 0.35,
          rotationFrequencyHz: 48,
          acousticEnergy: 0.5,
          noiseLevel: 0.12,
          harmonicStrength: 0.4,
        },
      },
    ],
  },
  {
    id: "increased-load",
    title: "Increased Load",
    description:
      "Heavier load raises vibration amplitude and acoustic energy, rotation slows slightly. Energy features drift up.",
    steps: [
      {
        seconds: 12,
        label: "normal",
        config: {
          mode: "normal",
          anomalyIntensity: 0,
          vibrationAmplitude: 0.35,
          rotationFrequencyHz: 48,
          acousticEnergy: 0.5,
          noiseLevel: 0.12,
          harmonicStrength: 0.4,
        },
      },
      {
        seconds: 20,
        label: "load applied",
        config: {
          mode: "increased-load",
          anomalyIntensity: 0.35,
          vibrationAmplitude: 0.55,
          rotationFrequencyHz: 40,
          acousticEnergy: 0.85,
          noiseLevel: 0.16,
          harmonicStrength: 0.55,
        },
      },
      {
        seconds: 12,
        label: "back to normal",
        config: {
          mode: "normal",
          anomalyIntensity: 0,
          vibrationAmplitude: 0.35,
          rotationFrequencyHz: 48,
          acousticEnergy: 0.5,
          noiseLevel: 0.12,
          harmonicStrength: 0.4,
        },
      },
    ],
  },
  {
    id: "mechanical-imbalance",
    title: "Mechanical Imbalance",
    description:
      "A rotating-mass imbalance drives 1× vibration amplitude up and shifts the dominant frequency. Vibration-only anomaly.",
    steps: [
      {
        seconds: 12,
        label: "normal",
        config: {
          mode: "normal",
          anomalyIntensity: 0,
          vibrationAmplitude: 0.35,
          rotationFrequencyHz: 48,
          acousticEnergy: 0.5,
          noiseLevel: 0.12,
          harmonicStrength: 0.4,
        },
      },
      {
        seconds: 22,
        label: "imbalance develops",
        config: {
          mode: "mechanical-imbalance",
          anomalyIntensity: 0.8,
          vibrationAmplitude: 0.5,
          rotationFrequencyHz: 48,
          acousticEnergy: 0.58,
          noiseLevel: 0.14,
          harmonicStrength: 0.7,
        },
      },
      {
        seconds: 12,
        label: "recovery",
        config: {
          mode: "recovery",
          anomalyIntensity: 0,
          vibrationAmplitude: 0.35,
          rotationFrequencyHz: 48,
          acousticEnergy: 0.5,
          noiseLevel: 0.12,
          harmonicStrength: 0.4,
        },
      },
    ],
  },
  {
    id: "bearing-disturbance",
    title: "Bearing-like Disturbance",
    description:
      "High-frequency impulsive bursts at a characteristic defect rate. Kurtosis and peak rise sharply.",
    steps: [
      {
        seconds: 12,
        label: "normal",
        config: {
          mode: "normal",
          anomalyIntensity: 0,
          vibrationAmplitude: 0.35,
          rotationFrequencyHz: 48,
          acousticEnergy: 0.5,
          noiseLevel: 0.12,
          harmonicStrength: 0.4,
        },
      },
      {
        seconds: 22,
        label: "bearing impulses",
        config: {
          mode: "bearing-disturbance",
          anomalyIntensity: 0.75,
          vibrationAmplitude: 0.42,
          rotationFrequencyHz: 48,
          acousticEnergy: 0.6,
          noiseLevel: 0.15,
          harmonicStrength: 0.45,
        },
      },
      {
        seconds: 12,
        label: "recovery",
        config: {
          mode: "recovery",
          anomalyIntensity: 0,
          vibrationAmplitude: 0.35,
          rotationFrequencyHz: 48,
          acousticEnergy: 0.5,
          noiseLevel: 0.12,
          harmonicStrength: 0.4,
        },
      },
    ],
  },
  {
    id: "acoustic-disturbance",
    title: "Acoustic Disturbance",
    description:
      "Loose panel rattling: acoustic energy jumps while vibration stays near normal. Acoustic-only anomaly.",
    steps: [
      {
        seconds: 12,
        label: "normal",
        config: {
          mode: "normal",
          anomalyIntensity: 0,
          vibrationAmplitude: 0.35,
          rotationFrequencyHz: 48,
          acousticEnergy: 0.5,
          noiseLevel: 0.12,
          harmonicStrength: 0.4,
        },
      },
      {
        seconds: 20,
        label: "rattle develops",
        config: {
          mode: "acoustic-disturbance",
          anomalyIntensity: 0.7,
          vibrationAmplitude: 0.35,
          rotationFrequencyHz: 48,
          acousticEnergy: 1.35,
          noiseLevel: 0.2,
          harmonicStrength: 0.4,
        },
      },
      {
        seconds: 12,
        label: "recovery",
        config: {
          mode: "recovery",
          anomalyIntensity: 0,
          vibrationAmplitude: 0.35,
          rotationFrequencyHz: 48,
          acousticEnergy: 0.5,
          noiseLevel: 0.12,
          harmonicStrength: 0.4,
        },
      },
    ],
  },
  {
    id: "sensor-disagreement",
    title: "Sensor Disagreement",
    description:
      "A sensor fault pattern: vibration swings hard while acoustic stays normal — the fusion layer reports SUSPICIOUS, not a confirmed anomaly.",
    steps: [
      {
        seconds: 12,
        label: "normal",
        config: {
          mode: "normal",
          anomalyIntensity: 0,
          vibrationAmplitude: 0.35,
          rotationFrequencyHz: 48,
          acousticEnergy: 0.5,
          noiseLevel: 0.12,
          harmonicStrength: 0.4,
        },
      },
      {
        seconds: 20,
        label: "vibration-only excursion",
        config: {
          mode: "sensor-disagreement",
          anomalyIntensity: 0.9,
          vibrationAmplitude: 0.75,
          rotationFrequencyHz: 66,
          acousticEnergy: 0.5,
          noiseLevel: 0.12,
          harmonicStrength: 0.4,
        },
      },
      {
        seconds: 12,
        label: "back to normal",
        config: {
          mode: "normal",
          anomalyIntensity: 0,
          vibrationAmplitude: 0.35,
          rotationFrequencyHz: 48,
          acousticEnergy: 0.5,
          noiseLevel: 0.12,
          harmonicStrength: 0.4,
        },
      },
    ],
  },
  {
    id: "signal-degradation",
    title: "Signal Degradation",
    description:
      "Rising electrical noise degrades signal quality; quality scores drop and the fusion layer lowers confidence.",
    steps: [
      {
        seconds: 10,
        label: "clean signal",
        config: {
          mode: "normal",
          anomalyIntensity: 0,
          noiseLevel: 0.12,
          vibrationAmplitude: 0.35,
          rotationFrequencyHz: 48,
          acousticEnergy: 0.5,
          harmonicStrength: 0.4,
        },
      },
      {
        seconds: 18,
        label: "noise rises",
        config: {
          mode: "signal-degradation",
          anomalyIntensity: 0.15,
          noiseLevel: 0.85,
          vibrationAmplitude: 0.35,
          rotationFrequencyHz: 48,
          acousticEnergy: 0.5,
          harmonicStrength: 0.4,
        },
      },
      {
        seconds: 10,
        label: "signal restored",
        config: {
          mode: "normal",
          anomalyIntensity: 0,
          noiseLevel: 0.12,
          vibrationAmplitude: 0.35,
          rotationFrequencyHz: 48,
          acousticEnergy: 0.5,
          harmonicStrength: 0.4,
        },
      },
    ],
  },
  {
    id: "recovery",
    title: "Normal → Anomaly → Recovery",
    description:
      "Full demonstration arc: healthy baseline, gradual imbalance onset, sustained anomaly, then return to normal.",
    steps: [
      {
        seconds: 14,
        label: "healthy baseline",
        config: {
          mode: "normal",
          anomalyIntensity: 0,
          vibrationAmplitude: 0.35,
          rotationFrequencyHz: 48,
          acousticEnergy: 0.5,
          noiseLevel: 0.12,
          harmonicStrength: 0.4,
        },
      },
      {
        seconds: 8,
        label: "onset",
        config: {
          mode: "mechanical-imbalance",
          anomalyIntensity: 0.3,
          vibrationAmplitude: 0.42,
          rotationFrequencyHz: 48,
          acousticEnergy: 0.55,
          noiseLevel: 0.13,
          harmonicStrength: 0.5,
        },
      },
      {
        seconds: 16,
        label: "sustained anomaly",
        config: {
          mode: "mechanical-imbalance",
          anomalyIntensity: 0.85,
          vibrationAmplitude: 0.55,
          rotationFrequencyHz: 52,
          acousticEnergy: 0.7,
          noiseLevel: 0.16,
          harmonicStrength: 0.75,
        },
      },
      {
        seconds: 16,
        label: "recovery",
        config: {
          mode: "recovery",
          anomalyIntensity: 0,
          vibrationAmplitude: 0.35,
          rotationFrequencyHz: 48,
          acousticEnergy: 0.5,
          noiseLevel: 0.12,
          harmonicStrength: 0.4,
        },
      },
    ],
  },
];
