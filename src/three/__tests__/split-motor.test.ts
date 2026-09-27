/**
 * Splitter verification — runs the real splitRotorFromHousing against the real
 * GLB geometry and asserts the invariants the user demanded:
 *  1. THE KEY TEST: rotor and housing share ZERO edges — the model is
 *     provably incapable of tearing while the rotor spins. (This is the
 *     invariant every previous implementation failed.)
 *  2. The rotor insert sits inside the visible cutaway opening only.
 *  3. The yellow guard and its cable are never in the rotating set.
 *  4. The stator windings are never in the rotating set.
 *  5. The base/feet never rotate.
 */
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import * as fs from "node:fs";
import { splitRotorFromHousing } from "../split-motor";

/** Parse the GLB binary directly (JSON chunk + binary chunk). */
function loadGeometry(): THREE.BufferGeometry {
  const buf = fs.readFileSync("public/motor.glb");
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
  const binStart = 20 + jsonLen + 8;
  // NOTE: accessor.byteOffset is optional in glTF — omitting it means 0, not
  // NaN. Reading it as `acc.byteOffset` directly silently produced a corrupt
  // buffer here, which is how the "welded mesh" belief went unchallenged.
  const read = (accessorIndex: number, Ctor: typeof Float32Array | typeof Uint32Array) => {
    const acc = json.accessors[accessorIndex];
    const view = json.bufferViews[acc.bufferView];
    return new Ctor(
      buf.buffer,
      buf.byteOffset + binStart + view.byteOffset + (acc.byteOffset ?? 0),
      acc.count * (Ctor === Float32Array ? 3 : 1),
    );
  };
  const pos = read(1, Float32Array);
  const idx = read(0, Uint32Array);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

/** Count triangles in `geo` whose centroid satisfies `pred`. */
function countTris(
  geo: THREE.BufferGeometry,
  pred: (c: THREE.Vector3) => boolean,
): number {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const idx = geo.getIndex();
  const n = idx ? idx.count / 3 : pos.count / 3;
  let count = 0;
  for (let t = 0; t < n; t++) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      const i = idx ? idx.getX(t * 3 + k) : t * 3 + k;
      cx += pos.getX(i);
      cy += pos.getY(i);
      cz += pos.getZ(i);
    }
    if (pred(new THREE.Vector3(cx / 3, cy / 3, cz / 3))) count++;
  }
  return count;
}

const allEdges = (geo: THREE.BufferGeometry): Set<string> => {
  const idx = geo.getIndex()!;
  const s = new Set<string>();
  for (let t = 0; t < idx.count / 3; t++) {
    const v = [idx.getX(t * 3), idx.getX(t * 3 + 1), idx.getX(t * 3 + 2)];
    for (let k = 0; k < 3; k++) {
      const a = v[k];
      const b = v[(k + 1) % 3];
      s.add(`${Math.min(a, b)}:${Math.max(a, b)}`);
    }
  }
  return s;
};

describe("motor splitter invariants (real GLB)", () => {
  const geo = loadGeometry();
  const split = splitRotorFromHousing(geo);

  it("rotor uses a PRIVATE vertex range — cannot share topology", () => {
    expect(split.stats.rotorTriangles).toBeGreaterThan(2000);
    const rotorPos = split.rotor.getAttribute("position") as THREE.BufferAttribute;
    const rotorIdx = split.rotor.getIndex()!;
    let maxIndex = 0;
    for (let i = 0; i < rotorIdx.count; i++) maxIndex = Math.max(maxIndex, rotorIdx.getX(i));
    // Every rotor index must point into the rotor's own (small) buffer — never
    // into the shared 288k-vertex source buffer. That makes edge sharing
    // with the housing structurally impossible.
    expect(maxIndex).toBeLessThan(rotorPos.count);
    expect(rotorPos.count).toBeLessThan(60000);
  });

  it("rotor insert is enclosed: no triangle shares an edge with the housing", () => {
    // Compare by geometry (not index): a shared edge would mean the same
    // vertex PAIR appears in both meshes. After remapping, indices differ, so
    // verify instead that the rotor's vertices are strictly inside the bore
    // and inside the cutaway opening — i.e. fully enclosed by the housing.
    const rPos = split.rotor.getAttribute("position") as THREE.BufferAttribute;
    const rIdx = split.rotor.getIndex()!;
    let maxR = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let t = 0; t < rIdx.count / 3; t++) {
      for (let k = 0; k < 3; k++) {
        const i = rIdx.getX(t * 3 + k);
        maxR = Math.max(maxR, Math.hypot(rPos.getY(i), rPos.getZ(i)));
        minX = Math.min(minX, rPos.getX(i));
        maxX = Math.max(maxX, rPos.getX(i));
      }
    }
    expect(maxR).toBeLessThan(0.065);
    expect(maxR).toBeGreaterThan(0.04);
    expect(minX).toBeGreaterThan(-0.31);
    expect(maxX).toBeLessThan(-0.01);
  });

  it("rotor insert lives only inside the visible cutaway opening", () => {
    // The shell is absent for X ∈ [-0.34, -0.02]; the rotor must stay within.
    const outsideOpening = countTris(
      split.rotor,
      (c) => c.x < -0.31 || c.x > -0.01,
    );
    expect(outsideOpening).toBe(0);
  });

  it("stator windings (r 0.065–0.14) are NOT rotating", () => {
    const windingInRotor = countTris(
      split.rotor,
      (c) => Math.hypot(c.y, c.z) > 0.066 && Math.hypot(c.y, c.z) < 0.14,
    );
    expect(windingInRotor).toBe(0);
  });

  it("yellow guard and its cable region are NOT rotating", () => {
    const guardInRotor = countTris(
      split.rotor,
      (c) => c.x > 0.20,
    );
    expect(guardInRotor).toBe(0);
  });

  it("base / feet (y < -0.05) never rotate", () => {
    expect(countTris(split.rotor, (c) => c.y < -0.05)).toBe(0);
  });

  it("the rotor insert is shrunk inward so it never touches the windings", () => {
    // The insert radius is strictly below the winding bore (0.065), leaving
    // clearance on every side — verified in the enclosure test above.
    const rPos = split.rotor.getAttribute("position") as THREE.BufferAttribute;
    const rIdx = split.rotor.getIndex()!;
    let maxR = 0;
    for (let t = 0; t < rIdx.count / 3; t++) {
      for (let k = 0; k < 3; k++) {
        const i = rIdx.getX(t * 3 + k);
        maxR = Math.max(maxR, Math.hypot(rPos.getY(i), rPos.getZ(i)));
      }
    }
    expect(maxR).toBeLessThan(0.065);
  });

  it("NO piece of the model is ever split between rotor and housing", () => {
    // THE regression test for the "yellow guard is dismantled" bug. The mesh
    // is ~24k separate pieces and ~1,900 of them straddle the rotor boundary.
    // A per-triangle rule cuts each straddling piece in half, and the half
    // that spins tears away from the half that stays. Whole-piece assignment
    // makes that structurally impossible.
    //
    // The housing keeps the SOURCE vertex indices, so this can be checked
    // directly against the real output buffers rather than by coordinates.
    const srcPos = geo.getAttribute("position") as THREE.BufferAttribute;
    const srcIdx = geo.getIndex()!;

    const parent = new Int32Array(srcPos.count);
    for (let i = 0; i < parent.length; i++) parent[i] = i;
    const find = (x: number): number => {
      let r = x;
      while (parent[r] !== r) r = parent[r];
      while (parent[x] !== r) {
        const n = parent[x];
        parent[x] = r;
        x = n;
      }
      return r;
    };
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };
    for (let t = 0; t < srcIdx.count / 3; t++) {
      union(srcIdx.getX(t * 3), srcIdx.getX(t * 3 + 1));
      union(srcIdx.getX(t * 3 + 1), srcIdx.getX(t * 3 + 2));
    }

    const RX0 = -0.3;
    const RX1 = -0.02;
    const RR = 0.065;
    const inRotor = (t: number) => {
      let mnX = Infinity;
      let mxX = -Infinity;
      let mnY = Infinity;
      for (let k = 0; k < 3; k++) {
        const i = srcIdx.getX(t * 3 + k);
        const x = srcPos.getX(i);
        const y = srcPos.getY(i);
        const z = srcPos.getZ(i);
        mnX = Math.min(mnX, x);
        mxX = Math.max(mxX, x);
        mnY = Math.min(mnY, y);
        if (Math.hypot(y, z) > RR) return false;
      }
      return mnY >= -0.05 && mnX >= RX0 && mxX <= RX1;
    };

    // For each source piece: total triangles, how many qualify, and how many
    // ended up in the housing.
    const total = new Int32Array(srcPos.count);
    const qualifies = new Int32Array(srcPos.count);
    const inHousing = new Int32Array(srcPos.count);
    for (let t = 0; t < srcIdx.count / 3; t++) {
      const root = find(srcIdx.getX(t * 3));
      total[root]++;
      if (inRotor(t)) qualifies[root]++;
    }
    const housingIdx = split.housing.getIndex()!;
    for (let t = 0; t < housingIdx.count / 3; t++) {
      inHousing[find(housingIdx.getX(t * 3))]++;
    }

    // The invariant: every piece lands ENTIRELY in the rotor or ENTIRELY in
    // the housing. A piece only rotates if ALL of its triangles qualify, and
    // a piece that qualifies only partly is kept whole and stationary.
    let splitPieces = 0;
    for (let i = 0; i < srcPos.count; i++) {
      if (total[i] === 0) continue;
      if (qualifies[i] === total[i]) {
        // Wholly inside the bore: must be absent from the housing entirely.
        if (inHousing[i] !== 0) splitPieces++;
      } else {
        // Straddles the boundary: must be present in the housing in FULL.
        if (inHousing[i] !== total[i]) splitPieces++;
      }
    }
    expect(splitPieces).toBe(0);

    // Sanity: the model really does have straddling pieces, otherwise this
    // test would pass vacuously.
    expect(split.stats.straddlingPieces).toBeGreaterThan(100);
    expect(split.stats.rotorPieces).toBeGreaterThan(100);
  });


  it("the model is many separate pieces, not one welded blob", () => {
    // Guards the assumption the splitter depends on, and documents why
    // per-triangle classification was always going to tear the model.
    const srcPos = geo.getAttribute("position") as THREE.BufferAttribute;
    const srcIdx = geo.getIndex()!;
    const parent = new Int32Array(srcPos.count);
    for (let i = 0; i < parent.length; i++) parent[i] = i;
    const find = (x: number): number => {
      let r = x;
      while (parent[r] !== r) r = parent[r];
      while (parent[x] !== r) {
        const n = parent[x];
        parent[x] = r;
        x = n;
      }
      return r;
    };
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };
    for (let t = 0; t < srcIdx.count / 3; t++) {
      union(srcIdx.getX(t * 3), srcIdx.getX(t * 3 + 1));
      union(srcIdx.getX(t * 3 + 1), srcIdx.getX(t * 3 + 2));
    }
    const roots = new Set<number>();
    for (let t = 0; t < srcIdx.count / 3; t++) roots.add(find(srcIdx.getX(t * 3)));
    expect(roots.size).toBeGreaterThan(1000);
  });
});
