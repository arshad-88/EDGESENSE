/**
 * EdgeSense core tests: DSP, features, simulator, Isolation Forest, baseline
 * training, fusion, investigation, and end-to-end pipeline behaviour.
 */
import { describe, expect, it } from "vitest";
import { computeSpectrum, computeTimeFeatures, fftInPlace } from "../dsp";
import { extractFeatures } from "../features";
import { SyntheticSensorSource } from "../simulator";
import { IsolationForest } from "../isolation-forest";
import { trainBaseline } from "../baseline";
import { fuseResults } from "../fusion";
import { EdgeSensePipeline } from "../pipeline";
import type { AnomalyResult } from "../types";

const SENSORS = ["ADXL345", "INMP441"] as const;

function makeAnomaly(
  sensor: (typeof SENSORS)[number],
  isAnomaly: boolean,
  qualityScore = 1,
): AnomalyResult {
  return {
    sensor,
    timestamp: 0,
    rawScore: isAnomaly ? 0.9 : 0.4,
    anomalyIndicator: isAnomaly ? 0.9 : 0.2,
    isAnomaly,
    threshold: 0.6,
    quality: {
      sensor,
      score: qualityScore,
      saturated: false,
      flatline: false,
      clippedRatio: 0,
      note: "test",
    },
    evidence: [],
  };
}

/* ------------------------------ DSP ------------------------------ */

describe("FFT", () => {
  it("recovers a pure sine's frequency", () => {
    const n = 512;
    const fs = 512;
    const f0 = 64; // exactly one bin per 8 samples
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      re[i] = Math.sin((2 * Math.PI * f0 * i) / fs);
    }
    fftInPlace(re, im);
    const half = n >> 1;
    const mags: number[] = [];
    for (let k = 0; k < half; k++) {
      mags.push(Math.sqrt(re[k] * re[k] + im[k] * im[k]));
    }
    const peak = mags.indexOf(Math.max(...mags));
    const peakHz = (peak * fs) / n;
    expect(Math.abs(peakHz - f0)).toBeLessThan(2);
  });

  it("computeSpectrum finds the dominant frequency of a mixed signal", () => {
    const fs = 512;
    const n = 512;
    const samples: number[] = [];
    for (let i = 0; i < n; i++) {
      samples.push(
        Math.sin((2 * Math.PI * 48 * i) / fs) +
          0.3 * Math.sin((2 * Math.PI * 96 * i) / fs),
      );
    }
    const spec = computeSpectrum(samples, fs);
    expect(Math.abs(spec.dominantFrequency - 48)).toBeLessThan(4);
    expect(spec.spectralEnergy).toBeGreaterThan(0);
  });
});

describe("time features", () => {
  it("computes RMS of a unit sine correctly", () => {
    const n = 1024;
    const samples: number[] = [];
    for (let i = 0; i < n; i++) {
      samples.push(Math.sin((2 * Math.PI * 10 * i) / n));
    }
    const { rms, variance } = computeTimeFeatures(samples);
    expect(rms).toBeCloseTo(Math.SQRT1_2, 2);
    expect(variance).toBeCloseTo(0.5, 2);
  });

  it("flags impulsive signals with higher kurtosis than a sine", () => {
    const sine: number[] = [];
    const spiky: number[] = [];
    for (let i = 0; i < 512; i++) {
      sine.push(Math.sin((2 * Math.PI * 8 * i) / 512));
      spiky.push(i % 64 === 0 ? 5 : 0.01 * Math.sin(i));
    }
    expect(computeTimeFeatures(spiky).kurtosis).toBeGreaterThan(
      computeTimeFeatures(sine).kurtosis,
    );
  });
});

/* --------------------------- Simulator --------------------------- */

describe("synthetic simulator", () => {
  it("produces meaningful periodic signals, not pure noise", () => {
    const src = new SyntheticSensorSource(42);
    const { vibration } = src.readWindow();
    const spec = computeSpectrum(
      // combine x channel
      vibration.samples.filter((_, i) => i % 3 === 0),
      512,
    );
    // A periodic component should carry far more energy than an
    // equal-amplitude white-noise signal would concentrate.
    expect(spec.dominantFrequency).toBeGreaterThan(5);
    expect(spec.spectralEnergy).toBeGreaterThan(0.001);
  });

  it("imbalance raises vibration RMS vs normal", () => {
    const normal = new SyntheticSensorSource(7);
    const imbalanced = new SyntheticSensorSource(7);
    imbalanced.setConfig({ mode: "mechanical-imbalance", anomalyIntensity: 0.9 });

    // Warm up smoothing, then average RMS over a few windows.
    const rmsOf = (src: SyntheticSensorSource) => {
      let sum = 0;
      const runs = 6;
      for (let i = 0; i < runs; i++) {
        const { vibration } = src.readWindow();
        sum += extractFeatures(vibration).features.values.rms;
      }
      return sum / runs;
    };
    // Skip the first window so parameter smoothing settles.
    normal.readWindow();
    imbalanced.readWindow();
    expect(rmsOf(imbalanced)).toBeGreaterThan(rmsOf(normal) * 1.3);
  });

  it("acoustic disturbance raises acoustic spectral energy", () => {
    const normal = new SyntheticSensorSource(9);
    const noisy = new SyntheticSensorSource(9);
    noisy.setConfig({ mode: "acoustic-disturbance", anomalyIntensity: 0.8 });
    normal.readWindow();
    noisy.readWindow();
    const energyOf = (src: SyntheticSensorSource) => {
      let sum = 0;
      for (let i = 0; i < 5; i++) {
        const { acoustic } = src.readWindow();
        sum += extractFeatures(acoustic).features.values.spectralEnergy;
      }
      return sum / 5;
    };
    expect(energyOf(noisy)).toBeGreaterThan(energyOf(normal) * 1.5);
  });
});

/* ------------------------ Isolation Forest ------------------------ */

describe("Isolation Forest", () => {
  const clusterA = () => [1 + Math.random() * 0.2, 2 + Math.random() * 0.2];
  const outlier = [8, 9];

  it("treats in-distribution samples as normal", () => {
    const X = Array.from({ length: 200 }, clusterA);
    const f = new IsolationForest();
    f.fit(X, { seed: 1, nTrees: 50 });
    const s = f.rawScore(clusterA());
    expect(s).toBeLessThan(0.6);
  });

  it("scores a far outlier as clearly anomalous", () => {
    const X = Array.from({ length: 200 }, clusterA);
    const f = new IsolationForest();
    f.fit(X, { seed: 1, nTrees: 50 });
    const s = f.rawScore(outlier);
    expect(s).toBeGreaterThan(0.62);
  });

  it("survives serialization round-trip", () => {
    const X = Array.from({ length: 100 }, clusterA);
    const f = new IsolationForest();
    f.fit(X, { seed: 3 });
    const restored = IsolationForest.deserialize(JSON.parse(JSON.stringify(f.serialize())));
    const x = clusterA();
    expect(restored.rawScore(x)).toBeCloseTo(f.rawScore(x), 10);
  });
});

/* ---------------------------- Baseline ---------------------------- */

function collectNormalCorpus(count: number) {
  const src = new SyntheticSensorSource(42);
  // Warm-up so smoothed parameters settle.
  src.readWindow();
  return Array.from({ length: count }, () => src.readWindow());
}

describe("baseline training", () => {
  it("trains per-sensor forests with metadata", () => {
    const corpus = collectNormalCorpus(30);
    const bundle = trainBaseline(corpus);
    expect(bundle.forests.ADXL345.isTrained).toBe(true);
    expect(bundle.forests.INMP441.isTrained).toBe(true);
    expect(bundle.metadata.sampleCountPerSensor).toBe(30);
    expect(bundle.metadata.thresholds.ADXL345).toBeGreaterThan(0);
  });

  it("scores normal live data as normal", () => {
    const corpus = collectNormalCorpus(40);
    const bundle = trainBaseline(corpus);
    const live = collectNormalCorpus(10);
    const { features } = extractFeatures(live[0].vibration);
    const x = bundle.metadata.featureNames.map((f) => features.values[f as keyof typeof features.values]);
    const score = bundle.forests.ADXL345.rawScore(x);
    expect(score).toBeLessThan(bundle.metadata.thresholds.ADXL345 + 0.05);
  });
});

/* ----------------------------- Fusion ----------------------------- */

describe("sensor fusion", () => {
  it("healthy + healthy → healthy", () => {
    const r = fuseResults(makeAnomaly("ADXL345", false), makeAnomaly("INMP441", false));
    expect(r.state).toBe("healthy");
    expect(r.sensorsAgree).toBe(true);
  });

  it("vibration-only → suspicious (disagreement)", () => {
    const r = fuseResults(makeAnomaly("ADXL345", true), makeAnomaly("INMP441", false));
    expect(r.state).toBe("suspicious");
    expect(r.decision).toBe("suspicious-vibration");
    expect(r.sensorsAgree).toBe(false);
  });

  it("acoustic-only → suspicious (disagreement)", () => {
    const r = fuseResults(makeAnomaly("ADXL345", false), makeAnomaly("INMP441", true));
    expect(r.decision).toBe("suspicious-acoustic");
  });

  it("both → corroborated anomaly", () => {
    const r = fuseResults(makeAnomaly("ADXL345", true), makeAnomaly("INMP441", true));
    expect(r.state).toBe("corroborated-anomaly");
    expect(r.sensorAgreement).toBe(2);
  });

  it("low quality suppresses a flag", () => {
    const r = fuseResults(
      makeAnomaly("ADXL345", true, 0.2),
      makeAnomaly("INMP441", false),
    );
    expect(r.decision).not.toBe("corroborated-anomaly");
    expect(r.qualityConsidered).toBe(true);
  });
});

/* ---------------------------- Pipeline ---------------------------- */

describe("pipeline end-to-end", () => {
  it("returns null before a baseline exists", () => {
    const p = new EdgeSensePipeline();
    const src = new SyntheticSensorSource(42);
    const { vibration, acoustic } = src.readWindow();
    expect(p.process(vibration, acoustic)).toBeNull();
  });

  it("stays healthy on normal data", () => {
    const corpus = collectNormalCorpus(40);
    const bundle = trainBaseline(corpus);
    const p = new EdgeSensePipeline();
    p.setBaseline(bundle);

    const src = new SyntheticSensorSource(99);
    src.readWindow(); // warm-up
    let anomalies = 0;
    for (let i = 0; i < 20; i++) {
      const { vibration, acoustic } = src.readWindow();
      const frame = p.process(vibration, acoustic);
      if (frame?.fusion.state !== "healthy") anomalies++;
    }
    // Normal data should be overwhelmingly classified healthy; allow rare
    // single-window flaps but never a corroborated anomaly.
    const corroborated = p
      .snapshot()
      .frames.filter((f) => f.fusion.state === "corroborated-anomaly").length;
    expect(corroborated).toBe(0);
    expect(anomalies).toBeLessThanOrEqual(4);
  });

  it("detects a strong sustained mechanical imbalance", () => {
    const corpus = collectNormalCorpus(40);
    const bundle = trainBaseline(corpus);
    const p = new EdgeSensePipeline();
    p.setBaseline(bundle);

    const src = new SyntheticSensorSource(5);
    src.readWindow();
    src.setConfig({ mode: "mechanical-imbalance", anomalyIntensity: 1.0 });

    let corroborated = 0;
    let suspicious = 0;
    for (let i = 0; i < 15; i++) {
      const { vibration, acoustic } = src.readWindow();
      const frame = p.process(vibration, acoustic);
      if (frame?.fusion.state === "corroborated-anomaly") corroborated++;
      else if (frame?.fusion.state === "suspicious") suspicious++;
    }
    // Strong vibration anomaly should at minimum raise suspicion, and given
    // coupled acoustic energy rise, should often corroborate.
    expect(corroborated + suspicious).toBeGreaterThan(5);
  });

  it("produces an investigation with real evidence on anomaly", () => {
    const corpus = collectNormalCorpus(40);
    const bundle = trainBaseline(corpus);
    const p = new EdgeSensePipeline();
    p.setBaseline(bundle);

    const src = new SyntheticSensorSource(5);
    src.readWindow();
    src.setConfig({ mode: "mechanical-imbalance", anomalyIntensity: 1.0 });

    let found: ReturnType<EdgeSensePipeline["process"]> = null;
    for (let i = 0; i < 15 && !found; i++) {
      const { vibration, acoustic } = src.readWindow();
      const frame = p.process(vibration, acoustic);
      if (frame && frame.fusion.state !== "healthy") found = frame;
    }
    expect(found).not.toBeNull();
    expect(found!.investigation.headline).not.toBe("HEALTHY");
    expect(found!.investigation.primaryEvidence.length).toBeGreaterThan(0);
    expect(found!.investigation.caveat).toContain("future work");
    // Never claims a specific fault.
    expect(found!.investigation.narrative).not.toMatch(/bearing (failed|failure)/i);
  });
});
