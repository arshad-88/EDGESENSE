/**
 * ControlConsole — the What-If simulator as an engineering control panel.
 * Knob-style rotary controls grouped by physical behaviour, one-click
 * scenario presets, apply/reset, and a live cause→effect chain readout.
 * All controls write to the real SimulatorConfig — the pipeline responds.
 */
import { useEffect, useState } from "react";
import { FlaskConical, Undo2, Play, Square } from "lucide-react";
import type { SimulatorConfig, MachineMode } from "@/core/edgesense";
import { DEFAULT_SIMULATOR_CONFIG, SCENARIOS } from "@/core/edgesense";
import type { EdgeSenseApi } from "@/hooks/use-edgesense";
import { cn } from "@/lib/utils";

/* --------------------------- Knob control --------------------------- */

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}

/** Rotary instrument-style knob implemented as an accessible slider. */
function Knob({ label, value, min, max, step, format, onChange, disabled }: KnobProps) {
  const t = (value - min) / (max - min); // 0..1
  const angle = -135 + t * 270;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative size-16">
        <svg viewBox="0 0 64 64" className="size-16">
          {/* track */}
          <path d="M 10.7 46 A 24 24 0 1 1 53.3 46" fill="none" className="stroke-border" strokeWidth={4} strokeLinecap="round" />
          {/* value arc */}
          <path
            d="M 10.7 46 A 24 24 0 1 1 53.3 46"
            fill="none"
            stroke="var(--chart-1)"
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={75.4}
            strokeDashoffset={75.4 * (1 - t)}
          />
          {/* pointer */}
          <g transform={`rotate(${angle} 32 32)`}>
            <line x1={32} y1={32} x2={32} y2={14} className="stroke-foreground" strokeWidth={2.4} strokeLinecap="round" />
          </g>
          <circle cx={32} cy={32} r={3} className="fill-foreground" />
        </svg>
        {/* invisible but accessible slider overlay */}
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 cursor-ns-resize opacity-0"
        />
      </div>
      <div className="text-center">
        <p className="text-[10px] leading-tight text-muted-foreground">{label}</p>
        <p className="text-[11px] font-semibold tabular-nums">{format(value)}</p>
      </div>
    </div>
  );
}

/* ------------------------- Mode preset chips ------------------------- */

const MODE_PRESETS: Array<{ mode: MachineMode; label: string; config: Partial<SimulatorConfig> }> = [
  { mode: "normal", label: "NORMAL", config: { mode: "normal", anomalyIntensity: 0, vibrationAmplitude: 0.35, rotationFrequencyHz: 48, acousticEnergy: 0.5, noiseLevel: 0.12, harmonicStrength: 0.4 } },
  { mode: "increased-load", label: "INCREASED LOAD", config: { mode: "increased-load", anomalyIntensity: 0.35, vibrationAmplitude: 0.55, rotationFrequencyHz: 40, acousticEnergy: 0.85, noiseLevel: 0.16, harmonicStrength: 0.55 } },
  { mode: "mechanical-imbalance", label: "MECHANICAL IMBALANCE", config: { mode: "mechanical-imbalance", anomalyIntensity: 0.8, vibrationAmplitude: 0.5, rotationFrequencyHz: 48, acousticEnergy: 0.58, noiseLevel: 0.14, harmonicStrength: 0.7 } },
  { mode: "bearing-disturbance", label: "BEARING-LIKE DISTURBANCE", config: { mode: "bearing-disturbance", anomalyIntensity: 0.75, vibrationAmplitude: 0.42, rotationFrequencyHz: 48, acousticEnergy: 0.6, noiseLevel: 0.15, harmonicStrength: 0.45 } },
  { mode: "acoustic-disturbance", label: "ACOUSTIC DISTURBANCE", config: { mode: "acoustic-disturbance", anomalyIntensity: 0.7, vibrationAmplitude: 0.35, rotationFrequencyHz: 48, acousticEnergy: 1.35, noiseLevel: 0.2, harmonicStrength: 0.4 } },
  { mode: "sensor-disagreement", label: "SENSOR DISAGREEMENT", config: { mode: "sensor-disagreement", anomalyIntensity: 0.9, vibrationAmplitude: 0.75, rotationFrequencyHz: 66, acousticEnergy: 0.5, noiseLevel: 0.12, harmonicStrength: 0.4 } },
  { mode: "signal-degradation", label: "SIGNAL DEGRADATION", config: { mode: "signal-degradation", anomalyIntensity: 0.15, noiseLevel: 0.85, vibrationAmplitude: 0.35, rotationFrequencyHz: 48, acousticEnergy: 0.5, harmonicStrength: 0.4 } },
];

interface Props {
  engine: EdgeSenseApi;
  /** Latest actual dominant frequency, for the cause→effect chain. */
  currentDominantFreq: number;
  baselineDominantFreq: number;
}

export function ControlConsole({ engine, currentDominantFreq, baselineDominantFreq }: Props) {
  const cfg = engine.simulatorConfig;
  const [draft, setDraft] = useState<SimulatorConfig>(cfg);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!pending) setDraft(cfg);
  }, [cfg, pending]);

  const apply = () => {
    engine.setSimulatorConfig(draft);
    setPending(false);
  };

  const dirty = (Object.keys(DEFAULT_SIMULATOR_CONFIG) as Array<keyof SimulatorConfig>).some(
    (k) => Math.abs((draft[k] as number) - (DEFAULT_SIMULATOR_CONFIG[k] as number)) > 1e-9,
  );

  const freqShift = Math.abs(currentDominantFreq - baselineDominantFreq);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      {/* LEFT: knobs grouped by physical behaviour */}
      <div>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <FlaskConical className="size-4 text-primary" />
              Machine Behaviour Simulator
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Introduce controlled changes and observe how EdgeSense responds.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={apply}
              disabled={!pending}
              className={cn(
                "rounded-md px-3 py-1.5 text-[11px] font-bold tracking-wider transition-colors",
                pending
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "cursor-not-allowed bg-muted text-muted-foreground",
              )}
            >
              APPLY CHANGE
            </button>
            <button
              onClick={() => {
                engine.setSimulatorConfig(DEFAULT_SIMULATOR_CONFIG);
                setDraft(DEFAULT_SIMULATOR_CONFIG);
                setPending(false);
              }}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] font-bold tracking-wider text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              <Undo2 className="size-3" />
              RESET TO NORMAL
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-primary">Mechanical</p>
            <div className="flex flex-wrap gap-3">
              <Knob label="Vibration amp" value={draft.vibrationAmplitude} min={0.05} max={1.2} step={0.01} format={(v) => `${v.toFixed(2)} g`} disabled={engine.status !== "running"} onChange={(v) => { setDraft((d) => ({ ...d, vibrationAmplitude: v })); setPending(true); }} />
              <Knob label="Frequency" value={draft.rotationFrequencyHz} min={10} max={110} step={1} format={(v) => `${v.toFixed(0)} Hz`} disabled={engine.status !== "running"} onChange={(v) => { setDraft((d) => ({ ...d, rotationFrequencyHz: v })); setPending(true); }} />
              <Knob label="Harmonics" value={draft.harmonicStrength} min={0} max={2} step={0.05} format={(v) => `${(v * 100).toFixed(0)}%`} disabled={engine.status !== "running"} onChange={(v) => { setDraft((d) => ({ ...d, harmonicStrength: v })); setPending(true); }} />
            </div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-chart-2">Acoustic</p>
            <div className="flex flex-wrap gap-3">
              <Knob label="Acoustic energy" value={draft.acousticEnergy} min={0} max={2} step={0.05} format={(v) => `${(v * 100).toFixed(0)}%`} disabled={engine.status !== "running"} onChange={(v) => { setDraft((d) => ({ ...d, acousticEnergy: v })); setPending(true); }} />
              <Knob label="Noise" value={draft.noiseLevel} min={0} max={1} step={0.01} format={(v) => `${(v * 100).toFixed(0)}%`} disabled={engine.status !== "running"} onChange={(v) => { setDraft((d) => ({ ...d, noiseLevel: v })); setPending(true); }} />
              <Knob label="Anomaly intensity" value={draft.anomalyIntensity} min={0} max={1} step={0.01} format={(v) => (v === 0 ? "off" : `${(v * 100).toFixed(0)}%`)} disabled={engine.status !== "running"} onChange={(v) => { setDraft((d) => ({ ...d, anomalyIntensity: v })); setPending(true); }} />
            </div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Operating condition</p>
            <div className="flex flex-col gap-1">
              {MODE_PRESETS.map((p) => {
                const active = cfg.mode === p.mode;
                return (
                  <button
                    key={p.mode}
                    onClick={() => {
                      engine.setSimulatorConfig(p.config);
                      setDraft((d) => ({ ...d, ...p.config }));
                      setPending(false);
                    }}
                    disabled={engine.status !== "running"}
                    className={cn(
                      "rounded border px-2 py-1 text-left text-[10px] font-semibold tracking-wide transition-colors",
                      active
                        ? "border-primary/60 bg-primary/15 text-primary"
                        : "border-border/70 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: one-click scenarios + cause→effect chain */}
      <div className="flex flex-col gap-3">
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Replay scenarios</p>
          <div className="flex flex-wrap gap-1.5">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => engine.startScenario(s.id)}
                disabled={engine.status !== "running"}
                title={s.description}
                className="flex items-center gap-1 rounded border border-border/70 px-2 py-1 text-[10px] font-semibold tracking-wide text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-40"
              >
                <Play className="size-2.5" />
                {s.title}
              </button>
            ))}
            {engine.activeScenario ? (
              <button onClick={engine.stopScenario} className="flex items-center gap-1 rounded border border-status-anomaly/50 px-2 py-1 text-[10px] font-semibold text-status-anomaly">
                <Square className="size-2.5" />
                STOP {engine.activeScenario.title.toUpperCase()}
              </button>
            ) : null}
          </div>
        </div>

        {/* Cause → effect chain (real values) */}
        <div className="rounded-md border border-border/60 bg-background/40 p-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Cause → effect · live
          </p>
          <div className="space-y-1 font-mono text-[10px] leading-relaxed text-muted-foreground">
            <p>
              <span className="text-foreground">machine change</span> → amp {cfg.vibrationAmplitude.toFixed(2)} g @ {cfg.rotationFrequencyHz.toFixed(0)} Hz
            </p>
            <p>
              <span className="text-foreground">features</span> → RMS {currentDominantFreq > 0 ? "updated" : "…"} · dominant freq{" "}
              <span className={cn("font-bold", freqShift > baselineDominantFreq * 0.12 ? "text-status-anomaly" : "text-foreground")}>
                {currentDominantFreq.toFixed(0)} Hz
              </span>
              {freqShift > baselineDominantFreq * 0.12 ? ` (shifted from ${baselineDominantFreq.toFixed(0)} Hz)` : ""}
            </p>
            <p>
              <span className="text-foreground">isolation forest</span> → vibration {cfg.anomalyIntensity > 0 ? "re-scoring" : "monitoring"} · fusion {engine.snapshot?.latest?.fusion.state.replace("-", " ") ?? "…"}
            </p>
            <p>
              <span className="text-foreground">decision</span> →{" "}
              <span className={cn("font-bold", engine.snapshot?.latest && engine.snapshot.latest.fusion.state !== "healthy" ? "text-status-anomaly" : "text-status-healthy")}>
                {engine.snapshot?.latest?.investigation.headline ?? "HEALTHY"}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
