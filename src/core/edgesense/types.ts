/**
 * EdgeSense — core domain types (data models).
 *
 * Typed schemas for every object that flows through the pipeline. These types
 * are shared between the DSP/ML core, the Convex backend, and the dashboard UI
 * so no arbitrary dictionaries are passed around.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export const MODALITIES = ["vibration", "acoustic"] as const;
export const ModalitySchema = z.enum(MODALITIES);
export type Modality = (typeof MODALITIES)[number];

/** Final fused verdict for a moment in time. */
export const FUSION_STATES = [
  "healthy",
  "suspicious",
  "corroborated-anomaly",
] as const;
export const FusionStateSchema = z.enum(FUSION_STATES);
export type FusionState = (typeof FUSION_STATES)[number];

/** Operating modes of the simulated machine. */
export const MACHINE_MODES = [
  "normal",
  "increased-load",
  "mechanical-imbalance",
  "bearing-disturbance",
  "acoustic-disturbance",
  "sensor-disagreement",
  "signal-degradation",
  "recovery",
] as const;
export const MachineModeSchema = z.enum(MACHINE_MODES);
export type MachineMode = (typeof MACHINE_MODES)[number];

export const SCENARIO_IDS = [
  "normal",
  "increased-load",
  "mechanical-imbalance",
  "bearing-disturbance",
  "acoustic-disturbance",
  "sensor-disagreement",
  "signal-degradation",
  "recovery",
] as const;
export const ScenarioIdSchema = z.enum(SCENARIO_IDS);
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export const SENSORS = ["ADXL345", "INMP441"] as const;
export const SensorIdSchema = z.enum(SENSORS);
export type SensorId = (typeof SENSORS)[number];

/* ------------------------------------------------------------------ */
/* Simulator                                                           */
/* ------------------------------------------------------------------ */

export const SimulatorConfigSchema = z.object({
  /** Base vibration amplitude in g. */
  vibrationAmplitude: z.number().min(0).max(5).default(0.35),
  /** Rotation frequency in Hz (motor speed). */
  rotationFrequencyHz: z.number().min(1).max(120).default(48),
  /** Acoustic broadband energy multiplier (0–1 scale). */
  acousticEnergy: z.number().min(0).max(2).default(0.5),
  /** Additive white noise level (0–1 scale). */
  noiseLevel: z.number().min(0).max(1).default(0.12),
  /** Strength of harmonic overtones relative to the fundamental (0–2). */
  harmonicStrength: z.number().min(0).max(2).default(0.4),
  /** Intensity of the active anomaly, 0 = healthy (0–1). */
  anomalyIntensity: z.number().min(0).max(1).default(0),
  /** Which anomaly behaviour the machine is currently exhibiting. */
  mode: MachineModeSchema.default("normal"),
});
export type SimulatorConfig = z.infer<typeof SimulatorConfigSchema>;

export const DEFAULT_SIMULATOR_CONFIG: SimulatorConfig = {
  vibrationAmplitude: 0.35,
  rotationFrequencyHz: 48,
  acousticEnergy: 0.5,
  noiseLevel: 0.12,
  harmonicStrength: 0.4,
  anomalyIntensity: 0,
  mode: "normal",
};

/* ------------------------------------------------------------------ */
/* Sensor data                                                         */
/* ------------------------------------------------------------------ */

/** One window of raw samples from a single modality. */
export const SensorWindowSchema = z.object({
  sensor: SensorIdSchema,
  modality: ModalitySchema,
  /** Window start time in seconds since pipeline start. */
  timestamp: z.number(),
  /** Sample rate in Hz for this window. */
  sampleRate: z.number().positive(),
  channels: z.array(z.string()),
  /** Flat interleaved samples: [x0,y0,z0, x1,y1,z1, ...] for vibration; mono for acoustic. */
  samples: z.array(z.number()),
  metadata: z
    .object({
      machineMode: MachineModeSchema,
      scenario: z.optional(z.string()),
      simulated: z.boolean(),
    })
    .default({ machineMode: "normal", simulated: true }),
});
export type SensorWindow = z.infer<typeof SensorWindowSchema>;

/** Quality assessment of a window (used by fusion to weigh evidence). */
export const SensorQualitySchema = z.object({
  sensor: SensorIdSchema,
  /** 0–1, 1 = perfect signal quality. */
  score: z.number().min(0).max(1),
  saturated: z.boolean(),
  flatline: z.boolean(),
  clippedRatio: z.number().min(0).max(1),
  note: z.string(),
});
export type SensorQuality = z.infer<typeof SensorQualitySchema>;

/* ------------------------------------------------------------------ */
/* Features                                                            */
/* ------------------------------------------------------------------ */

export const FEATURE_NAMES = [
  "rms",
  "variance",
  "peak",
  "kurtosis",
  "dominantFreq",
  "spectralEnergy",
] as const;
export const FeatureNameSchema = z.enum(FEATURE_NAMES);
export type FeatureName = (typeof FEATURE_NAMES)[number];

export const FeatureValueSchema = z.object({
  name: FeatureNameSchema,
  value: z.number(),
  sensor: SensorIdSchema,
  /** Window timestamp this feature was computed from. */
  timestamp: z.number(),
  units: z.string(),
  /** Learned baseline mean for this feature (present once a baseline exists). */
  baseline: z.optional(z.number()),
  /** Signed relative deviation from baseline, e.g. 0.32 = +32%. */
  deviation: z.optional(z.number()),
});
export type FeatureValue = z.infer<typeof FeatureValueSchema>;

export const FeatureVectorSchema = z.object({
  sensor: SensorIdSchema,
  modality: ModalitySchema,
  timestamp: z.number(),
  /** Ordered per FeatureVectorLayout ordering. */
  values: z.record(FeatureNameSchema, z.number()),
  quality: SensorQualitySchema,
});
export type FeatureVector = z.infer<typeof FeatureVectorSchema>;

/** Canonical feature ordering used everywhere (training, inference, UI). */
export const FEATURE_VECTOR_ORDER: readonly FeatureName[] = FEATURE_NAMES;

/* ------------------------------------------------------------------ */
/* Anomaly detection                                                   */
/* ------------------------------------------------------------------ */

export const AnomalyResultSchema = z.object({
  sensor: SensorIdSchema,
  timestamp: z.number(),
  /** Raw Isolation Forest decision score (higher = more normal, ~[-1, 1]). */
  rawScore: z.number(),
  /** Normalised 0–1 anomaly indicator derived from the raw score. NOT a probability. */
  anomalyIndicator: z.number().min(0).max(1),
  isAnomaly: z.boolean(),
  threshold: z.number(),
  quality: SensorQualitySchema,
  /** Feature deviations that drove the decision, strongest first. */
  evidence: z.array(FeatureValueSchema),
});
export type AnomalyResult = z.infer<typeof AnomalyResultSchema>;

export const FUSION_DECISIONS = [
  "healthy",
  "suspicious-vibration",
  "suspicious-acoustic",
  "corroborated-anomaly",
] as const;
export const FusionDecisionSchema = z.enum(FUSION_DECISIONS);
export type FusionDecision = (typeof FUSION_DECISIONS)[number];

export const FusionResultSchema = z.object({
  timestamp: z.number(),
  state: FusionStateSchema,
  decision: FusionDecisionSchema,
  vibration: AnomalyResultSchema,
  acoustic: AnomalyResultSchema,
  /** 0–2, how many sensors flagged. */
  sensorAgreement: z.number().min(0).max(2),
  sensorsAgree: z.boolean(),
  qualityConsidered: z.boolean(),
  summary: z.string(),
});
export type FusionResult = z.infer<typeof FusionResultSchema>;

/* ------------------------------------------------------------------ */
/* Investigation / explainability                                      */
/* ------------------------------------------------------------------ */

export const EvidenceItemSchema = z.object({
  sensor: SensorIdSchema,
  feature: FeatureNameSchema,
  label: z.string(),
  /** Human-readable delta, e.g. "+32%". */
  deltaLabel: z.string(),
  deviation: z.number(),
  value: z.number(),
  baseline: z.number(),
  role: z.enum(["primary", "supporting"]),
});
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const InvestigationResultSchema = z.object({
  timestamp: z.number(),
  decision: FusionStateSchema,
  headline: z.string(),
  narrative: z.string(),
  primaryEvidence: z.array(EvidenceItemSchema),
  supportingEvidence: z.array(EvidenceItemSchema),
  sensorAgreement: z.string(),
  /** How long the deviation has been sustained, in seconds. */
  sustainedSeconds: z.number(),
  qualityNotes: z.array(z.string()),
  caveat: z.string(),
});
export type InvestigationResult = z.infer<typeof InvestigationResultSchema>;

/* ------------------------------------------------------------------ */
/* Baseline / model                                                    */
/* ------------------------------------------------------------------ */

export const BaselineMetadataSchema = z.object({
  trainedAt: z.number(),
  /** Number of normal windows used per sensor. */
  sampleCountPerSensor: z.number().int().positive(),
  windowSeconds: z.number().positive(),
  featureNames: z.array(FeatureNameSchema),
  machineMode: MachineModeSchema,
  /** Per-feature baseline stats per sensor. */
  stats: z.record(
    SensorIdSchema,
    z.record(FeatureNameSchema, z.object({ mean: z.number(), std: z.number() })),
  ),
  contamination: z.number(),
  thresholds: z.record(SensorIdSchema, z.number()),
  estimatorParams: z.record(z.string(), z.unknown()),
});
export type BaselineMetadata = z.infer<typeof BaselineMetadataSchema>;

/** Model record persisted through Convex. */
export const PersistedModelSchema = z.object({
  _id: z.string(),
  _creationTime: z.number(),
  trainedAt: z.number(),
  sampleCount: z.number(),
  featureNames: z.array(z.string()),
  machineMode: z.string(),
  thresholds: z.record(z.string(), z.number()),
  contamination: z.number(),
  windowSeconds: z.number(),
  /** Serialized forest per sensor (opaque JSON produced by the core serializer). */
  forests: z.record(z.string(), z.unknown()),
});
export type PersistedModel = z.infer<typeof PersistedModelSchema>;

/** A fused event persisted through Convex for history/replay. */
export const PersistedEventSchema = z.object({
  _id: z.string(),
  _creationTime: z.number(),
  timestamp: z.number(),
  state: FusionStateSchema,
  decision: FusionDecisionSchema,
  vibrationIndicator: z.number(),
  acousticIndicator: z.number(),
  sensorAgreement: z.number(),
  machineMode: z.string(),
  simulated: z.boolean(),
  headline: z.optional(z.string()),
  narrative: z.optional(z.string()),
  features: z.record(z.string(), z.unknown()),
});
export type PersistedEvent = z.infer<typeof PersistedEventSchema>;

/* ------------------------------------------------------------------ */
/* Visualisation helpers                                               */
/* ------------------------------------------------------------------ */

/** 2D PCA projection point for the behaviour cloud. */
export const CloudPointSchema = z.object({
  pc1: z.number(),
  pc2: z.number(),
  kind: z.enum(["baseline", "live"]),
  sensor: SensorIdSchema,
  timestamp: z.number(),
  isAnomaly: z.boolean(),
});
export type CloudPoint = z.infer<typeof CloudPointSchema>;

/** PCA model fitted on baseline feature vectors (visualisation only). */
export const PcaModelSchema = z.object({
  mean: z.array(z.number()),
  components: z.array(z.array(z.number())), // [pc][feature]
  explained: z.array(z.number()),
});
export type PcaModel = z.infer<typeof PcaModelSchema>;

/** One row of the anomaly heatmap: per-feature normalised deviation. */
export const HeatmapRowSchema = z.object({
  timestamp: z.number(),
  deviations: z.record(FeatureNameSchema, z.number()),
  state: FusionStateSchema,
});
export type HeatmapRow = z.infer<typeof HeatmapRowSchema>;

/** Fingerprint bar: baseline vs current for one feature. */
export const FingerprintBarSchema = z.object({
  feature: FeatureNameSchema,
  label: z.string(),
  baseline: z.number(),
  current: z.number(),
  /** Relative deviation used for colouring. */
  deviation: z.number(),
  unit: z.string(),
});
export type FingerprintBar = z.infer<typeof FingerprintBarSchema>;

/** FFT visualization payload for one modality. */
export const SpectrumSchema = z.object({
  frequencies: z.array(z.number()),
  magnitudes: z.array(z.number()),
  dominantFrequency: z.number(),
  spectralEnergy: z.number(),
});
export type Spectrum = z.infer<typeof SpectrumSchema>;
