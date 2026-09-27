/**
 * AnomalySignature — Time × Feature deviation rendered as a smooth, continuous
 * "spectral contour" field (canvas-based, spectrogram aesthetic) instead of
 * discrete boxes. Each pixel column = one time window; rows = features for
 * vibration (ADXL345) and acoustic (INMP441). Intensity encodes |deviation|
 * vs the learned baseline; a hover crosshair reads out exact values.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { HeatmapRow, FeatureName } from "@/core/edgesense";
import { FEATURE_LABELS, FEATURE_VECTOR_ORDER } from "@/core/edgesense";
import { fmtCompact } from "./ui-helpers";

interface Props {
  rows: HeatmapRow[];
  valuesByKey: Array<Record<string, number>>;
  baselinesByKey: Record<string, number>;
}

const VIB = FEATURE_VECTOR_ORDER.map((f) => `ADXL345:${f}`);
const AC = FEATURE_VECTOR_ORDER.map((f) => `INMP441:${f}`);
const MAX_COLS = 72;

/** Column-major intensity grid: grid[x * H + y] ∈ 0..1. */
function buildGrid(keys: string[], rows: HeatmapRow[], start: number): { grid: Float32Array; w: number; h: number } {
  const visible = rows.slice(start);
  const w = Math.max(1, visible.length);
  const h = keys.length;
  const grid = new Float32Array(w * h);
  for (let x = 0; x < w; x++) {
    const row = visible[x];
    for (let y = 0; y < h; y++) {
      const dev = row ? Math.abs(row.deviations[keys[y]] ?? 0) : 0;
      grid[x * h + y] = Math.min(1, dev / 0.9);
    }
  }
  return { grid, w, h };
}

/** Turbo-ish colormap: dark navy → teal → yellow → orange-red. */
function intensityToRgb(t: number): [number, number, number] {
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [8, 16, 48]],
    [0.18, [16, 52, 110]],
    [0.35, [10, 120, 150]],
    [0.52, [24, 180, 120]],
    [0.68, [210, 210, 60]],
    [0.84, [240, 140, 40]],
    [1.0, [235, 55, 35]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * k),
        Math.round(c0[1] + (c1[1] - c0[1]) * k),
        Math.round(c0[2] + (c1[2] - c0[2]) * k),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

interface FieldProps {
  keys: string[];
  rows: HeatmapRow[];
  start: number;
  label: string;
  hover: { group: string; x: number; y: number } | null;
  onHover: (h: { group: string; x: number; y: number } | null) => void;
  group: string;
}

function ContourField({ keys, rows, start, label, hover, onHover, group }: FieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { grid, w, h } = useMemo(() => buildGrid(keys, rows, start), [keys, rows, start]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssW = canvas.clientWidth || 600;
    const cssH = canvas.clientHeight || 160;
    canvas.width = cssW * 2;
    canvas.height = cssH * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(2, 2);

    // Draw smooth field with vertical gradients between feature centers,
    // then blur horizontally by blending neighbouring columns.
    const cellW = cssW / w;
    const rowH = cssH / h;

    // Offscreen low-res intensity image, then upscale smoothly.
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const octx = off.getContext("2d");
    if (!octx) return;
    const img = octx.createImageData(w, h);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const [r, g, b] = intensityToRgb(grid[x * h + y]);
        const i = (y * w + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // Draw smoothed (bilinear-upscaled) field.
    ctx.drawImage(off, 0, 0, cssW, cssH);

    // Contour-ish glow lines at intensity thresholds via repeated sampling.
    const thresholds = [0.2, 0.45, 0.7];
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 0.6;
    for (const th of thresholds) {
      ctx.beginPath();
      for (let x = 0; x < w - 1; x++) {
        for (let y = 0; y < h - 1; y++) {
          const v00 = grid[x * h + y];
          const v10 = grid[(x + 1) * h + y];
          const v01 = grid[x * h + y + 1];
          const v11 = grid[(x + 1) * h + y + 1];
          // marching-squares-lite: horizontal crossing on each edge midpoint
          const cx0 = (x + 0.5) * cellW;
          const cx1 = (x + 1.5) * cellW;
          const cy0 = (y + 0.5) * rowH;
          const cy1 = (y + 1.5) * rowH;
          if ((v00 - th) * (v10 - th) < 0) {
            const t = (th - v00) / (v10 - v00);
            ctx.moveTo(cx0 + t * cellW, cy0);
            ctx.lineTo(cx0 + t * cellW, cy0 + 0.5);
          }
          if ((v00 - th) * (v01 - th) < 0) {
            const t = (th - v00) / (v01 - v00);
            ctx.moveTo(cx0, cy0 + t * rowH);
            ctx.lineTo(cx0 + 0.5, cy0 + t * rowH);
          }
          if ((v10 - th) * (v11 - th) < 0) {
            const t = (th - v10) / (v11 - v10);
            ctx.moveTo(cx1, cy0 + t * rowH);
            ctx.lineTo(cx1 + 0.5, cy0 + t * rowH);
          }
          if ((v01 - th) * (v11 - th) < 0) {
            const t = (th - v01) / (v11 - v01);
            ctx.moveTo(cx0 + t * cellW, cy1);
            ctx.lineTo(cx0 + t * cellW, cy1 + 0.5);
          }
        }
      }
      ctx.stroke();
    }
  }, [grid, w, h]);

  return (
    <div className="relative">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <canvas
        ref={canvasRef}
        className="h-[120px] w-full rounded-md"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = Math.floor(((e.clientX - rect.left) / rect.width) * w);
          const y = Math.floor(((e.clientY - rect.top) / rect.height) * h);
          onHover({ group, x: Math.min(w - 1, Math.max(0, x)), y: Math.min(h - 1, Math.max(0, y)) });
        }}
        onMouseLeave={() => onHover(null)}
      />
      {/* row labels */}
      <div className="pointer-events-none absolute inset-y-0 right-1 flex flex-col justify-around pt-4">
        {keys.map((k) => {
          const feat = k.split(":")[1] as FeatureName;
          return (
            <span key={k} className="rounded bg-background/60 px-1 text-[8px] tracking-wide text-muted-foreground">
              {FEATURE_LABELS[feat]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function AnomalySignature({ rows, valuesByKey, baselinesByKey }: Props) {
  const [hover, setHover] = useState<{ group: string; x: number; y: number } | null>(null);
  const start = Math.max(0, rows.length - MAX_COLS);

  const hoverDetail = (() => {
    if (!hover) return null;
    const keys = hover.group === "vib" ? VIB : AC;
    const key = keys[hover.y];
    const idx = start + hover.x;
    const row = rows[idx];
    if (!row || !key) return null;
    const dev = row.deviations[key] ?? 0;
    const value = valuesByKey[idx]?.[key];
    const baseline = baselinesByKey[key] ?? 0;
    const [sensor] = key.split(":");
    return (
      <div className="mt-1 rounded-md border border-border/60 bg-card/80 px-3 py-2 text-[11px]">
        <span className="font-semibold">{FEATURE_LABELS[key.split(":")[1] as FeatureName]}</span>
        <span className="ml-2 text-muted-foreground">
          {sensor === "ADXL345" ? "vibration" : "acoustic"} · t={row.timestamp.toFixed(0)}s · state {row.state}
        </span>
        <span className="ml-3 tabular-nums">
          value <b>{fmtCompact(value ?? NaN)}</b>
        </span>
        <span className="ml-2 tabular-nums text-muted-foreground">baseline {fmtCompact(baseline)}</span>
        <span
          className={`ml-2 font-bold tabular-nums ${Math.abs(dev) > 0.18 ? "text-status-anomaly" : "text-foreground"}`}
        >
          {dev >= 0 ? "+" : ""}
          {Math.round(dev * 100)}%
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
            Time × feature deviation field — smooth contour spectrogram per modality
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
          <span>normal</span>
          <span
            className="h-3 w-24 rounded-sm"
            style={{
              background:
                "linear-gradient(to right, rgb(8,16,48), rgb(10,120,150), rgb(210,210,60), rgb(235,55,35))",
            }}
          />
          <span>severe</span>
        </div>
      </div>

      <ContourField
        keys={VIB}
        rows={rows}
        start={start}
        label="Vibration · ADXL345"
        hover={hover}
        onHover={setHover}
        group="vib"
      />
      <div className="mt-2">
        <ContourField
          keys={AC}
          rows={rows}
          start={start}
          label="Acoustic · INMP441"
          hover={hover}
          onHover={setHover}
          group="ac"
        />
      </div>

      <div className="mt-1 flex items-center gap-2 text-[9px] text-muted-foreground">
        <span>oldest</span>
        <div className="h-px flex-1 bg-gradient-to-r from-border via-primary/50 to-status-anomaly" />
        <span>now · last {Math.min(rows.length, MAX_COLS)} windows</span>
      </div>

      {hoverDetail}
      {!hover ? (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Hover the field to read out feature, value, baseline and deviation per window.
        </p>
      ) : null}
    </div>
  );
}
