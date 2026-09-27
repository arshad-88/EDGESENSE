/**
 * Central machine state — the SINGLE source of truth for the simulated motor.
 *
 * Every dashboard element (3D rotation speed, sensor waveforms, features,
 * anomaly scores, sound, status labels) derives from this state. Nothing in
 * the UI hardcodes independent values.
 *
 * Values below are SIMULATED — clearly labelled as such in the UI — until a
 * real ESP32DataProvider replaces the simulation (see sensor-source.ts).
 */

export type Behaviour = "NORMAL" | "HEAVY_LOAD" | "ANOMALY";
export type Power = "OFF" | "STARTING" | "ON" | "STOPPING";

export interface MachineState {
  power: Power;
  behaviour: Behaviour;
  rpm: number;
  vibrationRms: number; // g
  variance: number;
  kurtosis: number;
  peak: number; // g
  dominantFrequency: number; // Hz
  spectralEnergy: number;
  acousticLevel: number; // dB
  vibrationAnomalyScore: number;
  acousticAnomalyScore: number;
  fusedAnomalyScore: number;
  machineStatus: string;
}

export interface BehaviourProfile {
  rpm: number;
  vibrationRms: number;
  dominantFrequency: number;
  spectralEnergy: number;
  acousticLevel: number;
  anomalyScore: number;
  /** Map to the underlying SimulatorConfig knobs the pipeline consumes. */
  sim: {
    mode: "normal" | "increased-load" | "mechanical-imbalance";
    anomalyIntensity: number;
    vibrationAmplitude: number;
    rotationFrequencyHz: number;
    acousticEnergy: number;
    noiseLevel: number;
    harmonicStrength: number;
  };
}

/** Reference simulated behaviour profiles (the spec's target values). */
export const BEHAVIOUR_PROFILES: Record<Behaviour, BehaviourProfile> = {
  NORMAL: {
    rpm: 1450,
    vibrationRms: 0.42,
    dominantFrequency: 48,
    spectralEnergy: 0.18,
    acousticLevel: 52,
    anomalyScore: 0.08,
    sim: {
      mode: "normal",
      anomalyIntensity: 0,
      vibrationAmplitude: 0.35,
      rotationFrequencyHz: 48,
      acousticEnergy: 0.5,
      noiseLevel: 0.12,
      harmonicStrength: 0.4,
    },
  },
  HEAVY_LOAD: {
    rpm: 1320,
    vibrationRms: 0.78,
    dominantFrequency: 51,
    spectralEnergy: 0.41,
    acousticLevel: 68,
    anomalyScore: 0.34,
    sim: {
      mode: "increased-load",
      anomalyIntensity: 0.35,
      vibrationAmplitude: 0.55,
      rotationFrequencyHz: 51,
      acousticEnergy: 0.9,
      noiseLevel: 0.16,
      harmonicStrength: 0.55,
    },
  },
  ANOMALY: {
    rpm: 1510,
    vibrationRms: 1.46,
    dominantFrequency: 74,
    spectralEnergy: 0.92,
    acousticLevel: 87,
    anomalyScore: 0.94,
    sim: {
      mode: "mechanical-imbalance",
      anomalyIntensity: 0.85,
      vibrationAmplitude: 0.6,
      rotationFrequencyHz: 74,
      acousticEnergy: 1.15,
      noiseLevel: 0.18,
      harmonicStrength: 0.8,
    },
  },
};

export const BEHAVIOUR_LABELS: Record<Behaviour, string> = {
  NORMAL: "NORMAL",
  HEAVY_LOAD: "HEAVY LOAD",
  ANOMALY: "ANOMALY",
};

export const STARTUP_STEPS = [
  "INITIALIZING MACHINE",
  "STARTING ROTOR",
  "ACTIVATING SENSORS",
  "ACQUIRING SIGNAL",
  "ANALYZING BEHAVIOUR",
  "MACHINE RUNNING",
] as const;

/** Transition smoothing factor per tick (0..1): how fast values approach targets. */
const ALPHA = 0.08;

/**
 * Mutable transition helper: current values ease toward profile targets so
 * behaviour changes feel like a real machine spooling up/down, not a switch.
 */
export class MachineStateEngine {
  state: MachineState = {
    power: "OFF",
    behaviour: "NORMAL",
    rpm: 0,
    vibrationRms: 0,
    variance: 0,
    kurtosis: 0,
    peak: 0,
    dominantFrequency: 0,
    spectralEnergy: 0,
    acousticLevel: 0,
    vibrationAnomalyScore: 0,
    acousticAnomalyScore: 0,
    fusedAnomalyScore: 0,
    machineStatus: "STANDBY",
  };

  private noiseT = Math.random() * 1000;

  /** Advance smoothing one tick (call ~4×/s). */
  tick(power: Power, behaviour: Behaviour): MachineState {
    const s = this.state;
    s.power = power;
    s.behaviour = behaviour;
    const p = BEHAVIOUR_PROFILES[behaviour];
    const running = power === "ON" || power === "STARTING";
    const target = (v: number) => (running ? v : 0);
    const ease = (cur: number, tgt: number) => cur + (tgt - cur) * ALPHA;

    s.rpm = ease(s.rpm, target(p.rpm));
    s.vibrationRms = ease(s.vibrationRms, target(p.vibrationRms));
    s.dominantFrequency = ease(s.dominantFrequency, target(p.dominantFrequency));
    s.spectralEnergy = ease(s.spectralEnergy, target(p.spectralEnergy));
    s.acousticLevel = ease(s.acousticLevel, target(p.acousticLevel));
    s.variance = ease(s.variance, target(p.vibrationRms * p.vibrationRms * 0.55));
    s.kurtosis = ease(s.kurtosis, target(3 + p.anomalyScore * 5.2));
    s.peak = ease(s.peak, target(p.vibrationRms * (2.6 + p.anomalyScore * 1.8)));
    s.vibrationAnomalyScore = ease(s.vibrationAnomalyScore, target(Math.min(0.97, p.anomalyScore + 0.03)));
    s.acousticAnomalyScore = ease(s.acousticAnomalyScore, target(Math.min(0.94, p.anomalyScore * 0.94)));
    s.fusedAnomalyScore = ease(
      s.fusedAnomalyScore,
      target(
        Math.min(0.96, p.anomalyScore * 0.65 + Math.max(s.vibrationAnomalyScore, s.acousticAnomalyScore) * 0.35),
      ),
    );

    // Live jitter so readouts never look frozen.
    this.noiseT += 1;
    const j = (amp: number) =>
      Math.sin(this.noiseT * 0.7) * amp + Math.sin(this.noiseT * 1.9) * amp * 0.5;
    s.vibrationRms = Math.max(0, s.vibrationRms * (1 + j(0.03)));
    s.acousticLevel = Math.max(0, s.acousticLevel + j(0.6));
    s.rpm = Math.max(0, s.rpm + j(running ? 6 : 0));

    s.machineStatus = !running
      ? "STANDBY"
      : power === "STARTING"
        ? "STARTING"
        : s.fusedAnomalyScore > 0.7
          ? "ANOMALY DETECTED"
          : s.fusedAnomalyScore > 0.28
            ? "LOAD INCREASED"
            : "RUNNING";
    return { ...s };
  }
}
