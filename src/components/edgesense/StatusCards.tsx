import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Gauge, GitCompareArrows } from "lucide-react";
import type { PipelineFrame } from "@/core/edgesense";
import {
  STATUS_BG_CLASS,
  STATUS_LABEL,
  STATUS_TEXT_CLASS,
  MODE_LABELS,
  statusForDecision,
  fmtDuration,
} from "./ui-helpers";
import { cn } from "@/lib/utils";

/** Machine status + headline anomaly indicator. */
export function MachineStatusCard({ frame }: { frame: PipelineFrame | null }) {
  const level = statusForDecision(frame?.fusion.decision ?? "healthy");
  const indicator = frame
    ? Math.max(
        frame.vibration.anomaly.anomalyIndicator,
        frame.acoustic.anomaly.anomalyIndicator,
      )
    : 0;

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Gauge className="size-4 text-primary" />
          Machine Status
        </CardTitle>
        <Badge variant="outline" className="text-[10px]">
          Demo Motor · SIMULATED DATA
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <motion.span
            key={level}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "text-3xl font-bold tracking-tight",
              STATUS_TEXT_CLASS[level],
            )}
          >
            {STATUS_LABEL[level]}
          </motion.span>
          <div className="text-right">
            <span className="block text-2xl font-bold tabular-nums">
              {indicator.toFixed(2)}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              anomaly indicator (not a probability)
            </span>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {frame ? MODE_LABELS[frame.machineMode] ?? frame.machineMode : "—"}
          {frame && frame.investigation.sustainedSeconds > 0
            ? ` · deviation held for ${fmtDuration(frame.investigation.sustainedSeconds)}`
            : ""}
        </p>
      </CardContent>
    </Card>
  );
}

/** Sensor-wise fusion verdict. */
export function FusionStatusCard({ frame }: { frame: PipelineFrame | null }) {
  const vib = frame?.vibration.anomaly;
  const ac = frame?.acoustic.anomaly;
  const fusion = frame?.fusion;

  const row = (name: string, anomalous?: boolean, quality?: number) => (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-muted-foreground">{name}</span>
      <span className="flex items-center gap-2">
        {typeof quality === "number" ? (
          <span className="text-[10px] text-muted-foreground">
            q {Math.round(quality * 100)}%
          </span>
        ) : null}
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider",
            anomalous ? "bg-status-anomaly text-background" : "bg-status-healthy text-background",
          )}
        >
          {anomalous ? "ANOMALOUS" : "NORMAL"}
        </span>
      </span>
    </div>
  );

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <GitCompareArrows className="size-4 text-primary" />
          Fusion Status
        </CardTitle>
        {fusion ? (
          <Badge variant="outline" className="text-[10px]">
            {fusion.sensorsAgree ? "sensors agree" : "sensor disagreement"}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {row("Vibration", vib?.isAnomaly, vib?.quality.score)}
        {row("Acoustic", ac?.isAnomaly, ac?.quality.score)}
        <div className="border-t pt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Final verdict</span>
            <span
              className={cn(
                "font-bold tracking-wider",
                STATUS_TEXT_CLASS[statusForDecision(fusion?.decision ?? "healthy")],
              )}
            >
              {(fusion?.decision ?? "healthy").toUpperCase().replace("-", " ")}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {fusion?.summary ?? "Waiting for data…"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
