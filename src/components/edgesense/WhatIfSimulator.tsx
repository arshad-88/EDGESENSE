import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { FlaskConical, Undo2 } from "lucide-react";
import type { SimulatorConfig } from "@/core/edgesense";
import { DEFAULT_SIMULATOR_CONFIG } from "@/core/edgesense";
import type { EdgeSenseApi } from "@/hooks/use-edgesense";

interface SliderDef {
  key: keyof SimulatorConfig;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const SLIDERS: SliderDef[] = [
  {
    key: "vibrationAmplitude",
    label: "Vibration amplitude",
    min: 0.05,
    max: 1.2,
    step: 0.01,
    format: (v) => `${v.toFixed(2)} g`,
  },
  {
    key: "rotationFrequencyHz",
    label: "Rotation frequency",
    min: 10,
    max: 110,
    step: 1,
    format: (v) => `${v.toFixed(0)} Hz`,
  },
  {
    key: "acousticEnergy",
    label: "Acoustic energy",
    min: 0,
    max: 2,
    step: 0.05,
    format: (v) => `${(v * 100).toFixed(0)}%`,
  },
  {
    key: "noiseLevel",
    label: "Noise level",
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => `${(v * 100).toFixed(0)}%`,
  },
  {
    key: "harmonicStrength",
    label: "Harmonic strength",
    min: 0,
    max: 2,
    step: 0.05,
    format: (v) => `${(v * 100).toFixed(0)}%`,
  },
  {
    key: "anomalyIntensity",
    label: "Anomaly intensity",
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => (v === 0 ? "off" : `${(v * 100).toFixed(0)}%`),
  },
];

/**
 * What-If Machine Simulator: sliders drive the synthetic machine; every change
 * flows through signals → features → FFT → Isolation Forest → fusion →
 * explanation live on the dashboard.
 */
export function WhatIfSimulator({ engine }: { engine: EdgeSenseApi }) {
  const cfg = engine.simulatorConfig;
  const [draft, setDraft] = useState<SimulatorConfig>(cfg);

  // Keep the draft in sync when a replay scenario changes the machine.
  useEffect(() => {
    setDraft(cfg);
  }, [cfg]);

  const dirty = (Object.keys(DEFAULT_SIMULATOR_CONFIG) as Array<keyof SimulatorConfig>).some(
    (k) => Math.abs((draft[k] as number) - (DEFAULT_SIMULATOR_CONFIG[k] as number)) > 1e-9,
  );

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <FlaskConical className="size-4 text-primary" />
            What-If Machine Simulator
          </CardTitle>
          {dirty ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[10px]"
              onClick={() => engine.setSimulatorConfig(DEFAULT_SIMULATOR_CONFIG)}
            >
              <Undo2 className="size-3" />
              Reset to healthy
            </Button>
          ) : null}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Change the machine and watch the full pipeline respond: signals →
          features → FFT → Isolation Forest → fusion → explanation.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {SLIDERS.map((s) => (
          <div key={s.key}>
            <div className="mb-1 flex items-baseline justify-between text-[11px]">
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-medium tabular-nums">
                {s.format(draft[s.key] as number)}
              </span>
            </div>
            <Slider
              value={[draft[s.key] as number]}
              min={s.min}
              max={s.max}
              step={s.step}
              onValueChange={(vals) => {
                const v = vals[0];
                setDraft((d) => ({ ...d, [s.key]: v }));
                // Live-apply for immediate feedback.
                engine.setSimulatorConfig({ [s.key]: v });
              }}
              disabled={engine.status !== "running"}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
