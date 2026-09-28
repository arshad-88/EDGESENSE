/**
 * Animated signal backdrop for the landing hero.
 *
 * Draws the two modalities EdgeSense actually fuses — vibration (cyan) and
 * acoustic (amber) — as scrolling traces over the engineering grid. It is
 * decoration, so it is aria-hidden, pauses under `prefers-reduced-motion`,
 * and tracks the canvas size with a ResizeObserver.
 */
import { useEffect, useRef } from "react";

export function SignalBackdrop({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let raf = 0;
    let w = 1;
    let h = 1;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = cv.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      cv.width = Math.floor(w * dpr);
      cv.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(cv);

    const trace = (
      t: number,
      amp: number,
      freq: number,
      speed: number,
      phase: number,
      stroke: string,
      baseY: number,
    ) => {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const u = x / Math.max(w, 1);
        const y =
          baseY +
          Math.sin((u * freq + t * speed + phase) * Math.PI * 2) * amp * h +
            Math.sin((u * freq * 2.7 + t * speed * 1.6) * Math.PI * 2) *
              amp *
              h *
              0.2;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = "rgba(150, 205, 225, 0.055)";
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 44) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 44) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.stroke();
      }

      trace(t, 0.06, 1.3, 0.1, 0, "rgba(56, 189, 248, 0.5)", h * 0.5);
      trace(t, 0.045, 2.4, 0.075, 0.55, "rgba(251, 146, 60, 0.42)", h * 0.68);
    };

    if (reduced) {
      draw(0);
    } else {
      const start = performance.now();
      const loop = (now: number) => {
        draw((now - start) / 1000);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
