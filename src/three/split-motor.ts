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
 * Split rule (per triangle, using its centroid) — TWO rotating groups, both
 * circled by the user and both visually isolated from stationary geometry:
 *   ROTOR GROUP A: cutaway rotor core (X ∈ [-0.16, 0.02], r ≤ 0.11) — the
 *     exposed rotor inside the motor body window.
 *   ROTOR GROUP B: coupling drum (X ∈ [0.42, 0.50], r ≤ 0.15) — the dark
 *     drum between the yellow guard and the pump. Its right edge sits exactly
 *     at the pump flange (X = 0.46-0.50); the left edge at the guard. Both
 *     neighbours are stationary, and the drum's silhouette is rotationally
 *     symmetric, so spinning it cannot tear anything apart.
 *   HOUSING = everything else: stator, shaft ends, yellow guard (its cable
 *   runs to the microphone — never rotates), pump, base, sensors.
 *
 * The two groups rotate at the SAME angular speed about the SAME axis
 * (X), so any shaft geometry bridging them stays visually consistent.
 *   This conservatively guarantees the guard, sensors and housing never spin.
 */
import * as THREE from "three";

export interface SplitResult {
  housing: THREE.BufferGeometry;
  rotor: THREE.BufferGeometry;
  /** The coupling drum between the guard and the pump — also rotates. */
  coupling: THREE.BufferGeometry;
  /** Stats for console diagnostics. */
  stats: { triangles: number; rotorTriangles: number };
}

/** Cutaway rotor core radius (windings start ≈ 0.11). */
const ROTOR_RADIUS = 0.11;
/** Bottom band (mounting feet / base) always stays stationary. */
const FOOT_Y = -0.05;
/** Rotor window (motor body cutaway). */
const ROTOR_X0 = -0.16;
const ROTOR_X1 = 0.02;
/** Coupling drum window (between yellow guard and pump flange). */
const COUPLING_X0 = 0.42;
const COUPLING_X1 = 0.50;
const COUPLING_RADIUS = 0.15;

export function splitRotorFromHousing(source: THREE.BufferGeometry): SplitResult {
  const index = source.getIndex();
  const pos = source.getAttribute("position") as THREE.BufferAttribute;
  const triCount = index ? index.count / 3 : pos.count / 3;

  const rotor: number[] = [];
  const coupling: number[] = [];
  const housing: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const a = index ? index.getX(t * 3) : t * 3;
    const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
    const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
    const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    const r = Math.hypot(cy, cz);

    if (cy >= FOOT_Y && r <= ROTOR_RADIUS && cx >= ROTOR_X0 && cx <= ROTOR_X1) {
      rotor.push(a, b, c);
    } else if (
      cy >= FOOT_Y &&
      r <= COUPLING_RADIUS &&
      cx >= COUPLING_X0 &&
      cx <= COUPLING_X1
    ) {
      coupling.push(a, b, c);
    } else {
      housing.push(a, b, c);
    }
  }

  const housingGeo = source.clone();
  housingGeo.setIndex(housing);
  const rotorGeo = source.clone();
  rotorGeo.setIndex(rotor);
  const couplingGeo = source.clone();
  couplingGeo.setIndex(coupling);
  housingGeo.computeBoundingSphere();
  rotorGeo.computeBoundingSphere();
  couplingGeo.computeBoundingSphere();

  const stats = {
    triangles: triCount,
    rotorTriangles: (rotor.length + coupling.length) / 3,
  };
  console.info(
    `[EdgeSense 3D] split housing=${triCount - stats.rotorTriangles} tris, rotor=${rotor.length / 3} tris, coupling=${coupling.length / 3} tris of ${triCount}`,
  );
  return { housing: housingGeo, rotor: rotorGeo, coupling: couplingGeo, stats };
}
