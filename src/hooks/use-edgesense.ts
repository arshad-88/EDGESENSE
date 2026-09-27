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

export function useEdgeSense(): EdgeSenseApi {
  const persistedModel = useQuery(api.edgesense.getLatestModel);
  const saveModel = useMutation(api.edgesense.saveModel);
  const recordEvent = useMutation(api.events.recordEvent);

  const [status, setStatus] = useState<EngineStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PipelineSnapshot | null>(null);
  const [simulatorConfig, setSimulatorConfigState] = useState<SimulatorConfig>(
    DEFAULT_SIMULATOR_CONFIG,
  );
  const [activeScenario, setActiveScenario] = useState<ActiveScenarioInfo | null>(null);
  const [trainedAt, setTrainedAt] = useState<number | null>(null);

  const sourceRef = useRef<SyntheticSourceAdapter | null>(null);
  const pipelineRef = useRef<EdgeSensePipeline | null>(null);
  const timerRef = useRef<number | null>(null);
  const scenarioRef = useRef<{ scenario: Scenario; stepIdx: number; elapsed: number } | null>(null);
  const configRef = useRef<SimulatorConfig>(DEFAULT_SIMULATOR_CONFIG);
  const replayRef = useRef(false);
  const saveModelRef = useRef(saveModel);
  const recordEventRef = useRef(recordEvent);

  saveModelRef.current = saveModel;
  recordEventRef.current = recordEvent;

  const sessionId = useMemo(
    () => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    [],
  );

  const sampleCount = TRAINING_WINDOWS;

  /** Apply a simulator config patch (What-If controls). Cancels replay. */
  const setSimulatorConfig = useCallback((patch: Partial<SimulatorConfig>) => {
    configRef.current = { ...configRef.current, ...patch };
    sourceRef.current?.setConfig(patch);
    setSimulatorConfigState((prev) => ({ ...prev, ...patch }));
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopScenario = useCallback(() => {
    scenarioRef.current = null;
    replayRef.current = false;
    setActiveScenario(null);
  }, []);

  const startScenario = useCallback((scenarioId: string) => {
    const scenario = SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) return;
    scenarioRef.current = { scenario, stepIdx: 0, elapsed: 0 };
    replayRef.current = true;
    const first = scenario.steps[0];
    sourceRef.current?.setConfig(first.config);
    configRef.current = { ...configRef.current, ...first.config };
    setSimulatorConfigState((prev) => ({ ...prev, ...first.config }));
    setActiveScenario({ id: scenario.id, title: scenario.title, stepLabel: first.label });
  }, []);

  const retrain = useCallback(() => {
    if (!sourceRef.current || !pipelineRef.current) return;
    const src = new SyntheticSourceAdapter(42, DEFAULT_SIMULATOR_CONFIG);
    sourceRef.current = src;
    setStatus("training");
    // Collect a fresh normal corpus and retrain synchronously (fast enough).
    const corpus = [];
    for (let i = 0; i < TRAINING_WINDOWS; i++) corpus.push(src.readWindow());
    try {
      const bundle = trainBaseline(corpus);
      pipelineRef.current.setBaseline(bundle);
      setTrainedAt(bundle.metadata.trainedAt);
      setStatus("running");
      void saveModelRef.current({
        trainedAt: bundle.metadata.trainedAt,
        sampleCount: bundle.metadata.sampleCountPerSensor,
        featureNames: bundle.metadata.featureNames,
        machineMode: bundle.metadata.machineMode,
        contamination: bundle.metadata.contamination,
        windowSeconds: bundle.metadata.windowSeconds,
        thresholds: bundle.metadata.thresholds,
        payload: JSON.stringify(serializeBaseline(bundle)),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Training failed");
      setStatus("error");
    }
  }, []);

  const boot = useCallback(async () => {
    setStatus("loading");
    setError(null);
    const src = new SyntheticSourceAdapter(42, DEFAULT_SIMULATOR_CONFIG);
    sourceRef.current = src;
    const pipeline = new EdgeSensePipeline();
    pipelineRef.current = pipeline;

    try {
      let restored = false;
      if (persistedModel && persistedModel.payload) {
        try {
          const bundle = deserializeBaseline(JSON.parse(persistedModel.payload));
          pipeline.setBaseline(bundle);
          setTrainedAt(bundle.metadata.trainedAt);
          restored = true;
        } catch {
          restored = false;
        }
      }
      if (!restored) {
        setStatus("training");
        const corpus = [];
        for (let i = 0; i < TRAINING_WINDOWS; i++) corpus.push(src.readWindow());
        const bundle = trainBaseline(corpus);
        pipeline.setBaseline(bundle);
        setTrainedAt(bundle.metadata.trainedAt);
        void saveModelRef.current({
          trainedAt: bundle.metadata.trainedAt,
          sampleCount: bundle.metadata.sampleCountPerSensor,
          featureNames: bundle.metadata.featureNames,
          machineMode: bundle.metadata.machineMode,
          contamination: bundle.metadata.contamination,
          windowSeconds: bundle.metadata.windowSeconds,
          thresholds: bundle.metadata.thresholds,
          payload: JSON.stringify(serializeBaseline(bundle)),
        });
      }
      setStatus("running");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Boot failed");
      setStatus("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedModel]);

  useEffect(() => {
    if (status === "loading" && persistedModel !== undefined) {
      void boot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedModel]);

  // Main processing loop.
  useEffect(() => {
    if (status !== "running") return;
    const rate = replayRef.current ? REPLAY_RATE_MS : NORMAL_RATE_MS;
    const tick = () => {
      const src = sourceRef.current;
      const pipeline = pipelineRef.current;
      if (!src || !pipeline) return;

      // Advance replay scenario if active.
      const sc = scenarioRef.current;
      if (sc) {
        sc.elapsed += 1;
        const step = sc.scenario.steps[sc.stepIdx];
        if (sc.elapsed >= step.seconds) {
          sc.stepIdx += 1;
          sc.elapsed = 0;
          if (sc.stepIdx >= sc.scenario.steps.length) {
            stopScenario();
          } else {
            const next = sc.scenario.steps[sc.stepIdx];
            src.setConfig(next.config);
            configRef.current = { ...configRef.current, ...next.config };
            setSimulatorConfigState((prev) => ({ ...prev, ...next.config }));
            setActiveScenario({ id: sc.scenario.id, title: sc.scenario.title, stepLabel: next.label });
          }
        }
      }

      const { vibration, acoustic } = src.readWindow();
      const frame = pipeline.process(vibration, acoustic);
      if (frame) {
        setSnapshot(pipeline.snapshot());
        const w = Math.max(vibration.timestamp, acoustic.timestamp);
        if (frame.fusion.decision !== "healthy") {
          void recordEventRef.current({
            sessionId,
            timestamp: w,
            state: frame.fusion.state,
            decision: frame.fusion.decision,
            vibrationIndicator: frame.vibration.anomaly.anomalyIndicator,
            acousticIndicator: frame.acoustic.anomaly.anomalyIndicator,
            sensorAgreement: frame.fusion.sensorAgreement,
            machineMode: frame.machineMode,
            simulated: true,
            headline: frame.investigation.headline,
            narrative: frame.investigation.narrative,
          });
        }
      }
    };
    const interval = replayRef.current ? REPLAY_RATE_MS : NORMAL_RATE_MS;
    timerRef.current = window.setInterval(tick, interval);
    tick();
    return stopTimer;
  }, [status, sessionId, stopScenario, stopTimer]);

  return {
    status,
    error,
    snapshot,
    simulatorConfig,
    dataLabel: "SIMULATED DATA",
    activeScenario,
    trainedAt,
    sampleCount,
    setSimulatorConfig,
    startScenario,
    stopScenario,
    retrain,
  };
}