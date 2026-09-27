/**
 * EdgeSense core — public API.
 */
export * from "./types";
export * from "./rng";
export * from "./dsp";
export { FEATURE_UNITS, FEATURE_LABELS, extractFeatures, SATURATION_LIMITS } from "./features";
export type { ExtractionOutput } from "./features";
export {
  SyntheticSensorSource,
  SAMPLE_RATE,
  WINDOW_SECONDS,
  WINDOW_SIZE,
  SCENARIOS,
} from "./simulator";
export type { Scenario, ScenarioStep } from "./simulator";
export type { SensorSource } from "./sensor-source";
export {
  SyntheticSourceAdapter,
  CSVSensorSource,
  ESP32SensorSource,
} from "./sensor-source";
export { IsolationForest } from "./isolation-forest";
export {
  trainBaseline,
  serializeBaseline,
  deserializeBaseline,
} from "./baseline";
export type { WindowPair, BaselineBundle } from "./baseline";
export { fitPca, projectPca } from "./pca";
export { fuseResults, QUALITY_GATE } from "./fusion";
export { investigate } from "./investigation";
export { EdgeSensePipeline } from "./pipeline";
export type {
  PipelineFrame,
  PipelineSnapshot,
  FingerprintBarLite,
} from "./pipeline";
export {
  BEHAVIOUR_PROFILES,
  BEHAVIOUR_LABELS,
  STARTUP_STEPS,
  MachineStateEngine,
} from "./machine-state";
export type {
  Behaviour,
  Power,
  MachineState,
  BehaviourProfile,
} from "./machine-state";
