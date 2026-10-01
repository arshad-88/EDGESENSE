/**
 * The deep-space field.
 *
 * The machine is the hero; the universe is the atmosphere. This module builds
 * that atmosphere as three genuinely different populations rather than one
 * cloud of dots, because that is what produces depth:
 *
 *   STAR   distant, tiny, dim, cold                — layer 4
 *   DRIFT  mid-depth particles on a slow orbital   — layer 5
 *          flow around the machine
 *   FORE   a handful of large, close, softly       — layer 7
 *          out-of-focus particles passing the lens
 *
 * The very faint blue clouds of layer 3 are NOT here: a soft cloud painted from
 * thousands of enormous sprites is pure fill-rate, so the clouds are procedural
 * in the sky shader instead (see `Backdrop` in `ParticleUniverse.tsx`). What
 * remains here is cheap and reads as depth.
 *
 * Each particle carries its own parallax factor derived from how close it is,
 * so one pointer offset moves every layer by a different amount and the depth
 * reads as real rather than as a background image that slides.
 *
 * Like `emblem.ts` and `machine-cloud.ts` this is pure geometry — no React, no
 * Three.js, no GPU — so the layering is unit-testable.
 */
import { rnd } from "./emblem";

const TAU = Math.PI * 2;

/** Population split. Heavily star-weighted: the void should read as void. */
export const STAR_SHARE = 0.78;
export const DRIFT_SHARE = 0.18;
/** foreground takes the remainder (~4%) */

/** How far out the star shell reaches. */
const STAR_NEAR = 26;
const STAR_FAR = 96;

/** Mid-depth drift occupies a slab around the machine. */
const DRIFT_EXTENT: [number, number, number] = [15, 10, 11];
/** ...but never inside the machine itself. */
const DRIFT_CAVITY = 3.1;

/**
 * Foreground bokeh sits between the machine and the camera. The camera looks
 * from NEGATIVE Z (the convention that puts the motor on screen left), so
 * "closer than the machine" means negative Z.
 */
const FORE_Z: [number, number] = [-4.6, -2.1];

export interface SpaceBlock {
  start: number;
  count: number;
}

export interface SpaceField {
  /** positions */
  home: Float32Array;
  /** 0 star · 1 drift · 2 foreground */
  kind: Float32Array;
  seed: Float32Array;
  size: Float32Array;
  /** unit direction of the local flow (orbital around the machine) */
  flow: Float32Array;
  /** how far this particle obeys the flow */
  flowAmp: Float32Array;
  /** 0 = as far as it gets, 1 = right at the camera. Drives parallax + twinkle. */
  parallax: Float32Array;
  /** contiguous blocks, so each population can be drawn on its own */
  blocks: {
    stars: SpaceBlock;
    drift: SpaceBlock;
    foreground: SpaceBlock;
  };
  count: number;
}

/**
 * The flow field: a slow orbit around the machine with a vertical roll, so
 * mid-depth particles curve through space instead of jittering in place. It is
 * a pure function of position, which keeps the field coherent — neighbours
 * travel together.
 */
function flowAt(x: number, y: number, z: number, out: Float32Array, o: number) {
  const r = Math.hypot(x, y) || 1e-4;
  const wobble = Math.sin(r * 0.35) * 0.35;
  let dx = -y / r + wobble * 0.2;
  let dy = (x / r) * 0.72 + wobble * 0.5;
  let dz = Math.sin(x * 0.22 + y * 0.17) * 0.42 + (z > 0 ? 0.12 : -0.12);
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  out[o] = dx;
  out[o + 1] = dy;
  out[o + 2] = dz;
}

/** Uniform point on a sphere shell of the given radius. */
function shell(i: number, radius: number, out: Float32Array, o: number) {
  const u = rnd(i, 71) * 2 - 1;
  const phi = rnd(i, 72) * TAU;
  const s = Math.sqrt(Math.max(0, 1 - u * u));
  out[o] = Math.cos(phi) * s * radius;
  out[o + 1] = u * radius * 0.85;
  out[o + 2] = Math.sin(phi) * s * radius;
}

export function buildSpaceField(count: number): SpaceField {
  const home = new Float32Array(count * 3);
  const kind = new Float32Array(count);
  const seed = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const flow = new Float32Array(count * 3);
  const flowAmp = new Float32Array(count);
  const parallax = new Float32Array(count);

  const starEnd = Math.round(count * STAR_SHARE);
  const driftEnd = starEnd + Math.round(count * DRIFT_SHARE);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    seed[i3] = rnd(i, 81);
    seed[i3 + 1] = rnd(i, 82);
    seed[i3 + 2] = rnd(i, 83);

    if (i < starEnd) {
      /* ------------------------------- stars ------------------------------ */
      kind[i] = 0;
      const radius = STAR_NEAR + rnd(i, 84) * (STAR_FAR - STAR_NEAR);
      shell(i, radius, home, i3);
      // a star stays a star: small, and smaller still if it is far away
      size[i] = 0.0055 + rnd(i, 85) * 0.0075;
      flowAmp[i] = 0.04;
      parallax[i] = 0.04 + (1 - radius / STAR_FAR) * 0.1;
    } else if (i < driftEnd) {
      /* --------------------------- mid-depth drift ------------------------ */
      kind[i] = 1;
      let x = 0;
      let y = 0;
      let z = 0;
      // rejection-sample out of the machine's cavity so nothing sits inside it
      for (let attempt = 0; attempt < 4; attempt++) {
        x = (rnd(i, 95 + attempt * 4) * 2 - 1) * DRIFT_EXTENT[0];
        y = (rnd(i, 96 + attempt * 4) * 2 - 1) * DRIFT_EXTENT[1];
        z = (rnd(i, 97 + attempt * 4) * 2 - 1) * DRIFT_EXTENT[2];
        if (Math.hypot(x, y, z) > DRIFT_CAVITY) break;
      }
      home[i3] = x;
      home[i3 + 1] = y;
      home[i3 + 2] = z;
      size[i] = 0.009 + Math.pow(rnd(i, 98), 2) * 0.02;
      flowAt(x, y, z, flow, i3);
      flowAmp[i] = 0.5 + rnd(i, 99) * 1.5;
      parallax[i] = 0.3;
    } else {
      /* ---------------------------- foreground ---------------------------- */
      kind[i] = 2;
      home[i3] = (rnd(i, 100) * 2 - 1) * 5.4;
      home[i3 + 1] = (rnd(i, 101) * 2 - 1) * 3.4;
      // outermost first so the block is ordered from far to near
      home[i3 + 2] = FORE_Z[0] + rnd(i, 102) * (FORE_Z[1] - FORE_Z[0]);
      // close, large and soft: cinematic bokeh passing the lens
      size[i] = 0.075 + rnd(i, 103) * 0.19;
      flowAt(home[i3], home[i3 + 1], home[i3 + 2], flow, i3);
      flowAmp[i] = 0.55 + rnd(i, 104) * 0.9;
      parallax[i] = 1;
    }
  }

  return {
    home,
    kind,
    seed,
    size,
    flow,
    flowAmp,
    parallax,
    blocks: {
      stars: { start: 0, count: starEnd },
      drift: { start: starEnd, count: driftEnd - starEnd },
      foreground: { start: driftEnd, count: count - driftEnd },
    },
    count,
  };
}
