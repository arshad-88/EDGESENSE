/**
 * AnomalySignature — large temporal heatmap of feature deviation, split by
 * sensor (vibration rows + acoustic rows independently). Color encodes
 * |deviation| vs the learned baseline; hover reveals actual values.
 */
import { useState } from "react";
import type { HeatmapRow, FeatureName } from "@/core/edgesense";
import { FEATURE_LABELS, FEATURE_VECTOR_ORDER } from "@/core/edgesense";
import { fmtCompact } from "./ui-helpers";
import { cn } from "@/lib/utils";

interface Props {
  rows: HeatmapRow[];
  /** values per row per cell key ("ADXL345:rms") and baseline means per key */
  valuesByKey: Array<Record<string, number>>;
  baselinesByKey: Record<string, number>;
}

const VIB = FEATURE_VECTOR_ORDER.map((f) => `ADXL345:${f}`);
const AC = FEATURE_VECTOR_ORDER.map((f) => `INMP441:${f}`);
const MAX_COLS = 56;

const ROW_LABEL: Record<string, string> = Object.fromEntries(
  [...VIB, ...AC].map((k) => {
    const [sensor, feature] = k.split(":") as [string, FeatureName];
    return [k, `${sensor === "ADXL345" ? "V" : "A"}-${FEATURE_LABELS[feature]}`];
  }),
);

/** Deviation → background color (oklch alpha ladder). */
function cellStyle(dev: number): string {
  const a = Math.abs(dev);
  if (a < 0.08) return "transparent";
  if (a < 0.16) return "color-mix(in oklab, var(--chart-1) 22%, transparent)";
  if (a < 0.3) return "color-mix(in oklab, var(--chart-2) 38%, transparent)";
  if (a < 0.5) return "color-mix(in oklab, var(--chart-2) 62%, transparent)";
  if (a < 0.8) return "color-mix(in oklab, var(--status-anomaly) 62%, transparent)";
  return "var(--status-anomaly)";
}

export function AnomalySignature({ rows, valuesByKey, baselinesByKey }: Props) {
  const [hover, setHover] = useState<{ row: string; col: number } | null>(null);
  const start = Math.max(0, rows.length - MAX_COLS);
  const visible = rows.slice(start);

  const renderGroup = (keys: string[], groupLabel: string) => (
    <div className="mb-2">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {groupLabel}
      </p>
      <div className="space-y-px">
        {keys.map((key) => (
          <div key={key} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate text-right text-[9.5px] text-muted-foreground">
              {ROW_LABEL[key] ?? key}
            </span>
            <div className="flex flex-1 gap-px">
              {visible.map((row, i) => {
                const dev = row.deviations[key] ?? 0;
                const isHover = hover?.row === key && hover?.col === i;
                return (
                  <div
                    key={row.timestamp}
                    onMouseEnter={() => setHover({ row: key, col: i })}
                    onMouseLeave={() => setHover(null)}
                    className={cn(
                      "h-4 flex-1 rounded-[1px] transition-colors",
                      isHover && "outline outline-1 outline-foreground/60",
                    )}
                    style={{ background: cellStyle(dev) }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const hoverDetail = (() => {
    if (!hover) return null;
    const idx = start + hover.col;
    const row = rows[idx];
    if (!row) return null;
    const dev = row.deviations[hover.row] ?? 0;
    const value = valuesByKey[idx]?.[hover.row];
    const baseline = baselinesByKey[hover.row] ?? 0;
    const [sensor] = hover.row.split(":");
    return (
      <div className="mt-1 rounded-md border border-border/60 bg-card/80 px-3 py-2 text-[11px]">
        <span className="font-semibold">{ROW_LABEL[hover.row]}</span>
        <span className="ml-2 text-muted-foreground">
          {sensor === "ADXL345" ? "vibration" : "acoustic"} · t={row.timestamp.toFixed(0)}s · state {row.state}
        </span>
        <span className="ml-3 tabular-nums">
          value <b>{fmtCompact(value ?? NaN)}</b>
        </span>
        <span className="ml-2 tabular-nums text-muted-foreground">
          baseline {fmtCompact(baseline)}
        </span>
        <span className={cn("ml-2 font-bold tabular-nums", Math.abs(dev) > 0.18 ? "text-status-anomaly" : "text-foreground")}>
          {dev >= 0 ? "+" : ""}{Math.round(dev * 100)}%
        </span>
      </div>
    );
  })();

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">Anomaly Signature</h3>
          <p className="text-[11px] text-muted-foreground">
            Feature deviation across time — both modalities, independently
          </p>
        </div>
        {/* color scale */}
        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
          <span>normal</span>
          {[0.05, 0.16, 0.3, 0.5, 0.85].map((v) => (
            <span key={v} className="size-3 rounded-[2px]" style={{ background: cellStyle(v) }} />
          ))}
          <span>severe</span>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {renderGroup(VIB, "Vibration · ADXL345")}
        {renderGroup(AC, "Acoustic · INMP441")}
        <div className="flex items-center gap-2 pl-[104px] text-[9px] text-muted-foreground">
          <span>oldest</span>
          <div className="h-px flex-1 bg-gradient-to-r from-border via-primary/50 to-status-anomaly" />
          <span>now · last {visible.length} windows</span>
        </div>
      </div>

      {hoverDetail}
      {!hover ? (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Hover any cell for feature, sensor, timestamp, value, baseline and deviation.
        </p>
      ) : null}
    </div>
  );
}
