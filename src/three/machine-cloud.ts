/**
 * The machine, as a point cloud sampled from the real GLB geometry.
 *
 * This is the counterpart to `emblem.ts`: pure geometry, free of React and of
 * the GPU, so the machine representation can be reasoned about and tested
 * without a renderer.
 *
 *   GLB surface triangles
 *        ↓  cumulative, sub-linearly area-weighted distribution
 *   picked triangle
 *        ↓  uniform barycentric sample
 *   typed-array particle target
 *
 * Sub-linear (area^0.82) weighting matters: a pure area weighting would give
 * the base plate an overwhelming share of the budget and wash the mechanical
 * detail — bolts, cooling ribs, flanges, the coupling guard, the fan cowl —
 * into indistinct dust. Backing the exponent off keeps coverage even enough to
 * read as a surface while still letting the small features claim a
 * disproportionate, and therefore legible, share of particles.
 *
 * On top of the sampled body the same typed arrays carry everything the field
 * can become:
 *
 *   home     the machine (every arrangement returns here)
 *   stream   the two sensor streams merging into the decision column
 *   cloud    the learned-normal behaviour volume
 *   kinds    the energy systems, sensor nodes and their flare
 *
 * ── Sensor sides are NOT decorative ────────────────────────────────────────
 * The ADXL345 is the accelerometer bolted to the MOTOR housing, which sits at
 * POSITIVE X (which projects to screen LEFT). It is the blue sensor, so the
 * blue vibration energy radiates from `sensorAnchors.blue`. The INMP441 is the
 * microphone on the PUMP side at NEGATIVE X and is orange. Both energy systems
 * are anchored on `SENSOR_ANCHORS` — the same coordinates the dashboard marks —
 * so the landing page cannot drift from the machine it is showing. Reversing
 * them is a hard visual failure, so `__tests__/machine-cloud.test.ts` asserts
 * the sides against the real GLB.
 */
import * as THREE from "three";
import { OBJ_W, rnd } from "./emblem";
import { SENSOR_ANCHORS } from "./sensor-anchors";

const TAU = Math.PI * 2;

/* ------------------------------- the budget ------------------------------- */

/** The body dominates so the silhouette reads. */
export const BODY_SHARE = 0.672;
export const REFLECT_SHARE = 0.07;
/** Blue vibration energy, off the motor end (ADXL345, +X). */
export const BLUE_SHARE = 0.085;
/** Orange acoustic energy, off the pump end (INMP441, −X). */
export const ORANGE_SHARE = 0.1;
/** Tight, very bright clusters exactly on the two sensors. */
export const NODE_BLUE_SHARE = 0.014;
export const NODE_ORANGE_SHARE = 0.016;
/** Wide soft halo on each sensor — the "glow around the active sensor". */
export const FLARE_BLUE_SHARE = 0.02;
/* the remainder is the orange flare */

/* ------------------------------- geometry -------------------------------- */

/** Ripple geometry: four bands around each sensor, squashed in X so they hug the machine. */
const RING_BASE = 0.3;
const RING_STEP = 0.15;
const RING_SQUASH = 0.92;

/** Where the two signal streams merge, and where the decision column stands. */
const MERGE_X = -0.3;
const DECISION_X = -1.95;

/** The learned-normal volume: a dense ellipsoid plus a thin envelope shell. */
const CLOUD_AXES: [number, number, number] = [1.32, 0.86, 1.24];
const CLOUD_CENTRE: [number, number, number] = [0.35, 0.08, 0];

export interface MachineAsset {
  /** Baked into the same object space as the emblem: centred on the origin and
   *  normalised to `OBJ_W` wide, so one layout transform frames both. */
  geometry: THREE.BufferGeometry;
  bmin: THREE.Vector3;
  bsize: THREE.Vector3;
  /** Centre of the raw model, in the GLB's own coordinates. */
  center: THREE.Vector3;
  /** Uniform scale applied by the bake (raw units → object units). */
  scale: number;
}

export interface SensorAnchors {
  /** ADXL345 — accelerometer on the motor housing. Blue. */
  blue: [number, number, number];
  /** INMP441 — microphone on the pump side. Orange. */
  orange: [number, number, number];
}

export interface MachineCloud {
  /** Sampled GLB surface positions — the particle targets. */
  home: Float32Array;
  /** Unit dispersion direction per particle. */
  scatter: Float32Array;
  /** How far that particle is willing to travel. */
  amp: Float32Array;
  size: Float32Array;
  /** 0 body · 1 floor · 2 blue energy · 3 orange energy ·
   *  4 blue node · 5 orange node · 6 blue flare · 7 orange flare */
  kind: Float32Array;
  seed: Float32Array;
  /** SIGNAL_FLOW target: position along one of the two sensor streams. */
  stream: Float32Array;
  /** LEARNED_NORMAL target: a point in the behaviour volume. */
  cloud: Float32Array;
  /** Where the two sensors actually are, in the baked object space. */
  anchors: SensorAnchors;
  floorY: number;
  count: number;
}

/**
 * Centre the machine on the origin and normalise it to `OBJ_W` wide, so a
 * single layout transform can frame the mark and the machine identically.
 *
 * `center` and `scale` are returned because sensor anchors defined in the GLB's
 * own coordinates have to be pushed through exactly the same transform.
 */
export function bakeMachineGeometry(geometry: THREE.BufferGeometry): MachineAsset {
  const baked = geometry.clone();
  baked.computeBoundingBox();
  const bb = baked.boundingBox as THREE.Box3;
  const center = bb.getCenter(new THREE.Vector3());
  const size = bb.getSize(new THREE.Vector3());
  const k = OBJ_W / Math.max(size.x, 1e-4);
  baked.translate(-center.x, -center.y, -center.z);
  baked.scale(k, k, k);
  // recompute in the baked space (computeBoundingBox rebuilds from scratch)
  baked.computeBoundingBox();
  const nb = baked.boundingBox as THREE.Box3;
  return {
    geometry: baked,
    bmin: nb.min.clone(),
    bsize: nb.getSize(new THREE.Vector3()),
    center,
    scale: k,
  };
}

/**
 * Push a point from the GLB's coordinates into the baked object space.
 * (translate by −center, then scale — the order the bake uses.)
 */
export function bakePoint(
  p: readonly [number, number, number],
  asset: MachineAsset,
): [number, number, number] {
  return [
    (p[0] - asset.center.x) * asset.scale,
    (p[1] - asset.center.y) * asset.scale,
    (p[2] - asset.center.z) * asset.scale,
  ];
}

export type SurfaceSampler = (
  out: Float32Array,
  offset: number,
  target: number,
  r1: number,
  r2: number,
) => void;

/** Barycentric, sub-linearly area-weighted surface sampling over raw triangles. */
export function makeSurfaceSampler(geometry: THREE.BufferGeometry): SurfaceSampler {
  const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
  const pos = posAttr.array as Float32Array;
  const indexAttr = geometry.getIndex();
  const indices: ArrayLike<number> | null = indexAttr
    ? (indexAttr.array as unknown as ArrayLike<number>)
    : null;
  const triCount = indexAttr
    ? Math.floor(indexAttr.count / 3)
    : Math.floor(posAttr.count / 3);

  if (triCount < 1) {
    return (out, offset) => {
      out[offset] = 0;
      out[offset + 1] = 0;
      out[offset + 2] = 0;
    };
  }

  const cum = new Float64Array(triCount);
  let total = 0;
  for (let t = 0; t < triCount; t++) {
    const t3 = t * 3;
    const a = (indices ? indices[t3] : t3) * 3;
    const b = (indices ? indices[t3 + 1] : t3 + 1) * 3;
    const c = (indices ? indices[t3 + 2] : t3 + 2) * 3;
    const ux = pos[b] - pos[a];
    const uy = pos[b + 1] - pos[a + 1];
    const uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a];
    const vy = pos[c + 1] - pos[a + 1];
    const vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const area = 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz);
    total += Math.pow(area, 0.82) + 1e-14;
    cum[t] = total;
  }

  return (out, offset, target, r1, r2) => {
    const want = Math.min(target, 0.999999) * total;
    let lo = 0;
    let hi = triCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < want) lo = mid + 1;
      else hi = mid;
    }
    const l3 = lo * 3;
    const a = (indices ? indices[l3] : l3) * 3;
    const b = (indices ? indices[l3 + 1] : l3 + 1) * 3;
    const c = (indices ? indices[l3 + 2] : l3 + 2) * 3;
    // Uniform point inside the picked triangle.
    const su = Math.sqrt(r1);
    const wa = 1 - su;
    const wb = su * (1 - r2);
    const wc = su * r2;
    out[offset] = pos[a] * wa + pos[b] * wb + pos[c] * wc;
    out[offset + 1] = pos[a + 1] * wa + pos[b + 1] * wb + pos[c + 1] * wc;
    out[offset + 2] = pos[a + 2] * wa + pos[b + 2] * wb + pos[c + 2] * wc;
  };
}

/* --------------------------- the arrangements ---------------------------- */

/**
 * SIGNAL_FLOW: a particle's position along one of the two sensor streams.
 *
 * `t` runs 0..1 along the journey. For the first 70% a particle travels from
 * its own sensor into the merge point, drifting through depth so the stream
 * reads as a 3D ribbon rather than a line; the last 30% leaves the merge as a
 * single channel into the decision column (screen right), where the vertical
 * spread is the evidence fanning out.
 */
export function streamTarget(
  t: number,
  side: 0 | 1,
  seedA: number,
  seedB: number,
  seedC: number,
  out: Float32Array,
  o: number,
): void {
  const startX = side === 0 ? 1.3 : -1.02;
  const startY = side === 0 ? 0.82 : -0.74;
  const startZ = side === 0 ? -0.55 : -0.7;

  if (t < 0.7) {
    const u = t / 0.7;
    const ex = startX + (MERGE_X - startX) * u;
    const ey = startY + (0 - startY) * u;
    const ez = startZ + (-1.55 - startZ) * u;
    out[o] = ex + Math.sin(u * 5.5 + seedA * 4) * 0.11;
    out[o + 1] = ey + Math.sin(u * 7.0 + seedB * 5) * 0.27;
    out[o + 2] = ez + Math.sin(u * 4.0 + seedC * 6) * 0.42;
  } else {
    const v = (t - 0.7) / 0.3;
    out[o] = MERGE_X + (DECISION_X - MERGE_X) * v + Math.sin(v * 6.0) * 0.09;
    out[o + 1] =
      Math.sin(v * 6.5 + (side === 0 ? 0 : Math.PI)) * 1.02 * (1 - 0.3 * v);
    out[o + 2] = -1.55 + (0.75 - -1.55) * v + Math.cos(v * 5.0 + seedA * 6) * 0.34;
  }

  // tube thickness: nearby particles travel together but not coincidentally
  out[o] += (seedA - 0.5) * 0.13;
  out[o + 1] += (seedB - 0.5) * 0.16;
  out[o + 2] += (seedC - 0.5) * 0.2;
}

/**
 * LEARNED_NORMAL: the behaviour volume every healthy window lands inside — a
 * dense ellipsoid, plus ~18% of the budget on a slightly wider envelope shell so
 * the region reads as *bounded* rather than as a loose blur.
 */
export function cloudTarget(
  i: number,
  out: Float32Array,
  o: number,
  i3: number,
): void {
  const onShell = rnd(i, 51) < 0.18;
  // gaussian-ish radius: the cube root of a uniform gives a filled volume,
  // biasing toward the middle where healthy behaviour actually clusters
  let r = Math.pow(rnd(i, 52), 0.42);
  if (onShell) r = 1 + 0.06 + rnd(i, 53) * 0.08;
  const u = rnd(i, 54) * 2 - 1;
  const phi = rnd(i, 55) * TAU;
  const s = Math.sqrt(Math.max(0, 1 - u * u));
  out[o] = CLOUD_CENTRE[0] + Math.cos(phi) * s * r * CLOUD_AXES[0];
  out[o + 1] = CLOUD_CENTRE[1] + u * r * CLOUD_AXES[1];
  out[o + 2] = CLOUD_CENTRE[2] + Math.sin(phi) * s * r * CLOUD_AXES[2];
  // a whisper of jitter keeps the shell from looking extruded
  out[o] += (rnd(i, 56) - 0.5) * 0.05;
  out[o + 1] += (rnd(i, 57) - 0.5) * 0.05;
  out[o + 2] += (rnd(i, 58) - 0.5) * 0.05;
  void i3;
}

/* ------------------------------ the builder ------------------------------ */

/**
 * Sample the GLB surface into the particle targets, then append the energy
 * systems, sensor nodes, flare, floor reflection and the two alternative
 * arrangements — one flat typed-array set a single BufferGeometry can carry.
 */
export function buildMachineCloud(asset: MachineAsset, count: number): MachineCloud {
  const home = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);
  const amp = new Float32Array(count);
  const size = new Float32Array(count);
  const kind = new Float32Array(count);
  const seed = new Float32Array(count * 3);
  const stream = new Float32Array(count * 3);
  const cloud = new Float32Array(count * 3);

  const sample = makeSurfaceSampler(asset.geometry);

  /** The sensors, in baked object space — the energy systems are anchored here. */
  const anchors: SensorAnchors = {
    blue: bakePoint(SENSOR_ANCHORS.ADXL345, asset),
    orange: bakePoint(SENSOR_ANCHORS.INMP441, asset),
  };
  const [bx, by, bz] = anchors.blue;
  const [ox, oy, oz] = anchors.orange;

  const bodyEnd = Math.round(count * BODY_SHARE);
  const reflectEnd = bodyEnd + Math.round(count * REFLECT_SHARE);
  const blueEnd = reflectEnd + Math.round(count * BLUE_SHARE);
  const orangeEnd = blueEnd + Math.round(count * ORANGE_SHARE);
  const nodeBlueEnd = orangeEnd + Math.round(count * NODE_BLUE_SHARE);
  const nodeOrangeEnd = nodeBlueEnd + Math.round(count * NODE_ORANGE_SHARE);
  const flareBlueEnd = nodeOrangeEnd + Math.round(count * FLARE_BLUE_SHARE);
  /* everything past flareBlueEnd is the orange flare */

  const y0 = asset.bmin.y;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const h = rnd(i, 21);
    const h2 = rnd(i, 22);
    const h3 = rnd(i, 23);
    const h4 = rnd(i, 24);
    seed[i3] = h;
    seed[i3 + 1] = h2;
    seed[i3 + 2] = h3;

    if (i < reflectEnd) {
      /* ---- the machine itself: a real sample of the GLB surface ---- */
      sample(home, i3, h, h2, h3);
      if (i < bodyEnd) {
        kind[i] = 0;
        // Visible, varied points — a dense luminous sculpture, not pixels.
        // The low end is ~4 device pixels at the hero framing and the exponent
        // keeps most of the field near it, so the large ones read as highlights
        // on the structure rather than as a uniform haze.
        size[i] = 0.022 + Math.pow(h4, 2.0) * 0.042;
        amp[i] = 0.3 + Math.pow(h3, 1.7) * 1.85;
      } else {
        /* ---- reflective floor: the same silhouette, mirrored shallowly
                under the base plate, so the machine sits on a lit floor ---- */
        kind[i] = 1;
        home[i3] *= 0.97;
        home[i3 + 1] = y0 - (home[i3 + 1] - y0) * 0.4;
        home[i3 + 2] = home[i3 + 2] * 0.9 - 0.1;
        size[i] = 0.016 + h4 * 0.016;
        amp[i] = 0.22 + h3 * 0.9;
      }
    } else if (i < blueEnd) {
      /* ---- BLUE vibration energy, radiating from the ADXL345 on the motor ---- */
      kind[i] = 2;
      if (h4 < 0.62) {
        const band = Math.floor(h * 4);
        const radius = RING_BASE + band * RING_STEP + (h2 - 0.5) * 0.04;
        const angle = h3 * TAU + band * 0.7;
        home[i3] = bx + Math.cos(angle) * radius * RING_SQUASH;
        home[i3 + 1] = by + Math.sin(angle) * radius;
        home[i3 + 2] = bz + (rnd(i, 25) - 0.5) * 0.7;
      } else {
        // the vibration waveform trailing off the motor end (screen left)
        const u = h2;
        home[i3] = bx + 0.16 + u * 0.95 + Math.sin(u * 4.0) * 0.06;
        home[i3 + 1] =
          by + Math.sin(u * 17.0) * 0.4 * (0.3 + 0.7 * Math.sin(Math.PI * u));
        home[i3 + 2] = bz + (h3 - 0.5) * 0.24;
      }
      size[i] = 0.024 + Math.pow(h4, 1.8) * 0.046;
      amp[i] = 0.35 + h * 1.3;
    } else if (i < orangeEnd) {
      /* ---- ORANGE acoustic energy, radiating from the INMP441 on the pump ---- */
      kind[i] = 3;
      if (h4 < 0.58) {
        const band = Math.floor(h * 4);
        const radius = RING_BASE + band * RING_STEP + (h2 - 0.5) * 0.045;
        const angle = h3 * TAU + band * 0.7;
        home[i3] = ox + Math.cos(angle) * radius * RING_SQUASH;
        home[i3 + 1] = oy + Math.sin(angle) * radius;
        home[i3 + 2] = oz + (rnd(i, 26) - 0.5) * 0.75;
      } else {
        const u = h2;
        home[i3] = ox - 0.16 - u * 0.95 + Math.sin(u * 4.0) * 0.06;
        home[i3 + 1] =
          oy + Math.sin(u * 23.0) * 0.44 * (0.3 + 0.7 * Math.sin(Math.PI * u));
        home[i3 + 2] = oz + (h3 - 0.5) * 0.26;
      }
      size[i] = 0.024 + Math.pow(h4, 1.8) * 0.048;
      amp[i] = 0.4 + h * 1.5;
    } else if (i < nodeBlueEnd) {
      /* ---- the ADXL345 itself: a tight, bright cluster on the accelerometer ---- */
      kind[i] = 4;
      const u = rnd(i, 27) * 2 - 1;
      const phi = h * TAU;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      const rr = 0.05 + h4 * 0.055;
      home[i3] = bx + Math.cos(phi) * s * rr * 1.5;
      home[i3 + 1] = by + u * rr * 0.8 + 0.01;
      home[i3 + 2] = bz + Math.sin(phi) * s * rr;
      size[i] = 0.044 + Math.pow(h4, 1.6) * 0.062;
      amp[i] = 0.25 + h2 * 0.5;
    } else if (i < nodeOrangeEnd) {
      /* ---- the INMP441 itself: a tight cluster on the microphone head ---- */
      kind[i] = 5;
      const u = rnd(i, 28) * 2 - 1;
      const phi = h * TAU;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      const rr = 0.045 + h4 * 0.05;
      home[i3] = ox + Math.cos(phi) * s * rr;
      home[i3 + 1] = oy + u * rr + 0.012;
      home[i3 + 2] = oz + Math.sin(phi) * s * rr;
      size[i] = 0.044 + Math.pow(h4, 1.6) * 0.062;
      amp[i] = 0.25 + h2 * 0.5;
    } else if (i < flareBlueEnd) {
      /* ---- the glow around the active accelerator: wide, soft, additive ---- */
      kind[i] = 6;
      const u = rnd(i, 29) * 2 - 1;
      const phi = h * TAU;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      home[i3] = bx + Math.cos(phi) * s * 0.3;
      home[i3 + 1] = by + u * 0.3 + 0.02;
      home[i3 + 2] = bz + Math.sin(phi) * s * 0.3;
      size[i] = 0.14 + h4 * 0.34;
      amp[i] = 0.3 + h2 * 0.7;
    } else {
      /* ---- ...and around the microphone ---- */
      kind[i] = 7;
      const u = rnd(i, 30) * 2 - 1;
      const phi = h * TAU;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      home[i3] = ox + Math.cos(phi) * s * 0.28;
      home[i3 + 1] = oy + u * 0.28 + 0.02;
      home[i3 + 2] = oz + Math.sin(phi) * s * 0.28;
      size[i] = 0.14 + h4 * 0.36;
      amp[i] = 0.3 + h2 * 0.7;
    }

    /* ---- dispersion direction: outward from the machine, with depth ---- */
    const dx = home[i3] * 0.55 + (rnd(i, 31) - 0.5) * 1.5;
    const dy = home[i3 + 1] * 0.5 + (rnd(i, 32) - 0.5) * 1.5;
    const dz = home[i3 + 2] * 0.4 + (rnd(i, 33) - 0.5) * 2.0;
    const len = Math.hypot(dx, dy, dz) || 1;
    scatter[i3] = dx / len;
    scatter[i3 + 1] = dy / len;
    scatter[i3 + 2] = dz / len;

    /* ---- the two alternative arrangements ---- */
    // Streams are split by the side the particle already belongs to, so the
    // blue stream is literally made of the blue particles.
    const blueSide = home[i3] >= 0;
    streamTarget(
      h4,
      blueSide ? 0 : 1,
      rnd(i, 34),
      rnd(i, 35),
      rnd(i, 36),
      stream,
      i3,
    );
    cloudTarget(i, cloud, i3, i3);
  }

  return {
    home,
    scatter,
    amp,
    size,
    kind,
    seed,
    stream,
    cloud,
    anchors,
    floorY: y0,
    count,
  };
}
