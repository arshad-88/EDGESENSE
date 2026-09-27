/**
 * AnomalySignature — Time × Feature deviation rendered as a crisp "spectral
 * heatmap": one column per window (scrolling in real time as new windows
 * arrive), features as rows, turbo colormap with contour lines. Redraws
 * synchronously on every snapshot update so it is always live. No heavy
 * smoothing — columns are rendered sharp; only sub-pixel interpolation
 * between adjacent feature rows gives the contour feel.
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
const MAX_COLS = 80;

/** Turbo-ish colormap: dark navy → teal → yellow → orange-red. */
function intensityToRgb(t: number): [number, number, number] {
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [10, 14, 40]],
    [0.15, [14, 46, 104]],
    [0.32, [8, 115, 148]],
    [0.5, [20, 175, 125]],
    [0.66, [215, 215, 60]],
    [0.84, [242, 140, 36]],
    [1.0, [238, 50, 30]],
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
  group: string;
  hover: { group: string; x: number; y: number } | null;
  onHover: (h: { group: string; x: number; y: number } | null) => void;
}

function SpectralField({ keys, rows, start, label, group, hover, onHover }: FieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visible = useMemo(() => rows.slice(start), [rows, start]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // The field is sized from clientWidth/clientHeight, so it must be redrawn
    // when the element resizes — otherwise the canvas keeps its old backing
    // size and the cells stretch or squash on window resize / layout change.
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    draw();
    return () => ro.disconnect();
  }, [visible, keys, hover, group]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = Math.max(1, visible.length);
    const h = keys.length;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 600;
    const cssH = canvas.clientHeight || 132;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // Offscreen grid at 1 px per window × row, then draw scaled with NEAREST
    // horizontally (crisp columns) and smooth vertically (contour feel).
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const octx = off.getContext("2d");
    if (!octx) return;
    const img = octx.createImageData(w, h);
    for (let x = 0; x < w; x++) {
      const row = visible[x];
      for (let y = 0; y < h; y++) {
        const dev = row ? Math.abs(row.deviations[keys[y]] ?? 0) : 0;
        const [r, g, b] = intensityToRgb(Math.min(1, dev / 0.9));
        const i = (y * w + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);

    // CRISP draw: nearest-neighbour upscale only, column by column. A
    // smoothed stretched overlay was previously composited on top at 45%
    // alpha, which is exactly what made this look like a blurry gradient
    // smear instead of a measurement. Every cell now stays a hard-edged
    // rectangle.
    const colW = cssW / w;
    const rowH = cssH / h;
    ctx.imageSmoothingEnabled = false;
    for (let x = 0; x < w; x++) {
      ctx.drawImage(off, x, 0, 1, h, x * colW, 0, Math.ceil(colW) + 0.5, cssH);
    }

    // Hairline separators between feature rows — a real instrument grid,
    // drawn crisply rather than blurring the data underneath.
    ctx.strokeStyle = "rgba(2,6,23,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 1; y < h; y++) {
      const yPos = Math.round(y * rowH) + 0.5;
      ctx.moveTo(0, yPos);
      ctx.lineTo(cssW, yPos);
    }
    ctx.stroke();

    // Threshold markers: a bright tick on the row where the deviation first
    // crosses each level, so hot spots read as discrete events.
    for (const th of [0.25, 0.55, 0.8]) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
          const v = visible[x] ? Math.abs(visible[x].deviations[keys[y]] ?? 0) / 0.9 : 0;
          if (v >= th) {
            ctx.fillRect(x * colW, y * rowH, Math.max(1, colW - 0.5), 1.5);
          }
        }
      }
    }

    // Hover crosshair.
    if (hover && hover.group === group) {
      const hx = (hover.x + 0.5) * colW;
      const hy = (hover.y + 0.5) * rowH;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1;
      ctx.strokeRect(hx - colW / 2, hover.y * rowH, Math.max(2, colW), rowH);
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(Math.round(hx) + 0.5, 0);
      ctx.lineTo(Math.round(hx) + 0.5, cssH);
      ctx.moveTo(0, Math.round(hy) + 0.5);
      ctx.lineTo(cssW, Math.round(hy) + 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  };

  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <div className="flex gap-1.5">
        {/* Row labels in their own gutter, so they never sit on top of the
            data (previously they were overlaid on the right edge). */}
        <div className="flex w-[74px] shrink-0 flex-col justify-between py-px text-right">
          {keys.map((k) => (
            <span
              key={k}
              className="text-[8px] leading-none text-muted-foreground"
            >
              {FEATURE_LABELS[k.split(":")[1] as FeatureName]}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <canvas
            ref={canvasRef}
            className="h-[132px] w-full rounded-md ring-1 ring-border/70"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const w = Math.max(1, visible.length);
              const x = Math.floor(((e.clientX - rect.left) / rect.width) * w);
              const y = Math.floor(((e.clientY - rect.top) / rect.height) * keys.length);
              onHover({
                group,
                x: Math.min(w - 1, Math.max(0, x)),
                y: Math.min(keys.length - 1, Math.max(0, y)),
              });
            }}
            onMouseLeave={() => onHover(null)}
          />
        </div>
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
        <span className="font-semibold">
          {FEATURE_LABELS[key.split(":")[1] as FeatureName]}
        </span>
        <span className="ml-2 text-muted-foreground">
          {sensor === "ADXL345" ? "vibration" : "acoustic"} · t={row.timestamp.toFixed(0)}s · state{" "}
          {row.state}
        </span>
        <span className="ml-3 tabular-nums">
          value <b>{fmtCompact(value ?? NaN)}</b>
        </span>
        <span className="ml-2 tabular-nums text-muted-foreground">
          baseline {fmtCompact(baseline)}
        </span>
        <span
          className={`ml-2 font-bold tabular-nums ${
            Math.abs(dev) > 0.18 ? "text-status-anomaly" : "text-foreground"
          }`}
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
            Time × feature deviation — live spectral field, one column per window
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
          <span>normal</span>
          <span
            className="h-3 w-24 rounded-sm"
            style={{
              background:
                "linear-gradient(to right, rgb(10,14,40), rgb(8,115,148), rgb(215,215,60), rgb(238,50,30))",
            }}
          />
          <span>severe</span>
        </div>
      </div>

      <SpectralField
        keys={VIB}
        rows={rows}
        start={start}
        label="Vibration · ADXL345"
        group="vib"
        hover={hover}
        onHover={setHover}
      />
      <div className="mt-2">
        <SpectralField
          keys={AC}
          rows={rows}
          start={start}
          label="Acoustic · INMP441"
          group="ac"
          hover={hover}
          onHover={setHover}
        />
      </div>

      <div className="mt-1 flex items-center gap-2 text-[9px] text-muted-foreground">
        <span>oldest</span>
        <div className="h-px flex-1 bg-gradient-to-r from-border via-primary/50 to-status-anomaly" />
        <span>now · last {Math.min(rows.length, MAX_COLS)} windows · updates every window</span>
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
