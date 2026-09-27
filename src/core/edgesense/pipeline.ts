/**
 * EdgeSense — pipeline engine.
 *
 * Orchestrates: SensorSource → windows → feature extraction → sensor-wise
 * Isolation Forest scoring → multimodal fusion → investigation. Maintains ring
 * buffers for history, heatmap, cloud and fingerprint data.
 *
 * The pipeline is source-agnostic: pass it any SensorSource (synthetic, CSV
 * replay, future ESP32) and the flow is identical.
 */
import {
  type AnomalyResult,
  type BaselineMetadata,
  type CloudPoint,
  type FeatureName,
  type FeatureVector,
  type FusionResult,
  type HeatmapRow,
  type InvestigationResult,
  type MachineMode,
  type SensorId,
  type SensorQuality,
  type SensorWindow,
  type SimulatorConfig,
  type Spectrum,
  FEATURE_VECTOR_ORDER,
} from "./types";
import { extractFeatures } from "./features";
import type { SpectrumResult } from "./dsp";
import { IsolationForest } from "./isolation-forest";
import type { BaselineBundle } from "./baseline";
import { fuseResults } from "./fusion";
import { investigate } from "./investigation";
import { clamp } from "./rng";

export interface PipelineFrame {
  timestamp: number;
  machineMode: MachineMode;
  vibration: {
    features: FeatureVector;
    spectrum: Spectrum;
    anomaly: AnomalyResult;
    samples: number[];
  };
  acoustic: {
    features: FeatureVector;
    spectrum: Spectrum;
    anomaly: AnomalyResult;
    samples: number[];
  };
  fusion: FusionResult;
  investigation: InvestigationResult;
}

export interface PipelineSnapshot {
  frames: PipelineFrame[];
  latest: PipelineFrame | null;
  heatmap: HeatmapRow[];
  cloud: { baseline: CloudPoint[]; live: CloudPoint[]; trajectory: CloudPoint[] };
  fingerprint: {
    vibration: FingerprintBarLite[];
    acoustic: FingerprintBarLite[];
  };
  needsBaseline: boolean;
}

/** Per-sensor, per-feature deviation row key ("ADXL345:rms"). */
export type HeatmapCellKey = string;

const HISTORY_LIMIT = 180; // ~3 minutes of 1s windows
const CLOUD_BASELINE_LIMIT = 600;
const CLOUD_LIVE_LIMIT = 120;
const TRAJECTORY_LIMIT = 20;

export class EdgeSensePipeline {
  private bundle: BaselineBundle | null = null;
  private frames: PipelineFrame[] = [];
  private heatmap: HeatmapRow[] = [];
  private cloudBaseline: CloudPoint[] = [];
  private cloudLive: CloudPoint[] = [];
  /** Consecutive anomaly count per sensor for "sustained" reasoning. */
  private anomalyStreak: Record<SensorId, number> = { ADXL345: 0, INMP441: 0 };

  setBaseline(bundle: BaselineBundle): void {
    this.bundle = bundle;
    this.frames = [];
    this.heatmap = [];
    this.anomalyStreak = { ADXL345: 0, INMP441: 0 };
    this.cloudLive = [];
  }

  get hasBaseline(): boolean {
    return this.bundle !== null;
  }

  get metadata(): BaselineMetadata | null {
    return this.bundle?.metadata ?? null;
  }

  /**
   * Process one window pair through the full pipeline.
   * Returns null if no baseline has been trained yet.
   */
  process(
    vibration: SensorWindow,
    acoustic: SensorWindow,
  ): PipelineFrame | null {
    if (!this.bundle) return null;

    const vibOut = extractFeatures(vibration);
    const acOut = extractFeatures(acoustic);

    const vibAnomaly = this.scoreSensor("ADXL345", vibOut.features);
    const acAnomaly = this.scoreSensor("INMP441", acOut.features);

    const fusion = fuseResults(vibAnomaly, acAnomaly);
    this.updateStreaks(fusion);

    const investigation = investigate({
      vibrationFeatures: vibOut.features,
      acousticFeatures: acOut.features,
      vibrationAnomaly: vibAnomaly,
      acousticAnomaly: acAnomaly,
      fusion,
      vibrationBaseline: this.bundle.metadata.stats.ADXL345,
      acousticBaseline: this.bundle.metadata.stats.INMP441,
      vibrationSpectrum: toSpectrum(vibOut.spectrum),
      acousticSpectrum: toSpectrum(acOut.spectrum),
      vibrationStreak: this.anomalyStreak.ADXL345,
      acousticStreak: this.anomalyStreak.INMP441,
    });

    const frame: PipelineFrame = {
      timestamp: vibration.timestamp,
      machineMode: vibration.metadata.machineMode,
      vibration: {
        features: vibOut.features,
        spectrum: toSpectrum(vibOut.spectrum),
        anomaly: vibAnomaly,
        samples: downsample(vibration.samples, 128),
      },
      acoustic: {
        features: acOut.features,
        spectrum: toSpectrum(acOut.spectrum),
        anomaly: acAnomaly,
        samples: downsample(acoustic.samples, 128),
      },
      fusion,
      investigation,
    };

    this.pushHistory(frame);
    this.pushCloud(vibOut.features, acOut.features, fusion);
    const vibDev = computeDeviations(vibOut.features, this.bundle.metadata.stats.ADXL345);
    const acDev = computeDeviations(acOut.features, this.bundle.metadata.stats.INMP441);
    this.pushHeatmap(vibOut.features, acOut.features, vibDev, acDev, fusion);

    return frame;
  }

  private scoreSensor(sensor: SensorId, features: FeatureVector): AnomalyResult {
    const forest = this.bundle!.forests[sensor];
    const x = FEATURE_VECTOR_ORDER.map((f) => features.values[f]);
    const raw = forest.rawScore(x);
    const indicator = clamp(forest.anomalyIndicator(raw), 0, 1);
    const threshold = this.bundle!.metadata.thresholds[sensor];
    const isAnomaly = raw > threshold;

    // Feature deviations vs baseline, strongest first.
    const stats = this.bundle!.metadata.stats[sensor];
    const evidence = FEATURE_VECTOR_ORDER.map((name) => {
      const baseline = stats[name].mean;
      const value = features.values[name];
      const deviation = baseline > 1e-9 ? (value - baseline) / baseline : 0;
      return { name, baseline, value, deviation };
    })
      .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))
      .slice(0, 4)
      .map((e) => ({
        name: e.name as FeatureName,
        sensor,
        timestamp: features.timestamp,
        units: "",
        baseline: e.baseline,
        value: e.value,
        deviation: e.deviation,
      }));

    return {
      sensor,
      timestamp: features.timestamp,
      rawScore: raw,
      anomalyIndicator: indicator,
      isAnomaly,
      threshold,
      quality: features.quality,
      evidence,
    };
  }

  private updateStreaks(fusion: FusionResult): void {
    for (const s of ["ADXL345", "INMP441"] as SensorId[]) {
      const flagged =
        s === "ADXL345" ? fusion.vibration.isAnomaly : fusion.acoustic.isAnomaly;
      this.anomalyStreak[s] = flagged ? this.anomalyStreak[s] + 1 : 0;
    }
  }

  private pushHistory(frame: PipelineFrame): void {
    this.frames.push(frame);
    if (this.frames.length > HISTORY_LIMIT) this.frames.shift();
  }

  private pushCloud(vib: FeatureVector, ac: FeatureVector, fusion: FusionResult): void {
    if (!this.bundle) return;
    for (const [features, sensor] of [
      [vib, "ADXL345"],
      [ac, "INMP441"],
    ] as const) {
      const pca = this.bundle.pca[sensor];
      if (!pca) continue;
      const x = FEATURE_VECTOR_ORDER.map((f) => features.values[f]);
      const { pc1, pc2 } = projectSafe(pca, x);
      const point: CloudPoint = {
        pc1,
        pc2,
        kind: "live",
        sensor,
        timestamp: features.timestamp,
        isAnomaly: sensor === "ADXL345"
          ? fusion.vibration.isAnomaly
          : fusion.acoustic.isAnomaly,
      };
      this.cloudLive.push(point);
    }
    while (this.cloudLive.length > CLOUD_LIVE_LIMIT) this.cloudLive.shift();
  }

  /** Seed the behaviour cloud with training-data projections. */
  seedCloudBaseline(points: CloudPoint[]): void {
    this.cloudBaseline = points.slice(-CLOUD_BASELINE_LIMIT);
  }

  private pushHeatmap(
    vib: FeatureVector,
    ac: FeatureVector,
    vibDev: Record<string, number>,
    acDev: Record<string, number>,
    fusion: FusionResult,
  ): void {
    // Per-sensor keys ("ADXL345:rms") so both modalities stay independent.
    const deviations: Record<string, number> = {};
    for (const f of FEATURE_VECTOR_ORDER) {
      deviations[`ADXL345:${f}`] = vibDev[f] ?? 0;
      deviations[`INMP441:${f}`] = acDev[f] ?? 0;
    }
    this.heatmap.push({
      timestamp: vib.timestamp,
      deviations,
      state: fusion.state,
    });
    while (this.heatmap.length > HISTORY_LIMIT) this.heatmap.shift();
  }

  snapshot(): PipelineSnapshot {
    const latest = this.frames[this.frames.length - 1] ?? null;
    return {
      frames: this.frames,
      latest,
      heatmap: this.heatmap,
      cloud: {
        baseline: this.cloudBaseline,
        live: this.cloudLive,
        trajectory: this.cloudLive.slice(-TRAJECTORY_LIMIT),
      },
      fingerprint: latest ? buildFingerprint(latest, this.bundle!.metadata) : { vibration: [], acoustic: [] },
      needsBaseline: !this.bundle,
    };
  }
}

export interface FingerprintBarLite {
  feature: FeatureName;
  baseline: number;
  current: number;
  deviation: number;
}

function buildFingerprint(
  frame: PipelineFrame,
  metadata: BaselineMetadata,
): { vibration: FingerprintBarLite[]; acoustic: FingerprintBarLite[] } {
  const build = (sensor: SensorId, features: FeatureVector) =>
    FEATURE_VECTOR_ORDER.map((f) => ({
      feature: f,
      baseline: metadata.stats[sensor][f].mean,
      current: features.values[f],
      deviation:
        metadata.stats[sensor][f].mean > 1e-9
          ? (features.values[f] - metadata.stats[sensor][f].mean) /
            metadata.stats[sensor][f].mean
          : 0,
    }));
  return {
    vibration: build("ADXL345", frame.vibration.features),
    acoustic: build("INMP441", frame.acoustic.features),
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function toSpectrum(s: SpectrumResult): Spectrum {
  // Downsample spectrum to ~128 points for the chart.
  const target = 128;
  const n = s.frequencies.length;
  const step = Math.max(1, Math.floor(n / target));
  const frequencies: number[] = [];
  const magnitudes: number[] = [];
  for (let i = 0; i < n; i += step) {
    let fMax = 0;
    let mMax = 0;
    for (let k = i; k < Math.min(i + step, n); k++) {
      if (s.magnitudes[k] > mMax) {
        mMax = s.magnitudes[k];
        fMax = s.frequencies[k];
      }
    }
    frequencies.push(fMax);
    magnitudes.push(mMax);
  }
  return {
    frequencies,
    magnitudes,
    dominantFrequency: s.dominantFrequency,
    spectralEnergy: s.spectralEnergy,
  };
}

function computeDeviations(
  features: FeatureVector,
  stats: Record<FeatureName, { mean: number; std: number }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of FEATURE_VECTOR_ORDER) {
    const baseline = stats[f].mean;
    out[f] = baseline > 1e-9 ? (features.values[f] - baseline) / baseline : 0;
  }
  return out;
}

function downsample(samples: readonly number[], target: number): number[] {
  if (samples.length <= target) return [...samples];
  const step = samples.length / target;
  const out: number[] = [];
  for (let i = 0; i < target; i++) {
    out.push(samples[Math.floor(i * step)]);
  }
  return out;
}

function projectSafe(
  pca: { mean: number[]; components: number[][] },
  x: readonly number[],
): { pc1: number; pc2: number } {
  const c = x.map((v, j) => v - (pca.mean[j] ?? 0));
  const pc1 = c.reduce((acc, v, j) => acc + v * (pca.components[0]?.[j] ?? 0), 0);
  const pc2 = c.reduce((acc, v, j) => acc + v * (pca.components[1]?.[j] ?? 0), 0);
  return { pc1, pc2 };
}
