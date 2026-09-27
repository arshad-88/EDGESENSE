/**
 * FingerprintRadar — "behaviour bloom": a dual-ring polar fingerprint where
 * each feature is a petal. The inner dashed ring is the learned baseline;
 * petals extend outward/inward with signed deviation and carry a gradient
 * that shifts hue as deviation grows. Vibration and acoustic petals are
 * drawn as interleaved mirrored hemispheres so both modalities are visible
 * at once and the overall bloom shape is instantly different between
 * NORMAL / HEAVY LOAD / ANOMALY.
 */
import { useMemo } from "react";
import { motion } from "framer-motion";
import { FEATURE_LABELS } from "@/core/edgesense";
import type { FeatureName, FingerprintBarLite } from "@/core/edgesense";
import { cn } from "@/lib/utils";

interface Props {
  vibration: FingerprintBarLite[];
  acoustic: FingerprintBarLite[];
}

const SIZE = 320;
const C = SIZE / 2;
const R_BASE = 62; // baseline ring radius
const R_SPAN = 78; // max petal extension

interface Petal {
  feature: string;
  label: string;
  angle: number; // radians
  len: number; // signed px length (out = deviation up)
  dev: number;
  accent: string;
}

function buildPetals(
  data: FingerprintBarLite[],
  startAngle: number,
  endAngle: number,
  accent: string,
): Petal[] {
  const n = data.length || 1;
  return data.map((d, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const angle = startAngle + (endAngle - startAngle) * t;
    const dev = Math.max(-0.9, Math.min(0.9, d.deviation));
    return {
      feature: d.feature,
      label: FEATURE_LABELS[d.feature as FeatureName] ?? d.feature,
      angle,
      len: dev * R_SPAN,
      dev,
      accent,
    };
  });
}

function petalPath(p: Petal): string {
  // A slim teardrop from the baseline ring outward (or inward).
  const tipR = R_BASE + p.len;
  const baseHalf = 0.055; // radians half-width at ring
  const tipHalf = 0.016;
  const x1a = C + Math.cos(p.angle - baseHalf) * (R_BASE - 4);
  const y1a = C + Math.sin(p.angle - baseHalf) * (R_BASE - 4);
  const x1b = C + Math.cos(p.angle + baseHalf) * (R_BASE - 4);
  const y1b = C + Math.sin(p.angle + baseHalf) * (R_BASE - 4);
  const tipX = C + Math.cos(p.angle) * tipR;
  const tipY = C + Math.sin(p.angle) * tipR;
  const x2a = C + Math.cos(p.angle + tipHalf) * tipR;
  const y2a = C + Math.sin(p.angle + tipHalf) * tipR;
  const x2b = C + Math.cos(p.angle - tipHalf) * tipR;
  const y2b = C + Math.sin(p.angle - tipHalf) * tipR;
  return `M ${x1a} ${y1a} L ${x1b} ${y1b} L ${x2a} ${y2a} L ${tipX} ${tipY} L ${x2b} ${y2b} Z`;
}

export function FingerprintRadar({ vibration, acoustic }: Props) {
  const petals = useMemo(() => {
    const vib = buildPetals(vibration, Math.PI * 1.02, Math.PI * 1.98, "#38bdf8");
    const ac = buildPetals(acoustic, Math.PI * 0.02, Math.PI * 0.98, "#fb923c");
    return [...vib, ...ac];
  }, [vibration, acoustic]);

  const maxDev = useMemo(
    () => Math.max(0, ...petals.map((p) => Math.abs(p.dev))),
    [petals],
  );
  const deviating = maxDev > 0.18;
  const sevColor = deviating
    ? maxDev > 0.45
      ? "var(--status-anomaly)"
      : "var(--status-suspicious)"
    : "var(--status-healthy)";

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">Machine Behaviour Fingerprint</h3>
          <p className="text-[11px] text-muted-foreground">
            Behaviour bloom — petals show signed deviation per feature, both sensors at once
          </p>
        </div>
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-widest",
            deviating ? "border-status-anomaly/50 text-status-anomaly" : "border-status-healthy/50 text-status-healthy",
          )}
        >
          {deviating ? "DEVIATING" : "WITHIN BASELINE"}
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full" role="img" aria-label="Behaviour fingerprint bloom">
          <defs>
            <radialGradient id="bloomGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={sevColor} stopOpacity={0.14} />
              <stop offset="70%" stopColor={sevColor} stopOpacity={0.04} />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>

          <circle cx={C} cy={C} r={R_BASE + R_SPAN + 14} fill="url(#bloomGlow)" />

          {/* reference rings */}
          <circle cx={C} cy={C} r={R_BASE} fill="none" className="stroke-border" strokeOpacity={0.6} strokeDasharray="4 3" />
          <circle cx={C} cy={C} r={R_BASE + R_SPAN} fill="none" className="stroke-border" strokeOpacity={0.22} />
          <circle cx={C} cy={C} r={R_BASE - R_SPAN * 0.6} fill="none" className="stroke-border" strokeOpacity={0.18} />

          {/* hemisphere separators */}
          <line x1={C} y1={4} x2={C} y2={SIZE - 4} className="stroke-border" strokeOpacity={0.15} />

          {/* petals */}
          {petals.map((p, i) => {
            const mag = Math.abs(p.dev);
            // color blends from sensor accent to severity color with magnitude
            const color = mag > 0.45 ? "#eb3723" : mag > 0.18 ? "#f0a13c" : p.accent;
            return (
              <motion.path
                key={`${p.feature}-${i}`}
                d={petalPath(p)}
                fill={color}
                fillOpacity={0.28 + mag * 0.5}
                stroke={color}
                strokeWidth={1}
                initial={false}
                animate={{ d: petalPath(p), fillOpacity: 0.28 + mag * 0.5 }}
                transition={{ duration: 0.55, ease: "easeOut" }}
              >
                <title>
                  {p.label}: {(p.dev * 100).toFixed(0)}% vs baseline
                </title>
              </motion.path>
            );
          })}

          {/* tip dots */}
          {petals.map((p, i) => {
            const r = R_BASE + p.len;
            return (
              <motion.circle
                key={`dot-${i}`}
                cx={C + Math.cos(p.angle) * r}
                cy={C + Math.sin(p.angle) * r}
                r={2}
                fill={Math.abs(p.dev) > 0.18 ? "#fff" : p.accent}
                initial={false}
                animate={{
                  cx: C + Math.cos(p.angle) * r,
                  cy: C + Math.sin(p.angle) * r,
                }}
                transition={{ duration: 0.55 }}
              />
            );
          })}

          {/* center readout */}
          <text x={C} y={C - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill={sevColor} fontFamily="ui-monospace, monospace">
            {(maxDev * 100).toFixed(0)}%
          </text>
          <text x={C} y={C + 8} textAnchor="middle" fontSize={7.5} className="fill-muted-foreground" letterSpacing={1.5}>
            MAX DEV
          </text>

          {/* hemisphere labels */}
          <text x={C} y={16} textAnchor="middle" fontSize={8.5} fill="#fb923c" letterSpacing={2}>
            INMP441 · ACOUSTIC
          </text>
          <text x={C} y={SIZE - 8} textAnchor="middle" fontSize={8.5} fill="#38bdf8" letterSpacing={2}>
            ADXL345 · VIBRATION
          </text>
        </svg>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-px w-4 border-t border-dashed border-muted-foreground" /> baseline ring
        </span>
        <span>petal outward = above baseline · inward = below</span>
      </div>
    </div>
  );
}
