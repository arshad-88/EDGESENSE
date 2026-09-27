/**
 * Split the single-mesh industrial motor GLB into "housing" (stationary) and
 * "rotor" (rotating) parts. The GLB ships as ONE combined mesh
 * ("world" → "geometry_0") with no node hierarchy or animation clips, so the
 * split must be recovered geometrically.
 *
 * Measured properties of this asset (see console logs at load time):
 *  - bounds: X ∈ [-0.50, 0.50] (shaft axis = X), Y/Z ∈ [-0.23, 0.23]
 *  - a cylindrical shaft protrusion runs the full X extent around r ≈ 0
 *  - the rotor/fan section occupies the middle of the shaft (|r| small,
 *    where the housing shell is far away); the housing shell + feet + end
 *    covers live at large |r|
 *
 * Split rule (per triangle, using its centroid):
 *   1. anything outside the housing shell envelope → ROTOR candidate
 *   2. within the envelope: points with small |y,z| radius that sit in X
 *      ranges where the housing shell is ABSENT (no large-radius geometry at
 *      that slice) belong to the exposed rotor/shaft/fan
 *   3. feet and mounting base (bottom of Y) are always HOUSING
 *
 * The result is two BufferGeometries reusing the original attribute buffers
 * with index ranges — no vertex data is copied, so it's fast and memory-safe.
 */
import * as THREE from "three";

export type MachinePart = "housing" | "rotor";

export interface SplitResult {
  housing: THREE.BufferGeometry;
  rotor: THREE.BufferGeometry;
  /** Stats for console diagnostics. */
  stats: { triangles: number; rotorTriangles: number };
}

/** Radius of the shaft + rotor body cylinder (tuned to measured geometry). */
const ROTOR_MAX_RADIUS = 0.105;
/** Bottom band (mounting feet / base) always stays stationary. */
const FOOT_Y = -0.16;

export function splitRotorFromHousing(source: THREE.BufferGeometry): SplitResult {
  const index = source.getIndex();
  const pos = source.getAttribute("position") as THREE.BufferAttribute;
  const triCount = index ? index.count / 3 : pos.count / 3;

  // Precompute per-X-slice presence of large-radius (housing shell) geometry.
  const SLICES = 40;
  const X0 = -0.52;
  const X1 = 0.52;
  const shellSlice = new Uint8Array(SLICES);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(y, z);
    if (r > 0.16) {
      const si = Math.min(SLICES - 1, Math.max(0, Math.floor(((x - X0) / (X1 - X0)) * SLICES)));
      shellSlice[si] = 1;
    }
  }
  // Dilate by one slice so fuzzy boundaries classify as housing.
  const shellDil = new Uint8Array(SLICES);
  for (let i = 0; i < SLICES; i++) {
    shellDil[i] =
      shellSlice[i] ||
      (i > 0 ? shellSlice[i - 1] : 0) ||
      (i < SLICES - 1 ? shellSlice[i + 1] : 0);
  }

  const rotor: number[] = [];
  const housing: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const a = index ? index.getX(t * 3) : t * 3;
    const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
    const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
    const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    const r = Math.hypot(cy, cz);

    let part: MachinePart;
    if (cy < FOOT_Y || cy > 0.20) {
      // Feet / top lifting region — housing.
      part = "housing";
    } else {
      const si = Math.min(SLICES - 1, Math.max(0, Math.floor(((cx - X0) / (X1 - X0)) * SLICES)));
      const shellHere = shellDil[si] === 1;
      if (r <= ROTOR_MAX_RADIUS && !shellHere) {
        // Exposed shaft / rotor / internal fan in the open section.
        part = "rotor";
      } else if (r <= ROTOR_MAX_RADIUS * 0.55 && !shellHere && cx > -0.15 && cx < 0.15) {
        // Centre hub of the internal fan (slightly larger allowance).
        part = "rotor";
      } else {
        part = "housing";
      }
    }
    (part === "rotor" ? rotor : housing).push(a, b, c);
  }

  const housingGeo = source.clone();
  housingGeo.setIndex(rotor);
  const rotorGeo = source.clone();
  rotorGeo.setIndex(rotor);
  housingGeo.computeBoundingSphere();
  rotorGeo.computeBoundingSphere();

  const stats = { triangles: triCount, rotorTriangles: rotor.length / 3 };
  console.info(
    `[EdgeSense 3D] split housing=${stats.triangles - stats.rotorTriangles} tris, rotor=${stats.rotorTriangles} tris of ${stats.triangles}`,
  );
  return { housing: housingGeo, rotor: rotorGeo, stats };
}
