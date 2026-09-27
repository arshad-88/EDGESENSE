import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import type { PipelineFrame } from "@/core/edgesense";
import { FEATURE_LABELS } from "@/core/edgesense";
import { fmt, fmtCompact } from "./ui-helpers";

interface SensorPanelProps {
  title: string;
  sensor: string;
  frame: PipelineFrame | null;
  modality: "vibration" | "acoustic";
  /** Anomaly indicator for this sensor's latest result. */
  indicator: number;
  isAnomaly: boolean;
  qualityNote: string;
  qualityScore: number;
}

/** Raw waveform + FFT side-by-side, with feature readouts. */
export function SensorPanel({
  title,
  sensor,
  frame,
  modality,
  indicator,
  isAnomaly,
  qualityNote,
  qualityScore,
}: SensorPanelProps) {
  const side = modality === "vibration" ? frame?.vibration : frame?.acoustic;
  const samples = side?.samples ?? [];
  const spectrum = side?.spectrum;

  const wave = samples.map((v, i) => ({ i, v }));
  const spec = (spectrum?.frequencies ?? []).map((f, i) => ({
    f,
    m: spectrum?.magnitudes[i] ?? 0,
  }));

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          <p className="text-[11px] text-muted-foreground">{sensor}</p>
        </div>
        <div className="text-right">
          <div
            className={`text-lg font-bold tabular-nums ${
              isAnomaly ? "text-status-anomaly" : "text-status-healthy"
            }`}
          >
            {indicator.toFixed(2)}
          </div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            indicator
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Waveform */}
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Raw signal
          </p>
          <div className="h-16 rounded-md border border-border/50 bg-background/60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={wave} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
                <YAxis hide domain={[-2, 2]} />
                <Area
                  dataKey="v"
                  type="monotone"
                  stroke="currentColor"
                  fill="currentColor"
                  fillOpacity={0.15}
                  strokeWidth={1}
                  isAnimationActive={false}
                  className="text-primary"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Spectrum */}
        <div>
          <p className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>FFT spectrum</span>
            {spectrum ? (
              <span className="normal-case tracking-normal">
                peak {fmt(spectrum.dominantFrequency, 0)} Hz
              </span>
            ) : null}
          </p>
          <div className="h-16 rounded-md border border-border/50 bg-background/60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spec} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
                <YAxis hide />
                <Area
                  dataKey="m"
                  type="monotone"
                  stroke="currentColor"
                  fill="currentColor"
                  fillOpacity={0.2}
                  strokeWidth={1}
                  isAnimationActive={false}
                  className="text-chart-2"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Feature readouts */}
        {side ? (
          <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 pt-1">
            {(["rms", "variance", "peak", "kurtosis", "dominantFreq", "spectralEnergy"] as const).map(
              (f) => (
                <div key={f} className="text-[11px] leading-tight">
                  <span className="block text-muted-foreground">{FEATURE_LABELS[f]}</span>
                  <span className="font-semibold tabular-nums">{fmtCompact(side.features.values[f])}</span>
                </div>
              ),
            )}
          </div>
        ) : (
          <div className="py-3 text-center text-[11px] text-muted-foreground">
            Waiting for the first window…
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          quality {Math.round(qualityScore * 100)}% · {qualityNote}
        </p>
      </CardContent>
    </Card>
  );
}
