/**
 * Adaptive edge-assisted data transmission — policy tests.
 *
 * The three behaviours that matter: redundant windows are dropped, the detail
 * level adapts to link pressure, and an anomaly is never dropped or summarised
 * away no matter how tight the budget is.
 */
import { describe, expect, it } from "vitest";
import { EdgeTransmitter } from "../edge-transmitter";
import type { PipelineFrame } from "../pipeline";
import type { FusionDecision, MachineMode, SensorId } from "../types";

interface FrameOpts {
  t: number;
  /** Multiplies every feature value — 1 = identical to the previous frame. */
  scale?: number;
  decision?: FusionDecision;
  vibIndicator?: number;
  acoIndicator?: number;
  /** Raw samples per modality; drives the raw-bytes comparison. */
  samples?: number;
  /** Deviation reported on each feature, used for the evidence payload. */
  deviation?: number;
}

const FEATURES = [
  "rms",
  "variance",
  "peak",
  "kurtosis",
  "dominantFreq",
  "spectralEnergy",
] as const;

function makeFrame(o: FrameOpts): PipelineFrame {
  const scale = o.scale ?? 1;
  const n = o.samples ?? 512;
  const decision = o.decision ?? "healthy";
  const vib = o.vibIndicator ?? 0.1;
  const aco = o.acoIndicator ?? 0.1;
  const dev = o.deviation ?? 0.02;

  const values = () => {
    const v = {} as Record<(typeof FEATURES)[number], number>;
    for (const f of FEATURES) v[f] = [0.4, 0.16, 1.2, 3.1, 48, 0.7][FEATURES.indexOf(f)] * scale;
    return v;
  };

  const side = (
    sensor: SensorId,
    modality: "vibration" | "acoustic",
    indicator: number,
  ) => {
    const vals = values();
    return {
      features: {
        sensor,
        modality,
        timestamp: o.t,
        values: vals,
        quality: {
          sensor,
          score: 1,
          saturated: false,
          flatline: false,
          clippedRatio: 0,
          note: "test",
        },
      },
      spectrum: {
        frequencies: [0, 48, 96],
        magnitudes: [0.1, 1, 0.2],
        dominantFrequency: 48,
        spectralEnergy: 0.7,
      },
      anomaly: {
        sensor,
        timestamp: o.t,
        rawScore: 1 - indicator,
        anomalyIndicator: indicator,
        isAnomaly: indicator > 0.6,
        threshold: 0.6,
        quality: {
          sensor,
          score: 1,
          saturated: false,
          flatline: false,
          clippedRatio: 0,
          note: "test",
        },
        evidence: FEATURES.map((name) => ({
          name,
          value: vals[name],
          sensor,
          timestamp: o.t,
          units: "u",
          baseline: vals[name] / (1 + dev),
          deviation: dev,
        })),
      },
      samples: new Array<number>(n).fill(scale),
    };
  };

  const vibration = side("ADXL345", "vibration", vib);
  const acoustic = side("INMP441", "acoustic", aco);

  return {
    timestamp: o.t,
    machineMode: "normal" as MachineMode,
    vibration,
    acoustic,
    fusion: {
      timestamp: o.t,
      state: decision === "healthy" ? "healthy" : decision === "corroborated-anomaly" ? "corroborated-anomaly" : "suspicious",
      decision,
      vibration: vibration.anomaly,
      acoustic: acoustic.anomaly,
      sensorAgreement: decision === "healthy" ? 0 : 1,
      sensorsAgree: decision !== "sensor-disagreement" as never,
      qualityConsidered: true,
      summary: "test",
    },
    investigation: {
      timestamp: o.t,
      decision: decision === "healthy" ? "healthy" : "suspicious",
      headline: "test",
      narrative: "test",
      primaryEvidence: [],
      supportingEvidence: [],
      sensorAgreement: "test",
      sustainedSeconds: 0,
      qualityNotes: [],
      caveat: "test",
    },
  };
}

describe("adaptive edge-assisted transmission", () => {
  it("always transmits the first window", () => {
    const tx = new EdgeTransmitter();
    const { packet } = tx.step(makeFrame({ t: 0 }));
    expect(packet).not.toBeNull();
    expect(tx.snapshot().transmitted).toBe(1);
  });

  it("suppresses a window identical to the last one it sent", () => {
    const tx = new EdgeTransmitter();
    tx.step(makeFrame({ t: 0 }));
    const second = tx.step(makeFrame({ t: 1, scale: 1 }));
    expect(second.packet).toBeNull();
    expect(tx.snapshot().suppressed).toBe(1);
  });

  it("transmits again once something actually changes", () => {
    const tx = new EdgeTransmitter();
    tx.step(makeFrame({ t: 0 }));
    const { packet } = tx.step(makeFrame({ t: 1, scale: 1.4 }));
    expect(packet).not.toBeNull();
  });

  it("never suppresses an anomaly, even when identical to the last frame", () => {
    const tx = new EdgeTransmitter();
    tx.step(makeFrame({ t: 0, decision: "healthy" }));
    // Same values, but the machine has gone anomalous.
    const { packet } = tx.step(
      makeFrame({ t: 1, scale: 1, decision: "corroborated-anomaly", vibIndicator: 0.9, acoIndicator: 0.9 }),
    );
    expect(packet).not.toBeNull();
    expect(packet!.decision).toBe("corroborated-anomaly");
  });

  it("escalates to features, then to features + evidence", () => {
    const tx = new EdgeTransmitter();
    const suspicious = tx.step(
      makeFrame({ t: 0, decision: "suspicious-vibration", vibIndicator: 0.65, acoIndicator: 0.2 }),
    );
    expect(suspicious.packet!.level).toBe("features");
    expect(suspicious.packet!.features).toBeDefined();
    expect(suspicious.packet!.evidence).toBeUndefined();

    const critical = tx.step(
      makeFrame({ t: 1, decision: "corroborated-anomaly", vibIndicator: 0.95, acoIndicator: 0.92, deviation: 0.4 }),
    );
    expect(critical.packet!.level).toBe("critical");
    expect(critical.packet!.evidence!.length).toBeGreaterThan(0);
  });

  it("keeps reporting anomalies even when the link budget is exhausted", () => {
    // A deliberately tiny budget, so the link is permanently saturated.
    const tx = new EdgeTransmitter({ budgetBytesPerSecond: 1 });
    for (let i = 0; i < 20; i++) {
      tx.step(makeFrame({ t: i, scale: 1, decision: "corroborated-anomaly", vibIndicator: 0.9, acoIndicator: 0.9 }));
    }
    const led = tx.snapshot();
    expect(led.suppressed).toBe(0);
    expect(led.transmitted).toBe(20);
    expect(led.load).toBeGreaterThan(0.9);
  });

  it("lowers detail to summaries when the budget is tight", () => {
    const loose = new EdgeTransmitter({ budgetBytesPerSecond: 100000 });
    const tight = new EdgeTransmitter({ budgetBytesPerSecond: 120 });
    // Warm both links so utilisation is not zero at the first decision.
    for (let i = 0; i < 6; i++) loose.step(makeFrame({ t: i, scale: 1 + i * 0.05 }));
    for (let i = 0; i < 6; i++) tight.step(makeFrame({ t: i, scale: 1 + i * 0.05 }));
    expect(loose.snapshot().load).toBeLessThan(tight.snapshot().load);
  });

  it("accounts for every window exactly once", () => {
    const tx = new EdgeTransmitter();
    for (let i = 0; i < 30; i++) {
      tx.step(makeFrame({ t: i, scale: 1 + (i % 3) * 0.1, samples: 256 }));
    }
    const led = tx.snapshot();
    expect(led.windows).toBe(30);
    expect(led.transmitted + led.suppressed).toBe(30);
  });

  it("costs far less bandwidth than shipping the raw windows", () => {
    const tx = new EdgeTransmitter();
    for (let i = 0; i < 40; i++) {
      tx.step(makeFrame({ t: i, scale: 1 + Math.sin(i) * 0.2, samples: 2048 }));
    }
    const led = tx.snapshot();
    expect(led.sentBytes).toBeGreaterThan(0);
    expect(led.sentBytes).toBeLessThan(led.rawBytes / 10);
  });
});
