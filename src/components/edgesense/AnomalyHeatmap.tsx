import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FEATURE_LABELS } from "@/core/edgesense";
import type { HeatmapRow } from "@/core/edgesense";
import { fmtCompact } from "./ui-helpers";
import { cn } from "@/lib/utils";

interface Props {
  rows: HeatmapRow[];
  /** Baseline means per feature per sensor — taken from the latest frame. */
  baselines: Record<string, number>;
  /** Raw current values per feature for tooltips, per row. */
  valuesByRow: Array<Record<string, number>>;
}

/** Map |deviation| to a color intensity class (5 steps). */
function intensityClass(dev: number): string {
  const a = Math.abs(dev);
  if (a < 0.1) return "bg-muted/40";
  if (a < 0.2) return "bg-primary/25";
  if (a < 0.35) return "bg-primary/50";
  if (a < 0.6) return "bg-chart-2/60";
  return dev > 0 ? "bg-status-anomaly" : "bg-chart-5/70";
}

const FEATURES = [
  "rms",
  "variance",
  "peak",
  "kurtosis",
  "dominantFreq",
  "spectralEnergy",
] as const;

export function AnomalyHeatmap({ rows, baselines, valuesByRow }: Props) {
  // Show the most recent 40 windows, oldest left.
  const visible = rows.slice(-40);
  const startIdx = rows.length - visible.length;

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-sm font-semibold">Anomaly Heatmap</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Feature deviation vs learned baseline over time (hover a cell for
          details)
        </p>
      </CardHeader>
      <CardContent>
        <TooltipProvider delayDuration={80}>
          <div className="overflow-x-auto">
            <div className="min-w-[520px] space-y-0.5">
              {FEATURES.map((f) => (
                <div key={f} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-right text-[10px] text-muted-foreground">
                    {FEATURE_LABELS[f]}
                  </span>
                  <div className="flex flex-1 gap-px">
                    {visible.map((row, i) => {
                      const dev = row.deviations[f] ?? 0;
                      const raw = valuesByRow[startIdx + i]?.[f];
                      return (
                        <Tooltip key={row.timestamp}>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "h-4 flex-1 cursor-crosshair rounded-[2px]",
                                intensityClass(dev),
                              )}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <div className="space-y-0.5">
                              <div className="font-medium">{FEATURE_LABELS[f]}</div>
                              <div>
                                t = {row.timestamp.toFixed(0)}s · state {row.state}
                              </div>
                              <div>value {fmtCompact(raw ?? dev)}</div>
                              <div className="text-muted-foreground">
                                baseline {fmtCompact(baselines[f] ?? 0)} ·{" "}
                                {dev >= 0 ? "+" : ""}
                                {Math.round(dev * 100)}%
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <span className="w-28 shrink-0 text-right text-[10px] text-muted-foreground">
                  time →
                </span>
                <div className="flex-1 text-[9px] text-muted-foreground/70">
                  last {visible.length} windows
                </div>
              </div>
            </div>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
