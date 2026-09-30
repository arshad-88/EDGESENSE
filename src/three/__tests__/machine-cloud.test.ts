/**
 * The machine is represented by points sampled off the real GLB surface, so the
 * things worth asserting are geometric rather than visual: every particle must
 * sit ON the mesh, small mechanical detail must not be swamped by the big flat
 * panels, the sampled cloud must be normalised the way the renderer's single
 * layout transform assumes, and the energy systems must actually live on the
 * pump end (blue) and the motor/fan end (orange).
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { OBJ_W } from "../emblem";
import {
  BLUE_SHARE,
  BODY_SHARE,
  buildMachineCloud,
  makeSurfaceSampler,
  bakeMachineGeometry,
  REFLECT_SHARE,
} from "../machine-cloud";

/** A 2 x 0.5 x 0.6 slab stands in for the machine housing. */
const slab = () => new THREE.BoxGeometry(2, 0.5, 0.6, 3, 2, 2);

const asset = bakeMachineGeometry(slab());
const COUNT = 30000;
const cloud = buildMachineCloud(asset, COUNT);

const kindCount = (k: number) => {
  let n = 0;
  for (let i = 0; i < COUNT; i++) if (cloud.kind[i] === k) n++;
  return n;
};

describe("machine point cloud", () => {
  it("bakes the GLB into the object space the layout transform assumes", () => {
    const b = new THREE.Box3().setFromBufferAttribute(
      asset.geometry.getAttribute("position") as THREE.BufferAttribute,
    );
    const size = b.getSize(new THREE.Vector3());
    const center = b.getCenter(new THREE.Vector3());
    expect(size.x).toBeCloseTo(OBJ_W, 4);
    expect(center.length()).toBeLessThan(1e-4);
  });

  it("samples every particle onto the actual surface", () => {
    // the slab's surface: |x| = 1, |y| = 0.25, |z| = 0.3 (pre-bake units)
    const k = OBJ_W / 2;
    const half = { x: 1 * k, y: 0.25 * k, z: 0.3 * k };
    for (let i = 0; i < COUNT; i += 41) {
      if (cloud.kind[i] !== 0) continue;
      const x = Math.abs(cloud.home[i * 3]);
      const y = Math.abs(cloud.home[i * 3 + 1]);
      const z = Math.abs(cloud.home[i * 3 + 2]);
      // distance to the nearest face of the box must be ~0
      const gap = Math.min(
        Math.abs(x - half.x),
        Math.abs(y - half.y),
        Math.abs(z - half.z),
      );
      expect(gap).toBeLessThan(1e-3);
    }
  });

  it("spreads the body across all six faces, not one panel", () => {
    const k = OBJ_W / 2;
    const half = [1 * k, 0.25 * k, 0.3 * k];
    const faces = [0, 0, 0, 0, 0, 0]; // +x -x +y -y +z -z
    for (let i = 0; i < COUNT; i++) {
      if (cloud.kind[i] !== 0) continue;
      let best = 0;
      let bestGap = Infinity;
      for (let axis = 0; axis < 3; axis++) {
        const v = cloud.home[i * 3 + axis];
        const gap = Math.abs(Math.abs(v) - half[axis]);
        if (gap < bestGap) {
          bestGap = gap;
          best = axis * 2 + (v < 0 ? 1 : 0);
        }
      }
      faces[best]++;
    }
    for (const n of faces) expect(n).toBeGreaterThan(100);
  });

  it("keeps small mechanical detail from drowning in the big panels", () => {
    // one large panel next to one small one: at area^0.82 the small panel keeps
    // roughly 2.3x the share a pure area weighting would hand it
    const geometry = new THREE.BufferGeometry();
    const s = 10;
    const t = 0.1;
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([
          // big right triangle in the z = 0 plane, legs of length s
          0, 0, 0, s, 0, 0, 0, s, 0,
          // small right triangle far away in z
          5, 5, 4, 5 + t, 5, 4, 5, 5 + t, 4,
        ]),
        3,
      ),
    );
    const sample = makeSurfaceSampler(geometry);
    const out = new Float32Array(3);
    let small = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      sample(out, 0, i / N, (i * 0.618) % 1, (i * 0.381) % 1);
      if (out[2] > 1) small++;
    }
    const share = small / N;
    const pureAreaShare = (t * t) / (s * s + t * t); // ≈ 0.0001
    expect(share).toBeGreaterThan(pureAreaShare * 5);
    expect(share).toBeLessThan(0.05);
  });

  it("budgets the cloud by role", () => {
    expect(kindCount(0)).toBeGreaterThan(COUNT * BODY_SHARE * 0.98);
    expect(kindCount(1)).toBeGreaterThan(COUNT * REFLECT_SHARE * 0.95);
    expect(kindCount(2)).toBeGreaterThan(COUNT * BLUE_SHARE * 0.95);
    expect(kindCount(3)).toBeGreaterThan(COUNT * 0.1 * 0.95);
    expect(kindCount(0) + kindCount(1) + kindCount(2) + kindCount(3)).toBe(COUNT);
  });

  it("glows blue off the pump end and orange off the motor/fan end", () => {
    let blueSum = 0;
    let blueN = 0;
    let blueMaxX = -Infinity;
    let orangeSum = 0;
    let orangeN = 0;
    let orangeMinX = Infinity;
    for (let i = 0; i < COUNT; i++) {
      const x = cloud.home[i * 3];
      if (cloud.kind[i] === 2) {
        blueSum += x;
        blueN++;
        blueMaxX = Math.max(blueMaxX, x);
      } else if (cloud.kind[i] === 3) {
        orangeSum += x;
        orangeN++;
        orangeMinX = Math.min(orangeMinX, x);
      }
    }
    // blue vibration energy lives on the left of the machine, orange on the right
    expect(blueSum / blueN).toBeLessThan(-0.1);
    expect(orangeSum / orangeN).toBeGreaterThan(0.1);
    expect(blueMaxX).toBeLessThan(orangeMinX);
  });

  it("mirrors the real silhouette into a floor glow under the base plate", () => {
    const y0 = asset.bmin.y;
    let below = 0;
    let maxExcess = -Infinity;
    let minY = Infinity;
    for (let i = 0; i < COUNT; i++) {
      if (cloud.kind[i] !== 1) continue;
      const y = cloud.home[i * 3 + 1];
      if (y < y0) below++;
      maxExcess = Math.max(maxExcess, y - y0);
      minY = Math.min(minY, y);
    }
    // every reflection point sits at or under the base plate — samples taken on
    // the base plate itself mirror onto the floor exactly, so the count below
    // the plane is most, not all, of the budget
    expect(below).toBeGreaterThan(COUNT * REFLECT_SHARE * 0.7);
    expect(maxExcess).toBeLessThan(1e-4);
    // ...and the glow stays a shallow veneer rather than a full mirror
    expect(y0 - minY).toBeLessThan(0.45 * asset.bsize.y);
  });

  it("gives every particle a dispersion direction and a finite home", () => {
    for (let i = 0; i < COUNT; i += 37) {
      const len = Math.hypot(
        cloud.scatter[i * 3],
        cloud.scatter[i * 3 + 1],
        cloud.scatter[i * 3 + 2],
      );
      expect(len).toBeCloseTo(1, 3);
      expect(cloud.amp[i]).toBeGreaterThan(0.1);
      expect(cloud.amp[i]).toBeLessThan(3.2);
      expect(Number.isFinite(cloud.home[i * 3])).toBe(true);
      expect(Number.isFinite(cloud.home[i * 3 + 1])).toBe(true);
      expect(Number.isFinite(cloud.home[i * 3 + 2])).toBe(true);
      expect(cloud.size[i]).toBeGreaterThan(0);
    }
  });
});
