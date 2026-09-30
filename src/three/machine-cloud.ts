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
 * On top of the sampled body the same typed arrays carry the machine's energy
 * systems — blue vibration rings and a waveform off the pump end, orange
 * acoustic arcs and a waveform off the motor/fan end, and a dim mirrored
 * reflection of the real silhouette on the floor. All of it is additive offset
 * space around real geometry, so every particle always knows the exact GLB
 * position it belongs to.
 */
import * as THREE from "three";
import { OBJ_W, rnd } from "./emblem";

const TAU = Math.PI * 2;

/** Particle budget by role. The body dominates so the silhouette reads. */
export const BODY_SHARE = 0.72;
export const REFLECT_SHARE = 0.08;
export const BLUE_SHARE = 0.09;
/* the remaining 0.11 is the orange acoustic system */

/** Blue vibration energy belongs to the pump end (negative X = screen left). */
const PUMP_HUB = 0.16;
/** Orange acoustic arcs radiate off the motor/fan end (positive X). */
const FAN_HUB = 0.92;
/** Vertical centre of both energy systems, as a fraction of the machine height. */
const HUB_Y = 0.58;
/** Ripple geometry: four bands, squashed in X so they hug the machine. */
const RING_BASE = 0.36;
const RING_STEP = 0.2;
const RING_SQUASH = 0.85;

export interface MachineAsset {
  /** Baked into the same object space as the emblem: centred on the origin and
   *  normalised to `OBJ_W` wide, so one layout transform frames both. */
  geometry: THREE.BufferGeometry;
  bmin: THREE.Vector3;
  bsize: THREE.Vector3;
}

export interface MachineCloud {
  /** Sampled GLB surface positions — the particle targets. */
  home: Float32Array;
  /** Unit dispersion direction per particle. */
  scatter: Float32Array;
  /** How far that particle is willing to travel. */
  amp: Float32Array;
  size: Float32Array;
  /** 0 body · 1 floor reflection · 2 blue vibration energy · 3 orange acoustics */
  kind: Float32Array;
  seed: Float32Array;
  floorY: number;
  count: number;
}

/**
 * Centre the machine on the origin and normalise it to `OBJ_W` wide, so a
 * single layout transform can frame the mark and the machine identically.
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
  };
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

/**
 * Sample the GLB surface into the particle targets, then append the machine's
 * energy systems and floor reflection — one flat typed-array set that a single
 * BufferGeometry can carry.
 */
export function buildMachineCloud(asset: MachineAsset, count: number): MachineCloud {
  const home = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);
  const amp = new Float32Array(count);
  const size = new Float32Array(count);
  const kind = new Float32Array(count);
  const seed = new Float32Array(count * 3);

  const sample = makeSurfaceSampler(asset.geometry);

  const bodyEnd = Math.round(count * BODY_SHARE);
  const reflectEnd = bodyEnd + Math.round(count * REFLECT_SHARE);
  const blueEnd = reflectEnd + Math.round(count * BLUE_SHARE);

  const x0 = asset.bmin.x;
  const y0 = asset.bmin.y;
  const w = asset.bsize.x;
  const hgt = asset.bsize.y;
  const pumpHubX = x0 + PUMP_HUB * w;
  const fanHubX = x0 + FAN_HUB * w;
  const hubY = y0 + HUB_Y * hgt;

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
        size[i] = 0.009 + Math.pow(h4, 2.0) * 0.0125;
        amp[i] = 0.3 + Math.pow(h3, 1.7) * 1.85;
      } else {
        /* ---- reflective floor: the same silhouette, mirrored shallowly
                under the base plate, so the machine sits on a lit floor ---- */
        kind[i] = 1;
        home[i3] *= 0.97;
        home[i3 + 1] = y0 - (home[i3 + 1] - y0) * 0.4;
        home[i3 + 2] = home[i3 + 2] * 0.9 - 0.1;
        size[i] = 0.0075 + h4 * 0.006;
        amp[i] = 0.22 + h3 * 0.9;
      }
    } else if (i < blueEnd) {
      /* ---- blue vibration energy off the pump end ---- */
      kind[i] = 2;
      if (h4 < 0.62) {
        // concentric ripple rings around the pump housing
        const band = Math.floor(h * 4);
        const radius = RING_BASE + band * RING_STEP + (h2 - 0.5) * 0.045;
        const angle = h3 * TAU + band * 0.7;
        home[i3] = pumpHubX + Math.cos(angle) * radius * RING_SQUASH;
        home[i3 + 1] = hubY + Math.sin(angle) * radius;
        home[i3 + 2] = (rnd(i, 25) - 0.5) * 0.75;
      } else {
        // the vibration waveform trailing off to the left
        const u = h2;
        home[i3] = x0 + 0.13 * w + Math.sin(u * 4.0) * 0.06;
        home[i3 + 1] =
          hubY + Math.sin(u * 17.0) * 0.42 * (0.3 + 0.7 * Math.sin(Math.PI * u));
        home[i3 + 2] = (h3 - 0.5) * 0.24;
      }
      size[i] = 0.01 + Math.pow(h4, 1.8) * 0.014;
      amp[i] = 0.35 + h * 1.3;
    } else {
      /* ---- orange acoustic arcs radiating off the motor/fan end ---- */
      kind[i] = 3;
      if (h4 < 0.58) {
        const band = Math.floor(h * 4);
        const radius = RING_BASE + band * RING_STEP + (h2 - 0.5) * 0.05;
        const angle = h3 * TAU + band * 0.7;
        home[i3] = fanHubX + Math.cos(angle) * radius * RING_SQUASH;
        home[i3 + 1] = hubY + Math.sin(angle) * radius;
        home[i3 + 2] = (rnd(i, 26) - 0.5) * 0.8;
      } else {
        const u = h2;
        home[i3] = x0 + 0.95 * w + Math.sin(u * 4.0) * 0.06;
        home[i3 + 1] =
          hubY + Math.sin(u * 23.0) * 0.46 * (0.3 + 0.7 * Math.sin(Math.PI * u));
        home[i3 + 2] = (h3 - 0.5) * 0.26;
      }
      size[i] = 0.01 + Math.pow(h4, 1.8) * 0.015;
      amp[i] = 0.4 + h * 1.5;
    }

    /* ---- dispersion direction: outward from the machine, with depth ---- */
    const dx = home[i3] * 0.55 + (rnd(i, 31) - 0.5) * 1.5;
    const dy = home[i3 + 1] * 0.5 + (rnd(i, 32) - 0.5) * 1.5;
    const dz = home[i3 + 2] * 0.4 + (rnd(i, 33) - 0.5) * 2.0;
    const len = Math.hypot(dx, dy, dz) || 1;
    scatter[i3] = dx / len;
    scatter[i3 + 1] = dy / len;
    scatter[i3 + 2] = dz / len;
  }

  return { home, scatter, amp, size, kind, seed, floorY: y0, count };
}
