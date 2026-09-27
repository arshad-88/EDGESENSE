/**
 * InvestigationFlow — the explainability story as a visual pipeline.
 * Stages: Signal → Features → Vibration → Acoustic → Fusion → Decision.
 * Each stage shows real computed evidence; nodes activate sequentially and
 * reflect the actual latest frame. No fabricated numbers.
 */
import { motion } from "framer-motion";
import { ArrowDown, CircleCheck, CircleAlert } from "lucide-react";
import type { PipelineFrame, FeatureName } from "@/core/edgesense";
import { FEATURE_LABELS, FEATURE_UNITS } from "@/core/edgesense";
import { fmtCompact, fmtTimestamp, statusForDecision, STATUS_TEXT_CLASS } from "./ui-helpers";
import { cn } from "@/lib/utils";

interface Props {
  frame: PipelineFrame | null;
}

function Stage({
  index,
  title,
  status,
  children,
}: {
  index: number;
  title: string;
  status: "ok" | "warn" | "idle";
  children: React.ReactNode;
}) {
  const color =
    status === "warn" ? "text-status-anomaly" : status === "ok" ? "text-status-healthy" : "text-muted-foreground";
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
      className="relative pl-7"
    >
      {/* connector */}
      <span className="absolute left-[9px] top-6 h-full w-px bg-border" aria-hidden />
      <span className={cn("absolute left-0 top-1 flex size-[19px] items-center justify-center rounded-full border", status === "warn" ? "border-status-anomaly bg-status-anomaly/15" : status === "ok" ? "border-status-healthy/60 bg-status-healthy/10" : "border-border bg-card")}>
        {status === "warn" ? (
          <CircleAlert className={cn("size-3", color)} />
        ) : (
          <CircleCheck className={cn("size-3", color)} />
        )}
      </span>
      <p className="text-[11px] font-semibold tracking-wide">{title}</p>
      <div className="pb-3 pt-0.5 text-[11px] leading-5 text-muted-foreground">{children}</div>
    </motion.li>
  );
}

export function InvestigationFlow({ frame }: Props) {
  if (!frame) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Waiting for the first processed window…
      </div>
    );
  }

  const inv = frame.investigation;
  const level = statusForDecision(frame.fusion.decision);
  const vibFlag = frame.vibration.anomaly.isAnomaly;
  const acFlag = frame.acoustic.anomaly.isAnomaly;

  const evidenceRows = (items: typeof inv.primaryEvidence) =>
    items.slice(0, 3).map((e, i) => (
      <div key={`${e.feature}-${i}`} className="flex items-baseline justify-between gap-3">
        <span>
          {FEATURE_LABELS[e.feature as FeatureName]}
          <span className="ml-1.5 tabular-nums text-[10px] text-muted-foreground/80">
            {fmtCompact(e.baseline)} → {fmtCompact(e.value)} {FEATURE_UNITS[e.feature as FeatureName]}
          </span>
        </span>
        <span className="font-bold tabular-nums">{e.deltaLabel}</span>
      </div>
    ));

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">Anomaly Investigation</h3>
          <p className="text-[11px] text-muted-foreground">
            How EdgeSense turned deviations into a decision · {fmtTimestamp(frame.timestamp)}
          </p>
        </div>
        <span className={cn("rounded px-2 py-1 text-[10px] font-bold tracking-widest", level === "healthy" ? "bg-status-healthy/15 text-status-healthy" : level === "suspicious" ? "bg-status-suspicious/15 text-status-suspicious" : "bg-status-anomaly/15 text-status-anomaly")}>
          {inv.headline}
        </span>
      </div>

      <ol className="min-h-0 flex-1">
        <Stage index={0} title="SIGNAL" status="ok">
          2 sensors reporting · ADXL345 (3-axis @ 512 Hz) + INMP441 (mono)
          <span className="ml-1 tabular-nums text-[10px]">
            quality {Math.round(frame.vibration.features.quality.score * 100)}% / {Math.round(frame.acoustic.features.quality.score * 100)}%
          </span>
        </Stage>

        <Stage index={1} title="FEATURE DEVIATION" status={inv.primaryEvidence.length > 0 || inv.supportingEvidence.length > 0 ? "warn" : "ok"}>
          {inv.primaryEvidence.length + inv.supportingEvidence.length > 0 ? (
            <div className="space-y-0.5">
              {evidenceRows(inv.primaryEvidence)}
              {evidenceRows(inv.supportingEvidence)}
            </div>
          ) : (
            "No feature deviated ≥18% from the learned baseline."
          )}
        </Stage>

        <Stage index={2} title="VIBRATION CHECK · ADXL345" status={vibFlag ? "warn" : "ok"}>
          {vibFlag
            ? `Isolation Forest score ${frame.vibration.anomaly.rawScore.toFixed(3)} > threshold ${frame.vibration.anomaly.threshold.toFixed(3)}`
            : "consistent with learned normal behaviour"}
        </Stage>

        <Stage index={3} title="ACOUSTIC CHECK · INMP441" status={acFlag ? "warn" : "ok"}>
          {acFlag
            ? `Isolation Forest score ${frame.acoustic.anomaly.rawScore.toFixed(3)} > threshold ${frame.acoustic.anomaly.threshold.toFixed(3)}`
            : "consistent with learned normal behaviour"}
        </Stage>

        <Stage index={4} title="SENSOR FUSION" status={frame.fusion.state === "healthy" ? "ok" : "warn"}>
          {frame.fusion.sensorAgreement} / 2 sensors flag ·{" "}
          {frame.fusion.sensorsAgree ? "agreement" : "disagreement"} · quality gate{" "}
          {frame.fusion.qualityConsidered ? "applied" : "clear"}
        </Stage>

        <li className="relative pl-7">
          <span className={cn("absolute left-0 top-1 flex size-[19px] items-center justify-center rounded-full border", level === "healthy" ? "border-status-healthy/60 bg-status-healthy/15" : "border-status-anomaly/60 bg-status-anomaly/15")}>
            <ArrowDown className={cn("size-3", STATUS_TEXT_CLASS[level])} />
          </span>
          <p className="text-[11px] font-semibold tracking-wide">FINAL DECISION</p>
          <p className={cn("mt-0.5 text-lg font-bold tracking-tight", STATUS_TEXT_CLASS[level])}>
            {inv.headline}
          </p>
          <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{inv.caveat}</p>
        </li>
      </ol>
    </div>
  );
}
