/**
 * FingerprintRadar — machine behaviour fingerprint: a precise dual-ring
 * engineering radar. Baseline = dashed neutral polygon; current = sensor
 * accent polygon with sharp vertices. Radius = signed deviation mapped
 * symmetrically around the baseline ring. Shows both sensors as interleaved
 * spokes for one combined machine fingerprint.
 */
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
const R_BASE = 66;
const R_SPAN = 76;

/** Map signed deviation [-0.9, 0.9] → radius [R_BASE - R_SPAN, R_BASE + R_SPAN]. */
function devRadius(dev: number): number {
  const d = Math.max(-0.9, Math.min(0.9, dev));
  return R_BASE + (d / 0.9) * R_SPAN;
}

function polygonPoints(devs: number[], offset: number): string {
  const n = devs.length;
  return devs
    .map((dev, i) => {
      const a = ((i + offset) / n) * Math.PI * 2 - Math.PI / 2;
      const r = devRadius(dev);
      return `${C + Math.cos(a) * r},${C + Math.sin(a) * r}`;
    })
    .join(" ");
}

export function FingerprintRadar({ vibration, acoustic }: Props) {
  const vibDevs = vibration.map((d) => Math.max(-0.9, Math.min(0.9, d.deviation)));
  const acDevs = acoustic.map((d) => Math.max(-0.9, Math.min(0.9, d.deviation)));
  const maxDev = Math.max(0, ...vibDevs.map(Math.abs), ...acDevs.map(Math.abs));
  const deviating = maxDev > 0.18;
  const sevColor = deviating
    ? maxDev > 0.45
      ? "#eb3723"
      : "#f0a13c"
    : "#34d399";

  return (
    <div className="flex h-full flex-col">
      {/* No local heading — the panel frame already titles this region. */}
      <div className="mb-1 flex items-center justify-between">
        <p className="label-tech">
          SIGNED DEVIATION PER FEATURE · DASHED RING = BASELINE
        </p>
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-widest",
            deviating
              ? "border-status-anomaly/50 text-status-anomaly"
              : "border-status-healthy/50 text-status-healthy",
          )}
        >
          {deviating ? "DEVIATING" : "WITHIN BASELINE"}
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-full w-full"
          role="img"
          aria-label="Behaviour fingerprint radar"
        >
          {/* reference rings: -0.9, -0.45, baseline, +0.45, +0.9 */}
          {[-0.9, -0.45, 0, 0.45, 0.9].map((d) => (
            <circle
              key={d}
              cx={C}
              cy={C}
              r={devRadius(d)}
              fill="none"
              className="stroke-border"
              strokeOpacity={d === 0 ? 0.65 : 0.22}
              strokeDasharray={d === 0 ? "4 3" : "1 4"}
            />
          ))}

          {/* spokes + labels — vibration inner offsets */}
          {vibration.map((d, i) => {
            const n = vibration.length * 2;
            const a = ((i * 2 + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
            const r = devRadius(0.9);
            return (
              <g key={`v-${d.feature}`}>
                <line
                  x1={C}
                  y1={C}
                  x2={C + Math.cos(a) * r}
                  y2={C + Math.sin(a) * r}
                  className="stroke-border"
                  strokeOpacity={0.18}
                />
                <text
                  x={C + Math.cos(a) * (r + 12)}
                  y={C + Math.sin(a) * (r + 12)}
                  textAnchor="middle"
                  fontSize={7.5}
                  fill="#7dd3fc"
                >
                  {FEATURE_LABELS[d.feature as FeatureName] ?? d.feature}
                </text>
              </g>
            );
          })}
          {/* acoustic spokes offset between vibration spokes */}
          {acoustic.map((d, i) => {
            const n = acoustic.length * 2;
            const a = ((i * 2 + 1.5) / n) * Math.PI * 2 - Math.PI / 2;
            const r = devRadius(0.9);
            return (
              <g key={`a-${d.feature}`}>
                <line
                  x1={C}
                  y1={C}
                  x2={C + Math.cos(a) * r}
                  y2={C + Math.sin(a) * r}
                  className="stroke-border"
                  strokeOpacity={0.18}
                />
                <text
                  x={C + Math.cos(a) * (r + 12)}
                  y={C + Math.sin(a) * (r + 12)}
                  textAnchor="middle"
                  fontSize={7.5}
                  fill="#fdba74"
                >
                  {FEATURE_LABELS[d.feature as FeatureName] ?? d.feature}
                </text>
              </g>
            );
          })}

          {/* baseline polygon (perfect ring at dashed circle) */}
          <motion.polygon
            points={polygonPoints(vibration.map(() => 0), 0.5)}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeOpacity={0.5}
            strokeWidth={1}
            strokeDasharray="4 3"
          />

          {/* current vibration shape */}
          <motion.polygon
            points={polygonPoints(vibDevs, 0.5)}
            fill="#38bdf8"
            fillOpacity={0.14}
            stroke="#38bdf8"
            strokeWidth={1.8}
            strokeLinejoin="round"
            initial={false}
            animate={{ points: polygonPoints(vibDevs, 0.5) }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
          {/* current acoustic shape */}
          <motion.polygon
            points={polygonPoints(acDevs, 1.5)}
            fill="#fb923c"
            fillOpacity={0.14}
            stroke="#fb923c"
            strokeWidth={1.8}
            strokeLinejoin="round"
            initial={false}
            animate={{ points: polygonPoints(acDevs, 1.5) }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />

          {/* vertex markers on both shapes */}
          {vibDevs.map((dev, i) => {
            const n = vibDevs.length * 2;
            const a = ((i * 2 + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
            const r = devRadius(dev);
            return (
              <motion.circle
                key={`vd-${i}`}
                cx={C + Math.cos(a) * r}
                cy={C + Math.sin(a) * r}
                r={2.2}
                fill={Math.abs(dev) > 0.18 ? sevColor : "#38bdf8"}
                initial={false}
                animate={{ cx: C + Math.cos(a) * r, cy: C + Math.sin(a) * r }}
                transition={{ duration: 0.5 }}
              />
            );
          })}
          {acDevs.map((dev, i) => {
            const n = acDevs.length * 2;
            const a = ((i * 2 + 1.5) / n) * Math.PI * 2 - Math.PI / 2;
            const r = devRadius(dev);
            return (
              <motion.circle
                key={`ad-${i}`}
                cx={C + Math.cos(a) * r}
                cy={C + Math.sin(a) * r}
                r={2.2}
                fill={Math.abs(dev) > 0.18 ? sevColor : "#fb923c"}
                initial={false}
                animate={{ cx: C + Math.cos(a) * r, cy: C + Math.sin(a) * r }}
                transition={{ duration: 0.5 }}
              />
            );
          })}

          {/* center readout */}
          <text
            x={C}
            y={C - 5}
            textAnchor="middle"
            fontSize={12}
            fontWeight={700}
            fill={sevColor}
            fontFamily="ui-monospace, monospace"
          >
            {(maxDev * 100).toFixed(0)}%
          </text>
          <text
            x={C}
            y={C + 9}
            textAnchor="middle"
            fontSize={7.5}
            className="fill-muted-foreground"
            letterSpacing={1.5}
          >
            MAX DEV
          </text>
        </svg>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-px w-4 border-t border-dashed border-muted-foreground" /> baseline
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-px w-4 bg-[#38bdf8]" /> vibration (ADXL345)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-px w-4 bg-[#fb923c]" /> acoustic (INMP441)
        </span>
      </div>
    </div>
  );
}
