/**
 * useEdgeSense — drives the EdgeSense pipeline from React.
 *
 * Lifecycle:
 *  1. Try to load a persisted baseline model from Convex.
 *  2. If none exists, train the baseline from the synthetic normal corpus.
 *  3. Start the window processing loop (source → pipeline → snapshot state).
 *
 * The pipeline runs in the browser (edge-suitable DSP). Convex persists the
 * model and event history. Replay scenarios step the simulator config through
 * time; manual What-If controls override everything else.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  type PipelineSnapshot,
  type SimulatorConfig,
  DEFAULT_SIMULATOR_CONFIG,
  SyntheticSourceAdapter,
  EdgeSensePipeline,
  trainBaseline,
  serializeBaseline,
  deserializeBaseline,
  FEATURE_VECTOR_ORDER,
  SCENARIOS,
  type Scenario,
} from "@/core/edgesense";

export type EngineStatus =
  | "loading"
  | "training"
  | "ready"
  | "running"
  | "error";

export interface ActiveScenarioInfo {
  id: string;
  title: string;
  stepLabel: string;
}

export interface EdgeSenseApi {
  status: EngineStatus;
  error: string | null;
  snapshot: PipelineSnapshot | null;
  simulatorConfig: SimulatorConfig;
  dataLabel: string;
  activeScenario: ActiveScenarioInfo | null;
  trainedAt: number | null;
  sampleCount: number | null;
  setSimulatorConfig: (patch: Partial<SimulatorConfig>) => void;
  startScenario: (scenarioId: string) => void;
  stopScenario: () => void;
  retrain: () => void;
}

const TRAINING_WINDOWS = 60; // corpus size for baseline training
const NORMAL_RATE_MS = 1000; // real-time window cadence
const REPLAY_RATE_MS = 350; // replay runs faster than real time
