/**
 * The EdgeSense mark, as pure geometry.
 *
 * Kept free of Three.js and React on purpose: this is the definition of the
 * brand identity, so it can be unit-tested and rendered as ASCII for review
 * without a GPU.
 *
 * Concept — machine + vibration + acoustics + edge intelligence:
 *
 *   ── the letter E, drawn as four *vibration-modulated* particle strokes, so
 *      the letter itself is made of oscillation rather than of straight lines;
 *   ── inside a stator ring with twelve dial ticks and three radial
 *      interlocks: the E is locked into a motor core;
 *   ── fed from the left by a blue vibration ribbon (the ADXL345 identity);
 *   ── radiating orange acoustic arcs to the right (the INMP441 identity);
 *   ── wrapped in a tilted orbit path (data leaving the edge) and a sparse
 *      halo of background particles.
 *
 * Colours are structural: a particle's tint decides which part it belongs to,
 * so the blue filaments *are* the vibration ribbon and the orange filaments
 * *are* the acoustic arcs in both the emblem and the machine assembly.
 */

export const OBJ_W = 3.4;

/** Identity split: blue vibration ribbon, orange acoustic arcs. */
export const BLUE_SHARE = 0.2;
export const ORANGE_SHARE = 0.16;

export const RING_R = 1.35;

const TAU = Math.PI * 2;

/** Cheap deterministic 0..1 hash, so the emblem is identical every load. */
export function rnd(i: number, k: number): number {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export interface Stroke {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** half-thickness perpendicular to the stroke */
  w: number;
  /** vibration modulation amplitude */
  amp: number;
  /** vibration modulation cycles along the stroke */
  freq: number;
  vertical?: boolean;
}

/** The E: three arms and a spine, each oscillating along its length. Sized to
 *  fill the stator ring so the letter — not the frame — carries the mark. */
export const E_STROKES: Stroke[] = [
  { x0: -0.62, y0: -1.05, x1: -0.62, y1: 1.05, w: 0.052, amp: 0.03, freq: 3, vertical: true },
  { x0: -0.62, y0: 0.72, x1: 0.62, y1: 0.72, w: 0.048, amp: 0.05, freq: 2.4 },
  { x0: -0.62, y0: 0.0, x1: 0.36, y1: 0.0, w: 0.048, amp: 0.055, freq: 2.8 },
  { x0: -0.62, y0: -0.72, x1: 0.62, y1: -0.72, w: 0.048, amp: 0.045, freq: 2.4 },
];

/** The E's arm tips locking into the stator ring — the interlock. */
export const E_LINKS: [number, number, number, number][] = [
  [0.62, 0.72, 0.88, 1.02],
  [0.36, 0.0, 1.35, 0.0],
  [0.62, -0.72, 0.88, -1.02],
];

export interface EmblemData {
  home: Float32Array;
  scatter: Float32Array;
  scatterAmp: Float32Array;
  seed: Float32Array;
  size: Float32Array;
  tint: Float32Array;
  layer: Float32Array;
}

/** One point of a stroke plus its thickness scatter. */
export function strokePoint(
  s: Stroke,
  u: number,
  h: number,
  h2: number,
): [number, number, number] {
  const x = s.x0 + (s.x1 - s.x0) * u;
  const y = s.y0 + (s.y1 - s.y0) * u;
  const wave = Math.sin(u * s.freq * TAU) * s.amp * Math.sin(Math.PI * u);
  const jitter = (h2 - 0.5) * s.w;
  const z = Math.sin(u * 3.1) * 0.05 + (h - 0.5) * 0.05;
  if (s.vertical) return [x + wave + jitter, y, z];
  return [x, y + wave + jitter, z];
}

/**
 * Build the emblem targets in object space: centred on the origin and
 * normalised so the composition is `OBJ_W` wide (or 3.35 tall, if taller).
 */
export function buildEmblem(count: number): EmblemData {
  const home = new Float32Array(count * 3);
  const seed = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const tint = new Float32Array(count);
  const layer = new Float32Array(count);

  const blueEnd = Math.round(count * BLUE_SHARE);
  const orangeEnd = blueEnd + Math.round(count * ORANGE_SHARE);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const h = rnd(i, 1);
    const h2 = rnd(i, 2);
    const h3 = rnd(i, 3);
    const h4 = rnd(i, 4);

    seed[i3] = h;
    seed[i3 + 1] = h2;
    seed[i3 + 2] = h3;
    tint[i] = i < blueEnd ? 1 : i < orangeEnd ? 2 : 0;
    size[i] = 0.011 + Math.pow(h4, 2.1) * 0.026;
    layer[i] = 1;

    let x = 0;
    let y = 0;
    let z = 0;

    if (tint[i] === 1) {
      /* ---- vibration ribbon: a waveform sweeping in from the left ---- */
      const u = h4;
      x = -2.62 + u * 1.2;
      const env = 0.08 + Math.pow(u, 1.3) * 0.46;
      y = Math.sin(u * 21.0) * env * (0.55 + 0.45 * h) + (h2 - 0.5) * 0.06;
      z = Math.sin(u * 15.0) * 0.18 + (h3 - 0.5) * 0.12;
      layer[i] = h3 > 0.86 ? 0 : 1;
    } else if (tint[i] === 2) {
      /* ---- acoustic arcs radiating off the machine, to the right ---- */
      const arc = Math.floor(h4 * 3);
      const angle = (h - 0.5) * 1.5;
      const radius = RING_R + 0.42 + arc * 0.32 + (h2 - 0.5) * 0.05;
      x = Math.cos(angle) * radius;
      y = Math.sin(angle) * radius;
      z = (h3 - 0.5) * 0.55;
      layer[i] = h2 > 0.9 ? 2 : 1;
    } else if (h4 < 0.3) {
      /* ---- stator ring ---- */
      const angle = h * TAU;
      const radius = RING_R + (h2 - 0.5) * 0.055;
      x = Math.cos(angle) * radius;
      y = Math.sin(angle) * radius;
      z = (h3 - 0.5) * 0.09;
    } else if (h4 < 0.4) {
      /* ---- dial ticks: the industrial gauge read ---- */
      const tick = Math.floor(h * 12);
      const angle = (tick / 12) * TAU;
      const radius = RING_R + 0.06 + h2 * 0.26;
      x = Math.cos(angle) * radius;
      y = Math.sin(angle) * radius;
      z = (h3 - 0.5) * 0.06;
    } else if (h4 < 0.74) {
      /* ---- the E ---- */
      const pick = h2;
      const stroke =
        pick < 0.3
          ? E_STROKES[0]
          : pick < 0.54
            ? E_STROKES[1]
            : pick < 0.78
              ? E_STROKES[2]
              : E_STROKES[3];
      [x, y, z] = strokePoint(stroke, h, h3, h4);
      if (h3 > 0.93) layer[i] = 2;
    } else if (h4 < 0.82) {
      /* ---- radial interlocks ---- */
      const link = E_LINKS[Math.floor(h * E_LINKS.length) % E_LINKS.length];
      const u = h2;
      x = link[0] + (link[2] - link[0]) * u;
      y = link[1] + (link[3] - link[1]) * u;
      z = (h3 - 0.5) * 0.08;
    } else if (h4 < 0.9) {
      /* ---- orbit: the edge/data-flow path around the core ---- */
      const angle = h * TAU;
      const rx = 2.45;
      const ry = 1.05;
      const tilt = -0.34;
      const ox = Math.cos(angle) * rx;
      const oy = Math.sin(angle) * ry;
      x = ox * Math.cos(tilt) - oy * Math.sin(tilt);
      y = ox * Math.sin(tilt) + oy * Math.cos(tilt);
      z = -0.55 + (h2 - 0.5) * 0.3;
      layer[i] = h3 > 0.7 ? 2 : 0;
    } else {
      /* ---- halo: the sparse field the mark is built out of ---- */
      const angle = h * TAU;
      const radius = 1.6 + h2 * 1.5;
      x = Math.cos(angle) * radius * 1.05;
      y = Math.sin(angle) * radius * 0.66;
      z = (h3 - 0.5) * 2.4;
      layer[i] = 0;
    }

    home[i3] = x;
    home[i3 + 1] = y;
    home[i3 + 2] = z;
  }

  /* ---- normalise the composition into object space ---- */
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    if (layer[i] === 0) continue; // the halo may live outside the frame
    const i3 = i * 3;
    if (home[i3] < minX) minX = home[i3];
    if (home[i3] > maxX) maxX = home[i3];
    if (home[i3 + 1] < minY) minY = home[i3 + 1];
    if (home[i3 + 1] > maxY) maxY = home[i3 + 1];
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const width = Math.max(maxX - minX, 1e-3);
  const height = Math.max(maxY - minY, 1e-3);
  const k = Math.min(OBJ_W / width, 3.35 / height);

  const scatter = new Float32Array(count * 3);
  const scatterAmp = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    home[i3] = (home[i3] - cx) * k;
    home[i3 + 1] = (home[i3 + 1] - cy) * k;
    home[i3 + 2] = home[i3 + 2] * k;

    // Dispersion direction: outward from the mark, with real depth so some
    // particles leave the plane entirely.
    const h = rnd(i, 5);
    const h2 = rnd(i, 6);
    const dx = home[i3] + (h - 0.5) * 1.1;
    const dy = home[i3 + 1] * 0.85 + (h2 - 0.5) * 1.1;
    const dz = (rnd(i, 7) - 0.5) * 1.6;
    const len = Math.hypot(dx, dy, dz) || 1;
    scatter[i3] = dx / len;
    scatter[i3 + 1] = dy / len;
    scatter[i3 + 2] = dz / len;
    // Some particles barely move, some travel far, some mostly in depth.
    scatterAmp[i] = 0.45 + Math.pow(rnd(i, 8), 1.6) * 2.6;
  }

  return { home, scatter, scatterAmp, seed, size, tint, layer };
}
