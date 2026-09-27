/**
 * useMachine — the single React-facing controller for the simulated machine.
 *
 * Owns:
 *  - power state machine (OFF → STARTING (6-step sequence) → ON → STOPPING)
 *  - behaviour selector (NORMAL / HEAVY LOAD / ANOMALY)
 *  - the central MachineStateEngine tick (smoothing, jitter, derived metrics)
 *  - machine audio lifecycle
 *  - the EdgeSense pipeline feed: sensor windows are generated ONLY while the
 *    motor is running and pushed through the existing DSP → features →
 *    isolation-forest → fusion pipeline, so every analytical panel keeps
 *    working unchanged. When the motor is OFF no data is generated at all.
 *
 * High-frequency visuals (3D rotation, sensor waves, waveforms) read the
 * machine state via a ref, avoiding React re-renders. Only the ~4 Hz snapshot
 * tick triggers React updates.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  MachineStateEngine,
  BEHAVIOUR_PROFILES,
  STARTUP_STEPS,
  SyntheticSourceAdapter,
  EdgeSensePipeline,
  trainBaseline,
  serializeBaseline,
  deserializeBaseline,
  FEATURE_VECTOR_ORDER,
  extractFeatures,
  fitPca,
  projectPca,
  type Behaviour,
  type MachineState,
  type SimulatorConfig,
  type PipelineSnapshot,
} from "@/core/edgesense";
import { MachineAudio } from "@/three/machine-audio";

const TRAINING_WINDOWS = 90;
const TICK_MS = 250; // state engine + pipeline cadence

export interface UseMachineApi {
  machine: MachineState;
  /** Ref mirroring `machine` for high-frequency consumers (3D, waveforms). */
  machineRef: React.RefObject<MachineState>;
  startupStep: string | null;
  audioAvailable: boolean;
  snapshot: PipelineSnapshot | null;
  startMotor: () => void;
  stopMotor: () => void;
  setBehaviour: (b: Behaviour) => void;
  /** What-If: nudge the behaviour profile's underlying sim config. */
  applySimOverride: (patch: Partial<SimulatorConfig>) => void;
  resetSimOverride: () => void;
  simConfig: SimulatorConfig;
  baselineReady: boolean;
  retrain: () => void;
}

export function useMachine(): UseMachineApi {
  const persistedModel = useQuery(api.edgesense.getLatestModel);
  const saveModel = useMutation(api.edgesense.saveModel);
  const recordEvent = useMutation(api.events.recordEvent);

  const engineRef = useRef(new MachineStateEngine());
  const audioRef = useRef<MachineAudio | null>(null);
  const sourceRef = useRef<SyntheticSourceAdapter | null>(null);
  const pipelineRef = useRef<EdgeSensePipeline | null>(null);
  const timerRef = useRef<number | null>(null);
  const startupTimerRef = useRef<number | null>(null);
  const simOverrideRef = useRef<Partial<SimulatorConfig>>({});

  const [machine, setMachine] = useState<MachineState>(engineRef.current.state);
  const [power, setPower] = useState<"OFF" | "STARTING" | "ON" | "STOPPING">("OFF");
  const [behaviour, setBehaviourState] = useState<Behaviour>("NORMAL");
  const [startupStep, setStartupStep] = useState<string | null>(null);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [snapshot, setSnapshot] = useState<PipelineSnapshot | null>(null);
  const [baselineReady, setBaselineReady] = useState(false);
  const [simConfig, setSimConfig] = useState<SimulatorConfig>(
    () => BEHAVIOUR_PROFILES.NORMAL.sim as SimulatorConfig,
  );

  const machineRef = useRef<MachineState>(machine);
  machineRef.current = machine;

  const powerRef = useRef(power);
  powerRef.current = power;
  const behaviourRef = useRef(behaviour);
  behaviourRef.current = behaviour;
  const audio = useMemo(() => new MachineAudio(), []);

  const sessionId = useMemo(
    () => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    [],
  );
  const recordEventRef = useRef(recordEvent);
  recordEventRef.current = recordEvent;

  /* ------------------------- baseline training ------------------------ */
  const ensureBaseline = useCallback(async () => {
    if (pipelineRef.current || sourceRef.current) return;
    const src = new SyntheticSourceAdapter(42, BEHAVIOUR_PROFILES.NORMAL.sim);
    sourceRef.current = src;
    const pipeline = new EdgeSensePipeline();
    try {
      let restored = false;
      const pm = persistedModel as { payload?: string } | null | undefined;
      if (pm?.payload) {
        try {
          const bundle = deserializeBaseline(JSON.parse(pm.payload));
          pipeline.setBaseline(bundle);
          restored = true;
        } catch {
          restored = false;
        }
      }
      if (!restored) {
        const corpus = [];
        for (let i = 0; i < TRAINING_WINDOWS; i++) corpus.push(src.readWindow());
        const bundle = trainBaseline(corpus);
        pipeline.setBaseline(bundle);
        // Seed the behaviour cloud with the training corpus projections.
        const pcaBundle = bundle as unknown as {
          pca: Record<string, { mean: number[]; components: number[][] } | null>;
        };
        const points = [];
        for (const pair of corpus) {
          for (const [w, sensor] of [
            [pair.vibration, "ADXL345"],
            [pair.acoustic, "INMP441"],
          ] as const) {
            const pca = pcaBundle.pca[sensor];
            if (!pca) continue;
            const { features } = extractFeatures(w as never);
            const x = FEATURE_VECTOR_ORDER.map((f) => features.values[f]);
            const { pc1, pc2 } = projectPca(pca as never, x);
            points.push({
              pc1,
              pc2,
              kind: "baseline" as const,
              sensor: sensor as never,
              timestamp: features.timestamp,
              isAnomaly: false,
            });
          }
        }
        pipeline.seedCloudBaseline(points);
        void saveModel({
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
      pipelineRef.current = pipeline;
      setBaselineReady(true);
    } catch (e) {
      console.error("[EdgeSense] baseline training failed:", e);
    }
  }, [persistedModel, saveModel]);

  useEffect(() => {
    if (persistedModel !== undefined) void ensureBaseline();
  }, [persistedModel, ensureBaseline]);

  /* --------------------------- main tick loop -------------------------- */
  useEffect(() => {
    timerRef.current = window.setInterval(() => {
      const pw = powerRef.current;
      const bh = behaviourRef.current;
      const state = engineRef.current.tick(pw, bh);
      audio.setTarget(state);
      audio.update();
      machineRef.current = state;
      setMachine(state);

      // Feed the pipeline only while the machine is actually running.
      if ((pw === "ON" || pw === "STARTING") && pipelineRef.current && sourceRef.current) {
        // Keep simulator config in sync with behaviour profile + What-If overrides.
        const profile = BEHAVIOUR_PROFILES[bh].sim;
        const cfg = { ...profile, ...simOverrideRef.current };
        sourceRef.current.setConfig(cfg);
        setSimConfig(cfg);
        const { vibration, acoustic } = sourceRef.current.readWindow();
        const frame = pipelineRef.current.process(vibration, acoustic);
        if (frame) {
          setSnapshot(pipelineRef.current.snapshot());
          if (frame.fusion.decision !== "healthy") {
            void recordEventRef.current({
              sessionId,
              timestamp: Math.max(vibration.timestamp, acoustic.timestamp),
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
      } else if (pw === "OFF" && pipelineRef.current) {
        // Stop live values — snapshot goes stale but panels show STANDBY.
      }
    }, TICK_MS);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      if (startupTimerRef.current !== null) window.clearTimeout(startupTimerRef.current);
    };
  }, [audio, sessionId]);

  /* ---------------------------- power control -------------------------- */
  const startMotor = useCallback(() => {
    if (powerRef.current !== "OFF") return;
    audio.start();
    setAudioAvailable(audio.available);
    setPower("STARTING");
    setStartupStep(STARTUP_STEPS[0]);
    const stepMs = 300;
    STARTUP_STEPS.forEach((step, i) => {
      startupTimerRef.current = window.setTimeout(() => {
        setStartupStep(step);
        if (i === STARTUP_STEPS.length - 1) {
          setPower("ON");
          setStartupStep(null);
        }
      }, i * stepMs);
    });
  }, [audio]);

  const stopMotor = useCallback(() => {
    if (powerRef.current === "OFF") return;
    setPower("STOPPING");
    audio.stop();
    // Allow a short deceleration, then fully stop.
    startupTimerRef.current = window.setTimeout(() => {
      setPower("OFF");
      setBehaviourState("NORMAL");
      simOverrideRef.current = {};
      setSnapshot(null);
    }, 900);
  }, [audio]);

  const setBehaviour = useCallback((b: Behaviour) => {
    setBehaviourState(b);
    simOverrideRef.current = {}; // profile switch clears What-If overrides
  }, []);

  const applySimOverride = useCallback((patch: Partial<SimulatorConfig>) => {
    simOverrideRef.current = { ...simOverrideRef.current, ...patch };
  }, []);

  const resetSimOverride = useCallback(() => {
    simOverrideRef.current = {};
  }, []);

  const retrain = useCallback(() => {
    pipelineRef.current = null;
    sourceRef.current = null;
    void ensureBaseline();
  }, [ensureBaseline]);

  return {
    machine,
    machineRef,
    startupStep,
    audioAvailable,
    snapshot,
    startMotor,
    stopMotor,
    setBehaviour,
    applySimOverride,
    resetSimOverride,
    simConfig,
    baselineReady,
    retrain,
  };
}
