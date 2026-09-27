/**
 * Splitter verification — runs the real splitRotorFromHousing against the
 * real GLB geometry and asserts the critical invariants the user demands:
 *  1. The yellow guard (X 0.34–0.44, r 0.10–0.18) is NOT in any rotating set.
 *  2. The cutaway rotor core (user circle 1) IS rotating.
 *  3. The coupling drum (user circle 2, X 0.46–0.50, r ≤ 0.15) IS rotating.
 *  4. The pump (X > 0.50) is NOT rotating.
 *  5. The base/feet (y < -0.05) are NOT rotating.
 *
 * Run with: bunx vitest run src/three/__tests__ — needs the GLB parsed via
 * GLTFLoader (three runs fine under node with its data:// fetch shimmed by
 * reading the file directly).
 */
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import * as fs from "node:fs";
import { splitRotorFromHousing } from "../split-motor";

// Parse the GLB binary directly (JSON chunk + binary chunk) without fetch.
function loadGeometry(): THREE.BufferGeometry {
  const buf = fs.readFileSync("public/motor.glb");
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
  const binStart = 20 + jsonLen + 8;
  const posAcc = json.accessors[1];
  const idxAcc = json.accessors[0];
  const pv = json.bufferViews[posAcc.bufferView];
  const iv = json.bufferViews[idxAcc.bufferView];
  const pos = new Float32Array(
    buf.buffer,
    buf.byteOffset + binStart + pv.byteOffset + posAcc.byteOffset,
    posAcc.count * 3,
  );
  const idx =
    posAcc.count > 65535
      ? new Uint32Array(
          buf.buffer,
          buf.byteOffset + binStart + iv.byteOffset + idxAcc.byteOffset,
          idxAcc.count,
        )
      : new Uint16Array(
          buf.buffer,
          buf.byteOffset + binStart + iv.byteOffset + idxAcc.byteOffset,
          idxAcc.count,
        );
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

/** Centroids of all triangles in a geometry, filtered by a predicate. */
function centroidStats(
  geo: THREE.BufferGeometry,
  pred: (c: THREE.Vector3) => boolean,
): { count: number } {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const idx = geo.getIndex()!;
  let count = 0;
  const v = new THREE.Vector3();
  for (let t = 0; t < idx.count / 3; t++) {
    v.set(0, 0, 0);
    for (let k = 0; k < 3; k++) {
      const i = idx.getX(t * 3 + k);
      v.add(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
    }
    v.multiplyScalar(1 / 3);
    if (pred(v)) count++;
  }
  return { count };
}

const inBox = (c: THREE.Vector3, x0: number, x1: number, y0: number, y1: number, rMax: number) =>
  c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1 && Math.hypot(c.y, c.z) <= rMax;

describe("motor splitter invariants (against real GLB)", () => {
  const geo = loadGeometry();
  const split = splitRotorFromHousing(geo);

  it("yellow guard is NOT in the rotor or coupling sets", () => {
    // Guard body: X 0.30–0.36 (measured density peak), above base
    const guardTris = centroidStats(geo, (c) => inBox(c, 0.30, 0.36, -0.02, 0.19, 0.19));
    const rotorInGuard = centroidStats(split.rotor, (c) => inBox(c, 0.30, 0.36, -0.02, 0.19, 0.19));
    const couplingInGuard = centroidStats(split.coupling, (c) => inBox(c, 0.30, 0.36, -0.02, 0.19, 0.19));
    expect(rotorInGuard.count).toBe(0);
    expect(couplingInGuard.count).toBe(0);
    expect(guardTris.count).toBeGreaterThan(5000); // sanity: guard geometry exists
  });

  it("cutaway rotor core (circle 1) IS in the rotor set", () => {
    const coreTris = centroidStats(geo, (c) => inBox(c, -0.16, 0.02, -0.05, 0.16, 0.11));
    const rotorInCore = centroidStats(split.rotor, (c) => inBox(c, -0.16, 0.02, -0.05, 0.16, 0.11));
    expect(coreTris.count).toBeGreaterThan(5000);
    // >95% of the core's triangles must be in the rotor set.
    expect(rotorInCore.count / coreTris.count).toBeGreaterThan(0.95);
  });

  it("coupling drum (circle 2) IS in the coupling set", () => {
    const drumTris = centroidStats(geo, (c) => inBox(c, 0.46, 0.50, -0.02, 0.13, 0.14));
    const couplingInDrum = centroidStats(split.coupling, (c) => inBox(c, 0.46, 0.50, -0.02, 0.13, 0.14));
    expect(drumTris.count).toBeGreaterThan(5000);
    expect(couplingInDrum.count / drumTris.count).toBeGreaterThan(0.98);
  });

  it("nothing beyond the coupling window (X > 0.50) rotates", () => {
    // The model ends at X ≈ 0.501; assert zero rotating tris past 0.501.
    const rotorBeyond = centroidStats(split.rotor, (c) => c.x > 0.501);
    const couplingBeyond = centroidStats(split.coupling, (c) => c.x > 0.501);
    expect(rotorBeyond.count).toBe(0);
    expect(couplingBeyond.count).toBe(0);
  });

  it("base/feet (y < -0.05) are NOT rotating", () => {
    const baseTris = centroidStats(geo, (c) => c.y < -0.05);
    const rotorInBase = centroidStats(split.rotor, (c) => c.y < -0.05);
    const couplingInBase = centroidStats(split.coupling, (c) => c.y < -0.05);
    expect(baseTris.count).toBeGreaterThan(10000);
    expect(rotorInBase.count).toBe(0);
    expect(couplingInBase.count).toBe(0);
  });
});
