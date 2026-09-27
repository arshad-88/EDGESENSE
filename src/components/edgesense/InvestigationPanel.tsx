import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, CircleHelp, Info } from "lucide-react";
import type { InvestigationResult } from "@/core/edgesense";
import { FEATURE_UNITS } from "@/core/edgesense";
import {
  STATUS_BG_CLASS,
  STATUS_TEXT_CLASS,
  fmtCompact,
  fmtTimestamp,
  statusForDecision,
} from "./ui-helpers";
import { cn } from "@/lib/utils";

interface Props {
  investigation: InvestigationResult | null;
}

function EvidenceRow({
  label,
  deltaLabel,
  value,
  baseline,
  unit,
}: {
  label: string;
  deltaLabel: string;
  value: number;
  baseline: number;
  unit: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <CheckCircle2 className="size-3 text-status-healthy" />
        {label}
      </span>
      <span className="flex items-center gap-2 tabular-nums">
        <span className="text-[10px] text-muted-foreground">
          {fmtCompact(baseline)} → {fmtCompact(value)} {unit}
        </span>
        <span className="font-semibold text-foreground">{deltaLabel}</span>
      </span>
    </div>
  );
}

export function InvestigationPanel({ investigation }: Props) {
  if (!investigation) {
    return (
      <Card className="border-border/60 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Anomaly Investigation
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
          <CircleHelp className="size-4" />
          Waiting for the first processed window…
        </CardContent>
      </Card>
    );
  }

  const level = statusForDecision(investigation.decision);

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-sm font-semibold">
            Anomaly Investigation
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Why the system raised or cleared its status — computed from actual
            features
          </p>
        </div>
        <span
          className={cn(
            "rounded px-2 py-1 text-[10px] font-bold tracking-widest",
            STATUS_BG_CLASS[level],
            "text-background",
          )}
        >
          {investigation.headline}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs leading-5 text-muted-foreground">
          {investigation.narrative}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Primary evidence
            </p>
            {investigation.primaryEvidence.length > 0 ? (
              investigation.primaryEvidence.map((e, i) => (
                <EvidenceRow
                  key={`${e.sensor}-${e.feature}-${i}`}
                  label={`${e.label}`}
                  deltaLabel={e.deltaLabel}
                  value={e.value}
                  baseline={e.baseline}
                  unit={FEATURE_UNITS[e.feature]}
                />
              ))
            ) : (
              <p className="py-1 text-xs text-muted-foreground">
                No feature deviated beyond the evidence threshold.
              </p>
            )}
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Supporting evidence
            </p>
            {investigation.supportingEvidence.length > 0 ? (
              investigation.supportingEvidence.map((e, i) => (
                <EvidenceRow
                  key={`${e.sensor}-${e.feature}-${i}`}
                  label={`${e.label} (acoustic)`}
                  deltaLabel={e.deltaLabel}
                  value={e.value}
                  baseline={e.baseline}
                  unit={FEATURE_UNITS[e.feature]}
                />
              ))
            ) : (
              <p className="py-1 text-xs text-muted-foreground">
                No corroborating acoustic deviation.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Badge variant="outline" className="text-[10px]">
            {investigation.sensorAgreement}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {fmtTimestamp(investigation.timestamp)}
          </Badge>
          {investigation.qualityNotes.map((q, i) => (
            <Badge
              key={i}
              variant="outline"
              className="text-[10px] text-status-suspicious"
            >
              {q}
            </Badge>
          ))}
        </div>

        <p className="flex items-start gap-1.5 text-[10px] leading-4 text-muted-foreground">
          <Info className="mt-0.5 size-3 shrink-0" />
          {investigation.caveat}
        </p>
      </CardContent>
    </Card>
  );
}
