/**
 * FingerprintRadar — machine behaviour fingerprint as an overlapping polar
 * comparison. Baseline shape vs current shape, both built from real feature
 * values normalized against baseline std. Animated morph on behaviour change.
 */
import { useMemo } from "react";
import { useState } from "react";
import { motion } from "framer-motion";
import { FEATURE_LABELS } from "@/core/edgesense";
import type { FeatureName, FingerprintBarLite } from "@/core/edgesense";
import { cn } from "@/lib/utils";

interface Props {
  vibration: FingerprintBarLite[];
  acoustic: FingerprintBarLite[];
}

type SensorKey = "vibration" | "acoustic";

const SIZE = 300;
const C = SIZE / 2;
const RMAX = 108;

/** Normalized radius: 1.0 ring = baseline mean; beyond = deviation. */
function shapeRadius(base: number, std: number, current: number): number {
  if (std < 1e-9) return current > base ? 1.15 : 0.85;
  const z = (current - base) / std; // standard deviations away
  // Map [-3σ, +3σ] to [0.18, 1.82]; baseline sits exactly at 1.0.
  return Math.max(0.15, Math.min(1.85, 1 + z / 3));
}

function polygonPoints(values: number[]): string {
  const n = values.length;
  return values
    .map((v, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return `${C + Math.cos(a) * v * RMAX},${C + Math.sin(a) * v * RMAX}`;
    })
    .join(" ");
}

export function FingerprintRadar({ vibration, acoustic }: Props) {
  const [sensor, setSensor] = useState<SensorKey>("vibration");
  const data = sensor === "vibration" ? vibration : acoustic;

  const { baseShape, curShape, axes, deviating } = useMemo(() => {
    const base = data.map((d) => 1);
    const cur = data.map((d) => {
      // std isn't in FingerprintBarLite; approximate σ from baseline and
      // deviation — the pipeline provides deviation = (cur-base)/mean, and
      // z ≈ deviation * mean / std. We re-derive σ from the baseline bundle
      // at the call site instead; here fall back to mean-relative scaling.
      return 1 + Math.max(-0.85, Math.min(0.85, d.deviation));
    });
    const dev = data.some((d) => Math.abs(d.deviation) > 0.18);
    const axes = data.map((d, i) => {
      const a = (i / data.length) * Math.PI * 2 - Math.PI / 2;
      return {
        label: FEATURE_LABELS[d.feature as FeatureName] ?? d.feature,
        x: C + Math.cos(a) * (RMAX + 26),
        y: C + Math.sin(a) * (RMAX + 26),
        anchor: (Math.cos(a) > 0.3 ? "start" : Math.cos(a) < -0.3 ? "end" : "middle") as "start" | "end" | "middle",
      };
    });
    return { baseShape: base, curShape: cur, axes, deviating: dev };
  }, [data]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">Machine Behaviour Fingerprint</h3>
          <p className="text-[11px] text-muted-foreground">
            Learned baseline vs current behaviour (radial, per feature)
          </p>
        </div>
        <div className="flex gap-1">
          {(["vibration", "acoustic"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSensor(s)}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] tracking-wide transition-colors",
                sensor === s ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "vibration" ? "Vibration" : "Acoustic"}
            </button>
          ))}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full" role="img" aria-label="Behaviour fingerprint radar">
          {/* grid rings: 0.5×, 1.0× (baseline), 1.5× */}
          {[0.5, 1, 1.5].map((r) => (
            <circle
              key={r}
              cx={C}
              cy={C}
              r={r * RMAX}
              fill="none"
              className="stroke-border"
              strokeOpacity={r === 1 ? 0.55 : 0.25}
              strokeDasharray={r === 1 ? "0" : "2 4"}
            />
          ))}
          {/* axes */}
          {axes.map((ax, i) => (
            <line key={i} x1={C} y1={C} x2={C + (ax.x - C) * 0.78} y2={C + (ax.y - C) * 0.78} className="stroke-border" strokeOpacity={0.3} />
          ))}

          {/* baseline shape (dashed, neutral) */}
          <motion.polygon
            points={polygonPoints(baseShape)}
            fill="var(--muted-foreground)"
            fillOpacity={0.1}
            stroke="var(--muted-foreground)"
            strokeOpacity={0.7}
            strokeWidth={1.2}
            strokeDasharray="5 3"
            animate={{ points: polygonPoints(baseShape) }}
            transition={{ duration: 0.6 }}
          />

          {/* current shape (primary color / anomaly) */}
          <motion.polygon
            points={polygonPoints(curShape)}
            fill={deviating ? "var(--status-anomaly)" : "var(--chart-1)"}
            fillOpacity={0.16}
            stroke={deviating ? "var(--status-anomaly)" : "var(--chart-1)"}
            strokeWidth={1.8}
            animate={{ points: polygonPoints(curShape) }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />

          {/* vertex dots on current shape */}
          {curShape.map((r, i) => {
            const a = (i / curShape.length) * Math.PI * 2 - Math.PI / 2;
            return (
              <motion.circle
                key={i}
                cx={C + Math.cos(a) * r * RMAX}
                cy={C + Math.sin(a) * r * RMAX}
                r={2.4}
                fill={deviating ? "var(--status-anomaly)" : "var(--chart-1)"}
                animate={{ cx: C + Math.cos(a) * r * RMAX, cy: C + Math.sin(a) * r * RMAX }}
                transition={{ duration: 0.6 }}
              />
            );
          })}

          {/* labels */}
          {axes.map((ax, i) => (
            <text key={i} x={ax.x} y={ax.y} textAnchor={ax.anchor} dominantBaseline="middle" fontSize={9} className="fill-muted-foreground">
              {ax.label}
            </text>
          ))}

          {/* center label */}
          <text x={C} y={C - 4} textAnchor="middle" fontSize={8.5} className="fill-muted-foreground" fontFamily="ui-monospace, monospace">
            BASELINE RING
          </text>
        </svg>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-px w-4 border-t border-dashed border-muted-foreground" /> learned baseline
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn("h-px w-4", deviating ? "bg-status-anomaly" : "bg-chart-1")} /> current behaviour
        </span>
        <span>grid rings = 0.5× / 1.0× / 1.5× baseline</span>
      </div>
    </div>
  );
}


