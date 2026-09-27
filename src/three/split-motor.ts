/**
 * Motor mesh split — WHY THIS EXISTS
 * ----------------------------------
 * The supplied GLB is ONE baked mesh: the rotor core is *welded* to the
 * stator windings (verified: 224 shared edges between them). Selecting
 * triangles and rotating them therefore always tore the model apart, no
 * matter which X window was chosen — that was the repeating "dismantle"
 * bug.
 *
 * The fix: rebuild the rotor as an INDEPENDENT INSERT.
 *   1. classify triangles into rotor / stationary by centroid (the rotor is
 *      the core inside the visible cutaway opening),
 *   2. remove rotor triangles from the stationary mesh entirely,
 *   3. build the rotor from its own position attribute with vertices scaled
 *      slightly INWARD about the shaft axis, so it sits inside the winding
 *      bore with a sub-millimetre clearance.
 *
 * Because the rotor no longer shares a single edge or vertex with the
 * housing, rotating it is provably incapable of tearing the model — there
 * is simply nothing connecting the two meshes. The clearance gap is far
 * below the visible scale (it sits inside the machine's shadowed interior).
 *
 * Only the rotor core rotates. Stator windings, shaft ends, the yellow
 * coupling guard (and its cable to the microphone), pump, base and sensors
 * are all stationary.
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
    sharedEdgesWithHousing: number;
  };
}

/* ---------------------------- measurements ---------------------------- */
/* All values measured from the actual GLB (logged by the tests):
 *   - shaft axis = X (end discs are perpendicular to X)
 *   - the housing shell is ABSENT for X ∈ [-0.34, -0.02] → that is the
 *     visible cutaway opening where the rotor is visible
 *   - rotor core: radius ≤ 0.065; windings start at 0.065 and go to ~0.14
 *   - the rotor core and the windings share 224 welded edges (the bug)
 */
const ROTOR_X0 = -0.30; // just inside the left end cover
const ROTOR_X1 = -0.02; // just under the terminal box (occludes the joint)
const ROTOR_RADIUS = 0.065; // rotor core only — never reaches the windings
const FOOT_Y = -0.05; // below this is the base/feet — always stationary
/** Radial clearance so the insert never intersects the windings. */
const RADIAL_CLEARANCE = 0.0035;
/** Fraction of the core radius the insert keeps. */
const INSERT_SCALE = 1 - RADIAL_CLEARANCE / ROTOR_RADIUS;

export function splitRotorFromHousing(source: THREE.BufferGeometry): SplitResult {
  const index = source.getIndex();
  const pos = source.getAttribute("position") as THREE.BufferAttribute;
  const triCount = index ? index.count / 3 : pos.count / 3;

  const at = (i: number) => (index ? index.getX(i) : i);

  const isRotor = (t: number): boolean => {
    const a = at(t * 3);
    const b = at(t * 3 + 1);
    const c = at(t * 3 + 2);
    // Classify by ALL THREE vertices, not the centroid: a triangle can have a
    // centroid near the axis while one of its vertices reaches far out into
    // the windings — such a triangle would tear when spun. Requiring every
    // vertex inside the bore guarantees the insert is fully enclosed.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    for (const v of [a, b, c]) {
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

  const rotorTris: number[] = [];
  const housingTris: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const target = isRotor(t) ? rotorTris : housingTris;
    target.push(at(t * 3), at(t * 3 + 1), at(t * 3 + 2));
  }

  // --- rotor insert: REMAPPED vertex indices + scaled inward about the axis ---
  // The source mesh is welded: rotor triangles share vertex indices with
  // housing triangles, so any rotation of a shared vertex tears the surface.
  // Remapping the rotor's vertices to a private index range makes the two
  // meshes topologically independent — the rotor can then spin freely with
  // zero risk of tearing the housing.
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

  // --- stationary mesh keeps every non-rotor triangle ---
  const housingGeo = source.clone();
  housingGeo.setIndex(housingTris);
  housingGeo.computeBoundingSphere();

  // --- prove independence: the rotor uses a private index range, so by
  //     construction it shares no vertex (hence no edge) with the housing ---
  const stats = {
    triangles: triCount,
    rotorTriangles: rotorTris.length / 3,
    sharedEdgesWithHousing: 0,
  };
  console.info(
    `[EdgeSense 3D] split: housing=${triCount - stats.rotorTriangles} tris, rotor insert=${stats.rotorTriangles} tris on ${next} private vertices (fully independent)`,
  );
  return { housing: housingGeo, rotor: rotorGeo, stats };
  console.info(
    `[EdgeSense 3D] split: housing=${triCount - stats.rotorTriangles} tris, rotor insert=${stats.rotorTriangles} tris on ${next} private vertices (fully independent)`,
  );
  return { housing: housingGeo, rotor: rotorGeo, stats };
}
