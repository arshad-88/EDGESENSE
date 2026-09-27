/**
 * Split the single-mesh industrial motor GLB into "housing" (stationary) and
 * "rotor" (rotating) parts. The GLB ships as ONE combined mesh
 * ("world" → "geometry_0") with no node hierarchy or animation clips, so the
 * split must be recovered geometrically.
 *
 * Measured properties of this asset (logged at load time):
 *  - bounds: X ∈ [-0.50, 0.50] (shaft axis = X), Y/Z ∈ [-0.23, 0.23]
 *  - the shaft + rotor core form a cylinder of radius ≈ 0.06 around the axis
 *    running the full machine length
 *  - stator windings ≈ r 0.06–0.10, the yellow coupling guard ≈ r 0.10–0.16
 *    (stationary), housing shell/base/pump beyond that
 *
 * Split rule (per triangle, using its centroid):
 *   ROTOR  = the exposed cutaway rotor core (X ∈ [-0.16, 0.06], r ≤ 0.11)
 *     → exactly the part circled in the reference: rotor laminations + shaft
 *     through the cutaway window.
 *   HOUSING = everything else: stator windings (they are stationary — only
 *   the rotor spins), shaft ends hidden inside end covers, coupling, yellow
 *   guard (its cable runs to the microphone), housing, pump, base, sensors.
 *   This conservatively guarantees the guard, sensors and housing never spin.
 */
import * as THREE from "three";

export interface SplitResult {
  housing: THREE.BufferGeometry;
  rotor: THREE.BufferGeometry;
  /** Stats for console diagnostics. */
  stats: { triangles: number; rotorTriangles: number };
}

/** Shaft + rotor core cylinder radius (measured: windings start ≈ 0.065). */
const ROTOR_RADIUS = 0.11;
/** Bottom band (mounting feet / base) always stays stationary. */
const FOOT_Y = -0.05;
/** The exposed cutaway rotor window (between end cover and coupling guard).
 * Everything outside this X range stays stationary — incl. the yellow guard
 * (X > 0.12) so its cable to the microphone never disconnects. */
const ROTOR_X0 = -0.16;
const ROTOR_X1 = 0.06;

export function splitRotorFromHousing(source: THREE.BufferGeometry): SplitResult {
  const index = source.getIndex();
  const pos = source.getAttribute("position") as THREE.BufferAttribute;
  const triCount = index ? index.count / 3 : pos.count / 3;

  const rotor: number[] = [];
  const housing: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const a = index ? index.getX(t * 3) : t * 3;
    const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const cx = index ? (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3 : 0;
    const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
    const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    const r = Math.hypot(cy, cz);

    const isRotor =
      cy >= FOOT_Y && r <= ROTOR_RADIUS && cx >= ROTOR_X0 && cx <= ROTOR_X1;
    (isRotor ? rotor : housing).push(a, b, c);
  }

  const housingGeo = source.clone();
  housingGeo.setIndex(housing);
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
