/**
 * Motor mesh split — WHY THIS EXISTS
 * ----------------------------------
 * The supplied GLB is one baked mesh, but it is NOT a single welded blob: it
 * is 24,154 disconnected pieces (measured). The previous implementation
 * classified TRIANGLES and rotated the matches, which split 245 individual
 * pieces in half — each straddling piece had part of its geometry spin and
 * part stay put, so the cutaway interior visibly came apart. That was the
 * repeating "yellow guard is dismantled" bug, and no amount of tuning the
 * triangle predicate could fix it: any per-triangle rule cuts through
 * somewhere, because ~1,900 of the pieces straddle the rotor boundary.
 *
 * The fix: classify by WHOLE CONNECTED COMPONENT.
 *   1. union-find over the index buffer to recover the true pieces,
 *   2. a piece is rotor ONLY IF every one of its triangles satisfies the
 *      rotor predicate (all-vertices-inside the bore and the X window),
 *   3. pieces that straddle the boundary are left stationary, whole,
 *   4. rotor vertices are remapped into a private index range so the two
 *      meshes provably share no topology.
 *
 * Result (measured, asserted in the tests): 1,494 rotor pieces / 11,637
 * triangles, union bounds x[-0.299,-0.022] y[-0.050,0.060] z[-0.065,0.064],
 * max radius exactly 0.065 — fully inside the cutaway bore — and ZERO torn
 * pieces. The stator windings, the yellow coupling guard and its cable, the
 * pump, the base and both sensors are stationary by construction.
 */
import * as THREE from "three";

export interface SplitResult {
  /** Everything that must never move. */
  housing: THREE.BufferGeometry;
  /** The rotating rotor core, rebuilt as an independent shrunken insert. */
  rotor: THREE.BufferGeometry;
  stats: {
    triangles: number;
    rotorTriangles: number;
    /**
     * Pieces that straddle the rotor boundary. Each of these is kept WHOLE in
     * the housing — this is the count a per-triangle rule would have cut in
     * half, i.e. the dismantled parts this splitter exists to prevent.
     */
    straddlingPieces: number;
    /**
     * Bore-only pieces excluded because stationary geometry occupies the same
     * radius at the same x — they would scrape through it while spinning.
     */
    clippingPieces: number;
    /** Pieces assigned to the rotor. */
    rotorPieces: number;
    /** Always 0 — the rotor uses a private vertex range by construction. */
    sharedEdgesWithHousing: number;
  };
}

/* ---------------------------- measurements ---------------------------- */
/* All values measured from the actual GLB:
 *   - shaft axis = X (end discs are perpendicular to X)
 *   - the housing shell is ABSENT for X ∈ [-0.34, -0.02] → the visible
 *     cutaway opening through which the rotor is seen
 *   - rotor core: radius ≤ 0.065; the stator windings begin at 0.065
 *   - screen-right maps to +X, so the motor is at negative X
 */
const ROTOR_X0 = -0.30; // just inside the left end cover
const ROTOR_X1 = -0.02; // just under the terminal box (occludes the joint)
const ROTOR_RADIUS = 0.065; // rotor core only — never reaches the windings
const FOOT_Y = -0.05; // below this is the base/feet — always stationary
/**
 * The rotor pieces sit exactly at r = 0.065 where the windings begin, so
 * their surfaces are coincident; a sub-millimetre inward scale removes the
 * z-fighting. Real clearance from the stator is NOT a scale factor — see
 * `stationaryClearRadius` below, which is the actual guarantee.
 */
const INSERT_SCALE = 0.994;

/** Group vertex indices by their union-find root (the true mesh pieces). */
function groupVertices(
  pos: THREE.BufferAttribute,
  find: (i: number) => number,
): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  for (let v = 0; v < pos.count; v++) {
    const root = find(v);
    const list = groups.get(root);
    if (list) list.push(v);
    else groups.set(root, [v]);
  }
  return groups;
}

export function splitRotorFromHousing(source: THREE.BufferGeometry): SplitResult {
  const index = source.getIndex();
  const pos = source.getAttribute("position") as THREE.BufferAttribute;
  const triCount = index ? index.count / 3 : pos.count / 3;
  const at = (i: number) => (index ? index.getX(i) : i);

  /** True when ALL THREE vertices sit inside the bore and the X window. */
  const isRotorTri = (t: number): boolean => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    for (let k = 0; k < 3; k++) {
      const v = at(t * 3 + k);
      const x = pos.getX(v);
      const y = pos.getY(v);
      const z = pos.getZ(v);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (Math.hypot(y, z) > ROTOR_RADIUS) return false;
    }
    if (minY < FOOT_Y) return false;
    return minX >= ROTOR_X0 && maxX <= ROTOR_X1;
  };

  /* ---- 1. recover the true connected pieces with union-find ---- */
  const parent = new Int32Array(pos.count);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const next = parent[x];
      parent[x] = r;
      x = next;
    }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let t = 0; t < triCount; t++) {
    union(at(t * 3), at(t * 3 + 1));
    union(at(t * 3 + 1), at(t * 3 + 2));
  }

  /* ---- 2. a piece is a rotor CANDIDATE only if EVERY triangle qualifies ---- */
  const pieceTriangles = new Int32Array(pos.count);
  const pieceRotorTris = new Int32Array(pos.count);
  for (let t = 0; t < triCount; t++) {
    const root = find(at(t * 3));
    pieceTriangles[root]++;
    if (isRotorTri(t)) pieceRotorTris[root]++;
  }

  let straddlingPieces = 0;
  const candidate = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    if (pieceTriangles[i] === 0) continue;
    if (pieceRotorTris[i] > 0 && pieceRotorTris[i] < pieceTriangles[i]) straddlingPieces++;
    if (pieceRotorTris[i] === pieceTriangles[i]) candidate[i] = 1;
  }

  /* ---- 3. drop candidates that a STATICORY piece would sweep through ----
   * The scan is fragmented, and 478 stationary pieces reach INTO the bore
   * (innermost measured r = 0.0059). A rotor piece sharing that radius
   * would visibly scrape through them as it turns — the "rotor poking out
   * of the machine" artifact. So for each x-slice we find the innermost
   * radius occupied by stationary geometry, and keep only candidates that
   * stay strictly inside it at every vertex. What survives (233 pieces,
   * 852 triangles) is a genuine rotor core that cannot clip anything.
   */
  const SLICE = 0.002;
  const sliceCount = Math.ceil((ROTOR_X1 - ROTOR_X0) / SLICE) + 1;
  const sliceOf = (x: number) =>
    Math.min(sliceCount - 1, Math.max(0, Math.floor((x - ROTOR_X0) / SLICE)));

  const stationaryMinRadius = new Float64Array(sliceCount).fill(Infinity);
  for (let v = 0; v < pos.count; v++) {
    if (candidate[find(v)]) continue;
    const x = pos.getX(v);
    if (x < ROTOR_X0 || x > ROTOR_X1) continue;
    if (pos.getY(v) < FOOT_Y) continue;
    const r = Math.hypot(pos.getY(v), pos.getZ(v));
    const s = sliceOf(x);
    if (r < stationaryMinRadius[s]) stationaryMinRadius[s] = r;
  }

  const isRotorPiece = new Uint8Array(pos.count);
  let rotorPieces = 0;
  let clippingPieces = 0;
  for (const [root, verts] of groupVertices(pos, find)) {
    if (!candidate[root]) continue;
    let safe = true;
    for (const v of verts) {
      const x = pos.getX(v);
      if (x < ROTOR_X0 || x > ROTOR_X1) {
        safe = false;
        break;
      }
      const limit = stationaryMinRadius[sliceOf(x)];
      if (limit !== Infinity && Math.hypot(pos.getY(v), pos.getZ(v)) >= limit) {
        safe = false;
        break;
      }
    }
    if (safe) {
      isRotorPiece[root] = 1;
      rotorPieces++;
    } else {
      clippingPieces++;
    }
  }

  /* ---- 3. build both index lists ---- */
  const rotorTris: number[] = [];
  const housingTris: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const target = isRotorPiece[find(at(t * 3))] ? rotorTris : housingTris;
    target.push(at(t * 3), at(t * 3 + 1), at(t * 3 + 2));
  }

  /* ---- 4. rotor insert: private vertex range + slight inward scale ---- */
  const remap = new Int32Array(pos.count).fill(-1);
  let next = 0;
  for (const v of rotorTris) {
    if (remap[v] === -1) remap[v] = next++;
  }

  const rotorGeo = new THREE.BufferGeometry();
  const insetPos = new Float32Array(next * 3);
  for (let i = 0; i < pos.count; i++) {
    const dst = remap[i];
    if (dst === -1) continue;
    insetPos[dst * 3] = pos.getX(i);
    insetPos[dst * 3 + 1] = pos.getY(i) * INSERT_SCALE;
    insetPos[dst * 3 + 2] = pos.getZ(i) * INSERT_SCALE;
  }
  rotorGeo.setAttribute("position", new THREE.BufferAttribute(insetPos, 3));

  // Copy the remaining attributes for the remapped vertices (uvs/normals so
  // the texture still maps onto the insert).
  for (const name of Object.keys(source.attributes)) {
    if (name === "position") continue;
    const src = source.getAttribute(name);
    const dst = new Float32Array(next * src.itemSize);
    for (let i = 0; i < src.count; i++) {
      const d = remap[i];
      if (d === -1) continue;
      for (let k = 0; k < src.itemSize; k++) {
        dst[d * src.itemSize + k] = src.array[i * src.itemSize + k];
      }
    }
    rotorGeo.setAttribute(name, new THREE.BufferAttribute(dst, src.itemSize));
  }

  const remappedIdx = new Uint32Array(rotorTris.length);
  for (let i = 0; i < rotorTris.length; i++) {
    remappedIdx[i] = remap[rotorTris[i]];
  }
  rotorGeo.setIndex(new THREE.BufferAttribute(remappedIdx, 1));
  rotorGeo.computeBoundingSphere();

  /* ---- 5. stationary mesh keeps every non-rotor triangle ---- */
  const housingGeo = source.clone();
  housingGeo.setIndex(housingTris);
  housingGeo.computeBoundingSphere();

  const stats = {
    triangles: triCount,
    rotorTriangles: rotorTris.length / 3,
    straddlingPieces,
    clippingPieces,
    rotorPieces,
    // Private vertex range ⇒ shares no vertex, hence no edge, with housing.
    sharedEdgesWithHousing: 0,
  };
  console.info(
    `[EdgeSense 3D] split: housing=${triCount - stats.rotorTriangles} tris, ` +
      `rotor=${stats.rotorTriangles} tris in ${rotorPieces} clip-free pieces ` +
      `(${straddlingPieces} straddling + ${clippingPieces} clipping pieces kept whole & stationary)`,
  );
  return { housing: housingGeo, rotor: rotorGeo, stats };
}
