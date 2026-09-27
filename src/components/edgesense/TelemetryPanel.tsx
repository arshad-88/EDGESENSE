/**
 * TelemetryPanel — live engineering instrumentation for both modalities.
 * Waveform and FFT from real pipeline samples; they visibly respond to
 * simulator changes (amplitude → waveform, frequency → FFT peak position).
 */
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PipelineFrame } from "@/core/edgesense";
import { fmt, fmtCompact } from "./ui-helpers";
import { cn } from "@/lib/utils";

interface Props {
  frame: PipelineFrame | null;
}

function Modality({
  name,
  sensor,
  samples,
  spectrum,
  flag,
  accent,
  metrics,
}: {
  name: string;
  sensor: string;
  samples: number[];
  spectrum?: { frequencies: number[]; magnitudes: number[]; dominantFrequency: number };
  flag: boolean;
  accent: string;
  metrics: Array<{ label: string; value: string }>;
}) {
  const wave = samples.map((v, i) => ({ i, v }));
  const spec = (spectrum?.frequencies ?? []).map((f, i) => ({ f, m: spectrum?.magnitudes[i] ?? 0 }));

  return (
    <div className={cn("rounded-md border p-3", flag ? "border-status-anomaly/50" : "border-border/50")}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <div>
          <span className="text-[11px] font-bold tracking-widest" style={{ color: accent }}>
            {name}
          </span>
          <span className="ml-2 text-[10px] text-muted-foreground">{sensor}</span>
        </div>
        {flag ? (
          <span className="rounded bg-status-anomaly/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-status-anomaly">
            ANOMALOUS
          </span>
        ) : null}
      </div>

      {/* waveform */}
      <div className="h-14">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={wave} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
            <YAxis hide domain={[-2.5, 2.5]} />
            <Area
              dataKey="v"
              type="monotone"
              stroke={accent}
              fill={accent}
              fillOpacity={0.14}
              strokeWidth={1}
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* spectrum */}
      <div className="h-14">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={spec} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
            <XAxis hide dataKey="f" type="number" domain={[0, 256]} />
            <YAxis hide />
            <Tooltip
              cursor={false}
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 10 }}
              labelFormatter={(f) => `${Number(f).toFixed(0)} Hz`}
              formatter={(v) => [Number(v).toExponential(1), "magnitude"]}
            />
            <Area
              dataKey="m"
              type="monotone"
              stroke={accent}
              fill={accent}
              fillOpacity={0.2}
              strokeWidth={1}
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
        {metrics.map((m) => (
          <span key={m.label} className="text-muted-foreground">
            {m.label} <span className="font-semibold tabular-nums text-foreground">{m.value}</span>
          </span>
        ))}
        {spectrum ? (
          <span className="text-muted-foreground">
            peak{" "}
            <span className="font-semibold tabular-nums" style={{ color: accent }}>
              {fmt(spectrum.dominantFrequency, 0)} Hz
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function TelemetryPanel({ frame }: Props) {
  const vib = frame?.vibration;
  const ac = frame?.acoustic;

  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-2 text-sm font-semibold">Live Machine Telemetry</h3>
      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
        <Modality
          name="VIBRATION"
          sensor="ADXL345 · 3-axis"
          samples={vib?.samples ?? []}
          spectrum={vib?.spectrum}
          flag={vib?.anomaly.isAnomaly ?? false}
          accent="var(--chart-1)"
          metrics={[
            { label: "RMS", value: fmtCompact(vib?.features.values.rms ?? 0) },
            { label: "peak", value: fmtCompact(vib?.features.values.peak ?? 0) },
            { label: "kurt", value: fmtCompact(vib?.features.values.kurtosis ?? 0) },
          ]}
        />
        <Modality
          name="ACOUSTIC"
          sensor="INMP441 · mono"
          samples={ac?.samples ?? []}
          spectrum={ac?.spectrum}
          flag={ac?.anomaly.isAnomaly ?? false}
          accent="var(--chart-2)"
          metrics={[
            { label: "RMS", value: fmtCompact(ac?.features.values.rms ?? 0) },
            { label: "energy", value: fmtCompact(ac?.features.values.spectralEnergy ?? 0) },
            { label: "kurt", value: fmtCompact(ac?.features.values.kurtosis ?? 0) },
          ]}
        />
      </div>
    </div>
  );
}
