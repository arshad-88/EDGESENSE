/**
 * MachineHero — the visual center of EdgeSense.
 *
 * Engineering-style machine visualization: motor silhouette with rotating
 * shaft, vibration rings driven by real amplitude, acoustic wave propagation,
 * sensor markers that highlight when their sensor flags, and a status halo.
 * All animation values come from the real pipeline — no decorative motion.
 */
import { motion } from "framer-motion";
import type { PipelineFrame } from "@/core/edgesense";
import {
  STATUS_LABEL,
  STATUS_TEXT_CLASS,
  statusForDecision,
} from "./ui-helpers";
import { cn } from "@/lib/utils";

interface Props {
  frame: PipelineFrame | null;
  /** Live vibration RMS (g) from the latest frame — drives ring intensity. */
  vibrationRms: number;
  baselineRms: number;
  anomalyIndicator: number;
}

export function MachineHero({ frame, vibrationRms, baselineRms, anomalyIndicator }: Props) {
  const level = statusForDecision(frame?.fusion.decision ?? "healthy");
  const vibFlag = frame?.vibration.anomaly.isAnomaly ?? false;
  const acFlag = frame?.acoustic.anomaly.isAnomaly ?? false;

  // Real amplitudes → visual intensity. Ring spread scales with actual RMS
  // relative to the learned baseline; halo pulses with the anomaly indicator.
  const relAmp = baselineRms > 1e-9 ? Math.min(2.5, vibrationRms / baselineRms) : 1;
  const ringCount = 3;
  const spinDur = frame ? Math.max(0.5, 60 / Math.max(8, frame.vibration.features.values.dominantFreq)) : 1.2;

  const haloColor =
    level === "anomaly"
      ? "var(--status-anomaly)"
      : level === "suspicious"
        ? "var(--status-suspicious)"
        : "var(--status-healthy)";

  return (
    <div className="relative flex flex-col items-center justify-center">
      <svg viewBox="0 0 320 260" className="w-full max-w-md" role="img" aria-label="Live machine visualization">
        {/* Status halo */}
        <motion.circle
          cx={160}
          cy={130}
          r={118}
          fill="none"
          stroke={haloColor}
          strokeWidth={1.2}
          initial={{ opacity: 0.15 }}
          animate={{
            opacity: [0.12, 0.1 + anomalyIndicator * 0.5, 0.12],
            scale: [1, 1 + anomalyIndicator * 0.02, 1],
          }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "160px 130px" }}
        />

        {/* Acoustic waves (right side) — radius breathes with acoustic activity */}
        {[0, 1, 2].map((i) => (
          <motion.circle
            key={`ac-${i}`}
            cx={262}
            cy={130}
            r={16 + i * 9}
            fill="none"
            stroke="var(--chart-2)"
            strokeWidth={1}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.5 - i * 0.13, 0.05, 0.5 - i * 0.13], r: [14 + i * 9, 20 + i * 10, 14 + i * 9] }}
            transition={{ duration: 1.4 + i * 0.25, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}

        {/* Vibration rings (around motor) — intensity scales with real RMS */}
        {Array.from({ length: ringCount }).map((_, i) => (
          <motion.circle
            key={`vib-${i}`}
            cx={110}
            cy={130}
            r={34 + i * 11 * relAmp}
            fill="none"
            stroke={vibFlag ? "var(--status-anomaly)" : "var(--chart-1)"}
            strokeWidth={1}
            strokeDasharray="3 5"
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0.1, 0.12 + relAmp * 0.28 - i * 0.05, 0.1],
              r: [30 + i * 10 * relAmp, 36 + i * 12 * relAmp, 30 + i * 10 * relAmp],
            }}
            transition={{ duration: 0.9 + i * 0.2, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}

        {/* Motor body — industrial silhouette */}
        <g>
          {/* mounting base */}
          <rect x={70} y={168} width={80} height={8} rx={2} className="fill-muted-foreground/25" />
          {/* housing */}
          <rect x={78} y={96} width={64} height={72} rx={10} className="fill-card stroke-border" strokeWidth={1.5} />
          {/* cooling fins */}
          {[0, 1, 2, 3].map((i) => (
            <line key={i} x1={84 + i * 14} y1={100} x2={84 + i * 14} y2={112} className="stroke-muted-foreground/30" strokeWidth={2} />
          ))}
          {/* end bell */}
          <rect x={142} y={110} width={14} height={40} rx={4} className="fill-card stroke-border" strokeWidth={1.5} />
          {/* shaft */}
          <rect x={156} y={126} width={92} height={8} rx={3} className="fill-muted-foreground/40" />

          {/* rotating shaft mark — spin speed from real dominant frequency */}
          <motion.g
            style={{ transformOrigin: "160px 130px" }}
            animate={{ rotate: 360 }}
            transition={{ duration: spinDur, repeat: Infinity, ease: "linear" }}
          >
            <circle cx={160} cy={130} r={16} fill="none" className="stroke-primary" strokeWidth={2} strokeDasharray="6 10" />
            <line x1={160} y1={114} x2={160} y2={122} className="stroke-primary" strokeWidth={2} />
          </motion.g>

          {/* imbalance wobble — offset grows with real RMS */}
          <motion.circle
            cx={110}
            cy={130}
            r={22}
            fill="none"
            className="stroke-primary/50"
            strokeWidth={1}
            animate={{ x: [0, relAmp * 2.4, 0, -relAmp * 2.4, 0], y: [0, relAmp * 1.6, 0, -relAmp * 1.6, 0] }}
            transition={{ duration: Math.max(0.35, spinDur), repeat: Infinity, ease: "easeInOut" }}
          />
        </g>

        {/* Sensor markers — highlight when their sensor flags */}
        <g>
          <circle cx={70} cy={88} r={4.5} fill={vibFlag ? "var(--status-anomaly)" : "var(--chart-1)"} />
          <text x={44} y={78} fontSize={8.5} fill={vibFlag ? "var(--status-anomaly)" : "var(--muted-foreground)"} fontFamily="ui-monospace, monospace">
            ADXL345
          </text>
          {vibFlag ? (
            <motion.circle cx={70} cy={88} r={4.5} fill="none" stroke="var(--status-anomaly)" strokeWidth={1} animate={{ r: [4, 10], opacity: [0.8, 0] }} transition={{ duration: 1, repeat: Infinity }} />
          ) : null}

          <circle cx={262} cy={92} r={4.5} fill={acFlag ? "var(--status-anomaly)" : "var(--chart-2)"} />
          <text x={244} y={82} fontSize={8.5} fill={acFlag ? "var(--status-anomaly)" : "var(--muted-foreground)"} fontFamily="ui-monospace, monospace">
            INMP441
          </text>
          {acFlag ? (
            <motion.circle cx={262} cy={92} r={4.5} fill="none" stroke="var(--status-anomaly)" strokeWidth={1} animate={{ r: [4, 10], opacity: [0.8, 0] }} transition={{ duration: 1, repeat: Infinity }} />
          ) : null}
        </g>
      </svg>

      {/* Status readout under the machine */}
      <div className="mt-1 flex flex-col items-center gap-1">
        <motion.div
          key={level}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn("text-2xl font-bold tracking-tight", STATUS_TEXT_CLASS[level])}
        >
          {STATUS_LABEL[level]}
        </motion.div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>
            indicator{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {anomalyIndicator.toFixed(2)}
            </span>{" "}
            (not a probability)
          </span>
          <span>·</span>
          <span>
            {frame ? (frame.fusion.sensorsAgree ? "sensors agree" : "sensors disagree") : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
