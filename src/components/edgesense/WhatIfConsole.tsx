/**
 * WhatIfConsole — the What-If machine simulator. Sliders modify the *central*
 * simulation (the same config the behaviour profiles use), so load, RPM,
 * vibration, acoustic level and frequency shifts propagate through the entire
 * pipeline: waveforms, FFT, features, anomaly scores, fusion, explanation.
 */
import { useEffect, useState } from "react";
import { FlaskConical, Undo2 } from "lucide-react";
import type { MachineState, SimulatorConfig } from "@/core/edgesense";
import { BEHAVIOUR_PROFILES } from "@/core/edgesense";
import { cn } from "@/lib/utils";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}

function Slider({ label, value, min, max, step, format, onChange, disabled }: SliderProps) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="font-mono text-[11px] font-semibold tabular-nums">{format(value)}</p>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded bg-border accent-[var(--primary)]"
      />
    </div>
  );
}

interface Props {
  machine: MachineState;
  simConfig: SimulatorConfig;
  onApply: (patch: Partial<SimulatorConfig>) => void;
  onReset: () => void;
  onRetrain: () => void;
}

export function WhatIfConsole({ machine, simConfig, onApply, onReset, onRetrain }: Props) {
  const [draft, setDraft] = useState<SimulatorConfig>(simConfig);
  useEffect(() => {
    setDraft(simConfig);
  }, [simConfig]);

  const profile = BEHAVIOUR_PROFILES[machine.behaviour].sim;
  const dirty = (Object.keys(profile) as Array<keyof SimulatorConfig>).some(
    (k) => Math.abs((draft[k] as number) - (profile[k] as number)) > 1e-9,
  );
  const running = machine.power === "ON" || machine.power === "STARTING";
  const freqShift = machine.dominantFrequency - profile.rotationFrequencyHz;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <FlaskConical className="size-4 text-primary" />
              What-If Machine Simulator
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Push the machine and watch the entire EdgeSense pipeline respond.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                onApply(draft);
              }}
              disabled={!dirty || !running}
              className={cn(
                "rounded-md px-3 py-1.5 text-[11px] font-bold tracking-wider transition-colors",
                dirty && running
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "cursor-not-allowed bg-muted text-muted-foreground",
              )}
            >
              APPLY
            </button>
            <button
              onClick={() => {
                onReset();
                setDraft(profile as SimulatorConfig);
              }}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] font-bold tracking-wider text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              <Undo2 className="size-3" />
              RESET
            </button>
          </div>
        </div>

        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Slider
            label="Load (vibration amplitude)"
            value={draft.vibrationAmplitude}
            min={0.05}
            max={1.2}
            step={0.01}
            format={(v) => `${v.toFixed(2)} g`}
            onChange={(v) => setDraft((d) => ({ ...d, vibrationAmplitude: v }))}
            disabled={!running}
          />
          <Slider
            label="Rotation frequency"
            value={draft.rotationFrequencyHz}
            min={10}
            max={110}
            step={1}
            format={(v) => `${v.toFixed(0)} Hz`}
            onChange={(v) => setDraft((d) => ({ ...d, rotationFrequencyHz: v }))}
            disabled={!running}
          />
          <Slider
            label="Acoustic energy"
            value={draft.acousticEnergy}
            min={0}
            max={2}
            step={0.05}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={(v) => setDraft((d) => ({ ...d, acousticEnergy: v }))}
            disabled={!running}
          />
          <Slider
            label="Anomaly intensity"
            value={draft.anomalyIntensity}
            min={0}
            max={1}
            step={0.01}
            format={(v) => (v === 0 ? "off" : `${(v * 100).toFixed(0)}%`)}
            onChange={(v) => setDraft((d) => ({ ...d, anomalyIntensity: v }))}
            disabled={!running}
          />
          <Slider
            label="Signal noise"
            value={draft.noiseLevel}
            min={0}
            max={1}
            step={0.01}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={(v) => setDraft((d) => ({ ...d, noiseLevel: v }))}
            disabled={!running}
          />
          <Slider
            label="Harmonic strength"
            value={draft.harmonicStrength}
            min={0}
            max={2}
            step={0.05}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={(v) => setDraft((d) => ({ ...d, harmonicStrength: v }))}
            disabled={!running}
          />
        </div>
      </div>

      {/* live cause → effect chain from real central state */}
      <div className="rounded-md border border-border/60 bg-background/40 p-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Cause → effect · live
        </p>
        <div className="space-y-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
          <p>
            <span className="text-foreground">machine change</span> → amp {draft.vibrationAmplitude.toFixed(2)} g @{" "}
            {draft.rotationFrequencyHz.toFixed(0)} Hz
          </p>
          <p>
            <span className="text-foreground">features</span> → RMS{" "}
            <span className="text-foreground">{machine.vibrationRms.toFixed(2)} g</span> · dominant freq{" "}
            <span
              className={cn(
                "font-bold",
                Math.abs(freqShift) > 5 ? "text-status-anomaly" : "text-foreground",
              )}
            >
              {machine.dominantFrequency.toFixed(0)} Hz
            </span>
            {Math.abs(freqShift) > 5 ? ` (shifted +${freqShift.toFixed(0)})` : ""}
          </p>
          <p>
            <span className="text-foreground">anomaly scores</span> → vibration{" "}
            <span className="text-foreground">{machine.vibrationAnomalyScore.toFixed(2)}</span> · acoustic{" "}
            <span className="text-foreground">{machine.acousticAnomalyScore.toFixed(2)}</span> · fused{" "}
            <span
              className={cn(
                "font-bold",
                machine.fusedAnomalyScore > 0.7
                  ? "text-status-anomaly"
                  : machine.fusedAnomalyScore > 0.28
                    ? "text-status-suspicious"
                    : "text-status-healthy",
              )}
            >
              {machine.fusedAnomalyScore.toFixed(2)}
            </span>
          </p>
          <p>
            <span className="text-foreground">decision</span> →{" "}
            <span
              className={cn(
                "font-bold",
                machine.machineStatus === "ANOMALY DETECTED"
                  ? "text-status-anomaly"
                  : machine.machineStatus === "LOAD INCREASED"
                    ? "text-status-suspicious"
                    : "text-status-healthy",
              )}
            >
              {machine.machineStatus}
            </span>
          </p>
        </div>
        <button
          onClick={onRetrain}
          className="mt-4 text-[10px] tracking-widest text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          RETRAIN BASELINE FROM NORMAL DATA
        </button>
      </div>
    </div>
  );
}
