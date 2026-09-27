/**
 * BehaviourMap — "what the machine learned as normal" and where it is now.
 *
 * Dense scatter of PCA-projected training observations, a learned envelope
 * (95th-percentile-style boundary via convex-ish radius hull), the recent
 * trajectory of live points, and the current point. PCA is visualization
 * only — detection remains Isolation Forest.
 */
import { useMemo } from "react";
import { motion } from "framer-motion";
import type { CloudPoint } from "@/core/edgesense";
import { cn } from "@/lib/utils";

interface Props {
  baseline: CloudPoint[];
  live: CloudPoint[];
  trajectory: CloudPoint[];
  currentIsAnomaly: boolean;
  sensor: "ADXL345" | "INMP441";
  onSensorChange: (s: "ADXL345" | "INMP441") => void;
}

const W = 460;
const H = 320;
const PAD = 34;

function percentile(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
}

export function BehaviourMap({
  baseline,
  live,
  trajectory,
  currentIsAnomaly,
  sensor,
  onSensorChange,
}: Props) {
  const view = useMemo(() => {
    const pts = baseline.filter((p) => p.sensor === sensor);
    const lives = live.filter((p) => p.sensor === sensor);
    if (pts.length < 4) return null;

    const xs = pts.map((p) => p.pc1);
    const ys = pts.map((p) => p.pc2);
    const mx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const my = (Math.max(...ys) + Math.min(...ys)) / 2;

    // Envelope: 97th percentile radius from centroid (robust boundary).
    const radii = pts.map((p) => Math.hypot(p.pc1 - mx, p.pc2 - my));
    const rEnv = Math.max(percentile(radii, 0.97), 1e-6);

    // Scale to fit the envelope with margin.
    const span = Math.max(rEnv * 1.25, 1e-6);
    const sx = (v: number) => W / 2 + ((v - mx) / span) * (W / 2 - PAD);
    const sy = (v: number) => H / 2 - ((v - my) / span) * (H / 2 - PAD);

    const envPts: Array<[number, number]> = [];
    const N = 72;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      envPts.push([mx + Math.cos(a) * rEnv, my + Math.sin(a) * rEnv]);
    }

    const current = lives[lives.length - 1] ?? null;
    const dist = current ? Math.hypot(current.pc1 - mx, current.pc2 - my) : 0;
    const outside = dist > rEnv;

    return {
      baseScreen: pts.map((p) => ({ x: sx(p.pc1), y: sy(p.pc2) })),
      liveScreen: lives.slice(-60).map((p) => ({ x: sx(p.pc1), y: sy(p.pc2), anomaly: p.isAnomaly })),
      trajScreen: trajectory
        .filter((p) => p.sensor === sensor)
        .map((p) => ({ x: sx(p.pc1), y: sy(p.pc2) })),
      envPath: envPts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${sx(x)},${sy(y)}`).join(" ") + " Z",
      current: current ? { x: sx(current.pc1), y: sy(current.pc2) } : null,
      outside,
      distRatio: dist / rEnv,
    };
  }, [baseline, live, trajectory, sensor]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">Normal Behaviour Map</h3>
          <p className="text-[11px] text-muted-foreground">
            Learned machine operating envelope · 2D PCA projection of feature space
          </p>
        </div>
        <div className="flex gap-1">
          {(["ADXL345", "INMP441"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onSensorChange(s)}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] tracking-wide transition-colors",
                sensor === s
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "ADXL345" ? "Vibration" : "Acoustic"}
            </button>
          ))}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Normal behaviour map">
          {/* envelope fill */}
          {view ? (
            <>
              <path d={view.envPath} fill="var(--chart-4)" fillOpacity={0.06} stroke="var(--chart-4)" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="4 4" />
              {/* dense normal cloud */}
              {view.baseScreen.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={1.6} fill="var(--chart-4)" fillOpacity={0.5} />
              ))}
              {/* recent trajectory */}
              {view.trajScreen.length > 1 ? (
                <polyline
                  points={view.trajScreen.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={view.outside ? "var(--status-anomaly)" : "var(--chart-1)"}
                  strokeWidth={1.2}
                  strokeOpacity={0.6}
                />
              ) : null}
              {/* live trail dots */}
              {view.liveScreen.slice(0, -1).map((p, i) => (
                <circle key={`l${i}`} cx={p.x} cy={p.y} r={1.8} fill="var(--chart-1)" fillOpacity={0.45} />
              ))}
              {/* current point */}
              {view.current ? (
                <g>
                  <motion.circle
                    animate={{ cx: view.current.x, cy: view.current.y }}
                    transition={{ type: "spring", stiffness: 90, damping: 18 }}
                    r={7}
                    fill="none"
                    stroke={view.outside || currentIsAnomaly ? "var(--status-anomaly)" : "var(--chart-1)"}
                    strokeWidth={1.6}
                  />
                  <motion.circle
                    animate={{ cx: view.current.x, cy: view.current.y }}
                    transition={{ type: "spring", stiffness: 90, damping: 18 }}
                    r={3}
                    className={view.outside || currentIsAnomaly ? "fill-status-anomaly" : "fill-chart-1"}
                  />
                  <motion.line
                    animate={{ x1: view.current.x, y1: view.current.y }}
                    transition={{ type: "spring", stiffness: 90, damping: 18 }}
                    x2={W - 8}
                    y2={PAD - 6}
                    stroke="var(--muted-foreground)"
                    strokeOpacity={0.35}
                    strokeDasharray="2 3"
                  />
                  <text x={W - 8} y={PAD - 10} textAnchor="end" fontSize={9} className="fill-muted-foreground" fontFamily="ui-monospace, monospace">
                    CURRENT
                  </text>
                </g>
              ) : null}
              {/* deviation label */}
              {view.outside ? (
                <g>
                  <rect x={12} y={12} width={132} height={22} rx={4} fill="var(--status-anomaly)" fillOpacity={0.14} stroke="var(--status-anomaly)" strokeOpacity={0.5} />
                  <text x={20} y={27} fontSize={10} className="fill-status-anomaly" fontWeight={700} fontFamily="ui-monospace, monospace">
                    BEHAVIOUR DEVIATION
                  </text>
                </g>
              ) : null}
            </>
          ) : (
            <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={11} className="fill-muted-foreground">
              learning envelope…
            </text>
          )}
        </svg>
      </div>

      {/* legend */}
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-chart-4" /> normal behaviour
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full border border-chart-1" /> current (in family)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full border border-status-anomaly" /> current (deviating)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-px w-4 border-t border-dashed border-chart-4" /> learned envelope
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-px w-4 border-t border-dashed border-chart-1" /> recent trajectory
        </span>
      </div>
      {view ? (
        <p className="mt-1 text-[10px] text-muted-foreground">
          {view.outside
            ? "Current sample is outside the learned normal region — flagged for investigation."
            : `Inside learned envelope (${Math.round(view.distRatio * 100)}% of envelope radius).`}
        </p>
      ) : null}
    </div>
  );
}
