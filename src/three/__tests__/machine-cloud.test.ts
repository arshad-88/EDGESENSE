/**
 * The machine is represented by points sampled off the real GLB surface, so the
 * things worth asserting are geometric rather than visual:
 *
 *  - every particle sits ON the mesh (the machine is never approximated);
 *  - small mechanical detail is not swamped by the big flat panels;
 *  - the cloud is normalised the way the renderer's single layout transform
 *    assumes;
 *  - the two energy systems are anchored on the REAL sensors, with the blue
 *    ADXL345 on the motor end and the orange INMP441 on the pump end — reversed
 *    sensors are a hard visual failure;
 *  - the two alternative arrangements (signal streams, behaviour volume) land
 *    where the story needs them.
 *
 * The orientation assertions run against the shipped GLB via `glb-fixture`, so
 * they cannot be satisfied by a fixture that happens to agree with the code.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { OBJ_W } from "../emblem";
import { SENSOR_ANCHORS } from "../sensor-anchors";
import {
  BLUE_SHARE,
  BODY_SHARE,
  bakeMachineGeometry,
  bakePoint,
  buildMachineCloud,
  makeSurfaceSampler,
  REFLECT_SHARE,
} from "../machine-cloud";
import { loadGeometry } from "./glb-fixture";

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

  it("budgets the cloud by role, and accounts for every particle", () => {
    expect(kindCount(0)).toBeGreaterThan(COUNT * BODY_SHARE * 0.98);
    expect(kindCount(1)).toBeGreaterThan(COUNT * REFLECT_SHARE * 0.95);
    expect(kindCount(2)).toBeGreaterThan(COUNT * BLUE_SHARE * 0.95);
    expect(kindCount(3)).toBeGreaterThan(COUNT * 0.1 * 0.95);
    // sensor nodes and their flare exist as their own populations
    expect(kindCount(4)).toBeGreaterThan(COUNT * 0.012 * 0.9);
    expect(kindCount(5)).toBeGreaterThan(COUNT * 0.014 * 0.9);
    expect(kindCount(6)).toBeGreaterThan(COUNT * 0.018 * 0.9);
    expect(kindCount(7)).toBeGreaterThan(COUNT * 0.018 * 0.9);
    let total = 0;
    for (let k = 0; k < 8; k++) total += kindCount(k);
    expect(total).toBe(COUNT);
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
      expect(cloud.amp[i]).toBeLessThan(2.3);
      expect(Number.isFinite(cloud.home[i * 3])).toBe(true);
      expect(Number.isFinite(cloud.home[i * 3 + 1])).toBe(true);
      expect(Number.isFinite(cloud.home[i * 3 + 2])).toBe(true);
      expect(cloud.size[i]).toBeGreaterThan(0);
    }
  });

  it("gives the body particles a size you can actually see", () => {
    // "tiny pixels" is a hard failure: at the hero framing (camera ~6 units, a
    // ~1400 px scale) a body point must land at several device pixels, and the
    // field must still be varied rather than uniform
    let min = Infinity;
    let max = 0;
    for (let i = 0; i < COUNT; i++) {
      if (cloud.kind[i] !== 0) continue;
      min = Math.min(min, cloud.size[i]);
      max = Math.max(max, cloud.size[i]);
    }
    expect((min * 1400) / 6).toBeGreaterThan(3);
    expect(max / min).toBeGreaterThan(2);
  });
});

describe("the energy systems sit on the real sensors", () => {
  const real = bakeMachineGeometry(loadGeometry());
  const realCloud = buildMachineCloud(real, 40000);

  const mean = (kind: number, axis: number) => {
    let s = 0;
    let n = 0;
    for (let i = 0; i < realCloud.count; i++) {
      if (realCloud.kind[i] !== kind) continue;
      s += realCloud.home[i * 3 + axis];
      n++;
    }
    return s / Math.max(1, n);
  };

  it("maps the anchors through exactly the transform the bake applied", () => {
    const expected = bakePoint(SENSOR_ANCHORS.ADXL345, real);
    expect(realCloud.anchors.blue[0]).toBeCloseTo(expected[0], 6);
    expect(realCloud.anchors.blue[1]).toBeCloseTo(expected[1], 6);
    expect(realCloud.anchors.blue[2]).toBeCloseTo(expected[2], 6);
  });

  it("puts the ADXL345 on the motor (+X) and the INMP441 on the pump (−X)", () => {
    const [bx, by] = realCloud.anchors.blue;
    const [ox, oy] = realCloud.anchors.orange;
    expect(bx).toBeGreaterThan(0.5);
    expect(ox).toBeLessThan(-0.3);
    expect(bx - ox).toBeGreaterThan(1);
    // both sensors are mounted on top of the machine, not beside it
    expect(by).toBeGreaterThan(0);
    expect(oy).toBeGreaterThan(0);
    // and both are inside the machine's own bounds
    expect(bx).toBeLessThan(real.bmin.x + real.bsize.x);
    expect(ox).toBeGreaterThan(real.bmin.x);
  });

  it("glows blue off the MOTOR end and orange off the PUMP end", () => {
    // +X projects to screen left, so blue (vibration) is the left-hand system
    // and orange (acoustic) is the right-hand one — matching the reference
    expect(mean(2, 0)).toBeGreaterThan(0.4);
    expect(mean(3, 0)).toBeLessThan(-0.2);
    let blueMin = Infinity;
    let orangeMax = -Infinity;
    for (let i = 0; i < realCloud.count; i++) {
      const x = realCloud.home[i * 3];
      if (realCloud.kind[i] === 2) blueMin = Math.min(blueMin, x);
      else if (realCloud.kind[i] === 3) orangeMax = Math.max(orangeMax, x);
    }
    expect(orangeMax).toBeLessThan(blueMin);
  });

  it("clusters the sensor nodes on their own sensor", () => {
    const distance = (i: number, a: readonly [number, number, number]) =>
      Math.hypot(
        realCloud.home[i * 3] - a[0],
        realCloud.home[i * 3 + 1] - a[1],
        realCloud.home[i * 3 + 2] - a[2],
      );
    let blueNodeN = 0;
    let blueNodeSum = 0;
    let orangeNodeN = 0;
    let orangeNodeSum = 0;
    let blueFlareN = 0;
    let blueFlareSum = 0;
    for (let i = 0; i < realCloud.count; i++) {
      const k = realCloud.kind[i];
      if (k === 4) {
        blueNodeN++;
        blueNodeSum += distance(i, realCloud.anchors.blue);
      } else if (k === 5) {
        orangeNodeN++;
        orangeNodeSum += distance(i, realCloud.anchors.orange);
      } else if (k === 6) {
        blueFlareN++;
        blueFlareSum += distance(i, realCloud.anchors.blue);
      }
    }
    expect(blueNodeN).toBeGreaterThan(100);
    expect(orangeNodeN).toBeGreaterThan(100);
    expect(blueNodeSum / blueNodeN).toBeLessThan(0.16);
    expect(orangeNodeSum / orangeNodeN).toBeLessThan(0.16);
    // the flare is a wide soft halo, so it is allowed to be looser
    expect(blueFlareSum / blueFlareN).toBeLessThan(0.4);
  });
});

describe("the alternative arrangements", () => {
  it("builds two signal streams that merge and travel to the decision column", () => {
    let blueSideMean = 0;
    let blueSideN = 0;
    let orangeSideMean = 0;
    let orangeSideN = 0;
    let atDecision = 0;
    for (let i = 0; i < COUNT; i++) {
      const sx = cloud.stream[i * 3];
      const sy = cloud.stream[i * 3 + 1];
      const sz = cloud.stream[i * 3 + 2];
      expect(Number.isFinite(sx + sy + sz)).toBe(true);
      if (cloud.home[i * 3] >= 0) {
        blueSideMean += sx;
        blueSideN++;
      } else {
        orangeSideMean += sx;
        orangeSideN++;
      }
      if (sx < -1.5) atDecision++;
    }
    // the stream a particle joins is chosen by the end it came from, so the
    // blue stream starts further toward the motor end than the orange one
    expect(blueSideMean / blueSideN).toBeGreaterThan(orangeSideMean / orangeSideN);
    // and a real share of the field ends up in the decision column
    expect(atDecision / COUNT).toBeGreaterThan(0.05);
  });

  it("puts the behaviour volume where the learned-normal story needs it", () => {
    let inside = 0;
    let sumX = 0;
    for (let i = 0; i < COUNT; i++) {
      const x = cloud.cloud[i * 3];
      const y = cloud.cloud[i * 3 + 1];
      const z = cloud.cloud[i * 3 + 2];
      expect(Number.isFinite(x + y + z)).toBe(true);
      sumX += x;
      // the volume is an ellipsoid: everything must be within its (slightly
      // padded) envelope, which is what "healthy behaviour has a boundary" means
      const nx = (x - 0.35) / 1.32;
      const ny = (y - 0.08) / 0.86;
      const nz = z / 1.24;
      if (Math.hypot(nx, ny, nz) <= 1.2) inside++;
    }
    expect(inside / COUNT).toBeGreaterThan(0.98);
    expect(Math.abs(sumX / COUNT - 0.35)).toBeLessThan(0.25);
  });
});
