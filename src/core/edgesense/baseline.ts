/**
 * EdgeSense — self-learning normal baseline.
 *
 * Trains one Isolation Forest per sensor on healthy (normal-mode) feature
 * vectors, plus per-feature baseline statistics for visualizations and
 * deviation evidence. PCA is fitted for VISUALIZATION ONLY — the actual
 * anomaly detection is entirely Isolation Forest.
 */
import { IsolationForest } from "./isolation-forest";
import { mean, stdDev } from "./rng";
import {
  type BaselineMetadata,
  type FeatureName,
  type SensorId,
  type SensorWindow,
  FEATURE_VECTOR_ORDER,
} from "./types";
import { extractFeatures } from "./features";
import { fitPca, type PcaModel } from "./pca";
import { SAMPLE_RATE, WINDOW_SECONDS } from "./simulator";

/** One window pair from any source. */
export interface WindowPair {
  vibration: SensorWindow;
  acoustic: SensorWindow;
}

export interface BaselineBundle {
  forests: Record<SensorId, IsolationForest>;
  metadata: BaselineMetadata;
  pca: Record<SensorId, PcaModel | null>;
}

const SENSORS: SensorId[] = ["ADXL345", "INMP441"];

/**
 * Train both sensor forests + stats + PCA from a corpus of normal windows.
 * Feature vectors are extracted from the raw windows so training data and
 * live data flow through the exact same extraction path.
 */
export function trainBaseline(
  corpus: readonly WindowPair[],
  opts: { seed?: number; contamination?: number } = {},
): BaselineBundle {
  if (corpus.length < 10) {
    throw new Error(
      `trainBaseline: need at least 10 normal window pairs, got ${corpus.length}`,
    );
  }
  const seed = opts.seed ?? 42;
  const contamination = opts.contamination ?? 0.02;

  // Extract feature vectors per sensor.
  const perSensor: Record<SensorId, number[][]> = {
    ADXL345: [],
    INMP441: [],
  };

  for (const pair of corpus) {
    for (const window of [pair.vibration, pair.acoustic]) {
      const { features } = extractFeatures(window);
      perSensor[features.sensor].push(FEATURE_VECTOR_ORDER.map((f) => features.values[f]));
    }
  }

  const forests = {} as Record<SensorId, IsolationForest>;
  const stats: BaselineMetadata["stats"] = {
    ADXL345: {} as Record<FeatureName, { mean: number; std: number }>,
    INMP441: {} as Record<FeatureName, { mean: number; std: number }>,
  };
  const thresholds = {} as Record<SensorId, number>;

  for (const sensor of SENSORS) {
    const X = perSensor[sensor];
    if (X.length < 10) {
      throw new Error(`trainBaseline: sensor ${sensor} has too few windows`);
    }

    // Per-feature baseline statistics.
    const featureStats = {} as Record<FeatureName, { mean: number; std: number }>;
    FEATURE_VECTOR_ORDER.forEach((name, j) => {
      const col = X.map((row) => row[j]);
      featureStats[name] = { mean: mean(col), std: stdDev(col) };
    });
    stats[sensor] = featureStats;

    // Train the sensor's Isolation Forest on the raw feature vectors.
    const forest = new IsolationForest();
    forest.fit(X, { seed, nTrees: 60, maxSamples: 256 });
    forests[sensor] = forest;

    // Threshold: score that flags the top `contamination` fraction of the
    // training corpus itself. Anything scoring above this on live data is
    // more anomalous than the worst training samples.
    const scores = X.map((row) => forest.rawScore(row)).sort((a, b) => b - a);
    const idx = Math.min(
      scores.length - 1,
      Math.max(0, Math.floor(scores.length * contamination)),
    );
    thresholds[sensor] = scores[idx];
  }

  // PCA per sensor for the behaviour cloud (visualization only).
  const pca = {} as Record<SensorId, PcaModel | null>;
  for (const sensor of SENSORS) {
    pca[sensor] = fitPca(perSensor[sensor]);
  }

  const metadata: BaselineMetadata = {
    trainedAt: Date.now(),
    sampleCountPerSensor: perSensor.ADXL345.length,
    windowSeconds: WINDOW_SECONDS,
    featureNames: [...FEATURE_VECTOR_ORDER],
    machineMode: "normal",
    stats,
    contamination,
    thresholds,
    estimatorParams: {
      algorithm: "isolation-forest",
      implementation: "edgesense-ts",
      nTrees: 60,
      maxSamples: 256,
      sampleRate: SAMPLE_RATE,
    },
  };

  return { forests, metadata, pca };
}

/**
 * Serialize a trained bundle into a JSON-able payload for persistence.
 */
export function serializeBaseline(bundle: BaselineBundle): Record<string, unknown> {
  return {
    version: 1,
    trainedAt: bundle.metadata.trainedAt,
    metadata: bundle.metadata,
    forests: {
      ADXL345: bundle.forests.ADXL345.serialize(),
      INMP441: bundle.forests.INMP441.serialize(),
    },
    pca: {
      ADXL345: bundle.pca.ADXL345 ?? null,
      INMP441: bundle.pca.INMP441 ?? null,
    },
  };
}

/** Rebuild a trained bundle from its serialized payload. */
export function deserializeBaseline(data: unknown): BaselineBundle {
  const obj = data as {
    metadata: BaselineMetadata;
    forests: Record<SensorId, unknown>;
    pca: Record<SensorId, PcaModel | null>;
  };
  return {
    forests: {
      ADXL345: IsolationForest.deserialize(obj.forests.ADXL345),
      INMP441: IsolationForest.deserialize(obj.forests.INMP441),
    },
    metadata: obj.metadata,
    pca: (obj.pca ?? { ADXL345: null, INMP441: null }) as Record<SensorId, PcaModel | null>,
  };
}
