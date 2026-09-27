import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FEATURE_LABELS, FEATURE_UNITS } from "@/core/edgesense";
import type { FingerprintBarLite } from "@/core/edgesense";
import { fmtCompact } from "./ui-helpers";
import { cn } from "@/lib/utils";

interface Props {
  vibration: FingerprintBarLite[];
  acoustic: FingerprintBarLite[];
}

/** Horizontal baseline-vs-current bars per feature, colored by deviation. */
function Bar({
  label,
  unit,
  baseline,
  current,
  deviation,
}: {
  label: string;
  unit: string;
  baseline: number;
  current: number;
  deviation: number;
}) {
  // Bar widths relative to the larger of the two values.
  const max = Math.max(Math.abs(baseline), Math.abs(current), 1e-9);
  const basePct = Math.min(100, (Math.abs(baseline) / max) * 100);
  const curPct = Math.min(100, (Math.abs(current) / max) * 100);
  const deviating = Math.abs(deviation) > 0.18;
  const rising = deviation > 0;

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          <span className="text-muted-foreground">{fmtCompact(baseline)}</span>
          <span className="mx-1 text-border">→</span>
          <span
            className={cn(
              "font-semibold",
              deviating
                ? rising
                  ? "text-status-anomaly"
                  : "text-status-suspicious"
                : "text-foreground",
            )}
          >
            {fmtCompact(current)}
          </span>
          <span className="ml-1 text-[10px] text-muted-foreground">{unit}</span>
        </span>
      </div>
      <div className="space-y-0.5">
        <div className="h-1.5 w-full overflow-hidden rounded-sm bg-muted/60">
          <div
            className="h-full rounded-sm bg-muted-foreground/50"
            style={{ width: `${basePct}%` }}
          />
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-sm bg-muted/60">
          <div
            className={cn(
              "h-full rounded-sm",
              deviating
                ? rising
                  ? "bg-status-anomaly"
                  : "bg-status-suspicious"
                : "bg-primary",
            )}
            style={{ width: `${curPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function BehaviourFingerprint({ vibration, acoustic }: Props) {
  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-sm font-semibold">
          Machine Behaviour Fingerprint
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Learned baseline (grey) vs current behaviour (colored) — deviations
          highlight automatically
        </p>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">
            Vibration
          </p>
          {vibration.map((b) => (
            <Bar
              key={b.feature}
              label={FEATURE_LABELS[b.feature]}
              unit={FEATURE_UNITS[b.feature]}
              baseline={b.baseline}
              current={b.current}
              deviation={b.deviation}
            />
          ))}
        </div>
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-chart-2">
            Acoustic
          </p>
          {acoustic.map((b) => (
            <Bar
              key={b.feature}
              label={FEATURE_LABELS[b.feature]}
              unit={FEATURE_UNITS[b.feature]}
              baseline={b.baseline}
              current={b.current}
              deviation={b.deviation}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
