/**
 * Sensor anchor verification.
 *
 * These anchors were wrong for several revisions because the machine's
 * orientation was assumed rather than measured: the motor is at POSITIVE X and
 * the pump at NEGATIVE X, which is the opposite of the original guess. The
 * assertions below encode the measured orientation so that never regresses.
 *
 * Each anchor must sit on the real part it names in `public/motor.glb`:
 *  - ADXL345 — the accelerometer mount on top of the motor housing (+X end).
 *  - INMP441 — a near-spherical microphone head on a stem, on the pump side
 *    (−X end).
 */
import { describe, it, expect } from "vitest";
import { SENSOR_ANCHORS } from "../sensor-anchors";
import { loadPieces, type Piece } from "./glb-fixture";

const pieces: Piece[] = loadPieces();
const [ax, ay, az] = SENSOR_ANCHORS.ADXL345;
const [mx, my, mz] = SENSOR_ANCHORS.INMP441;

const at = (p: Piece, x: number, y: number, z: number) =>
  Math.hypot(p.centre.x - x, p.centre.y - y, p.centre.z - z);

/**
 * Distance from a point to a piece's bounding box.
 *
 * Anchors sit on the TOP FACE of a part, so measuring to the component's
 * centre would penalise tall parts for their own height. What matters is that
 * the anchor is on (or a hair above) the surface.
 */
function surfaceDistance(p: Piece, x: number, y: number, z: number): number {
  const dx = Math.max(p.min.x - x, 0, x - p.max.x);
  const dy = Math.max(p.min.y - y, 0, y - p.max.y);
  const dz = Math.max(p.min.z - z, 0, z - p.max.z);
  return Math.hypot(dx, dy, dz);
}
const horiz = (p: Piece, x: number, z: number) =>
  Math.hypot(p.centre.x - x, p.centre.z - z);
const longest = (p: Piece) => Math.max(...p.size.toArray());
const shortest = (p: Piece) => Math.min(...p.size.toArray());

describe("the machine's orientation is motor at +X", () => {
  it("puts the coupling guard near x = 0, between the two", () => {
    // The guard is the large thin vertical plate just past the motor.
    const guard = pieces
      .filter((p) => p.size.x < 0.02 && p.size.y > 0.2 && p.size.z > 0.2)
      .sort((a, b) => b.tris - a.tris)[0];
    expect(guard, "expected to find the coupling guard plate").toBeDefined();
    expect(Math.abs(guard.centre.x)).toBeLessThan(0.1);
  });

  it("places the two sensors on opposite ends", () => {
    expect(ax).toBeGreaterThan(0.1); // motor end
    expect(mx).toBeLessThan(-0.1); // pump end
    expect(ax - mx).toBeGreaterThan(0.4);
  });
});

describe("ADXL345 anchor", () => {
  it("lands on a real surface", () => {
    const nearest = Math.min(...pieces.map((p) => surfaceDistance(p, ax, ay, az)));
    expect(nearest, "anchor is floating away from the mesh").toBeLessThan(0.012);
  });

  it("sits on or just above the surface it is mounted to", () => {
    const local = pieces.filter((p) => horiz(p, ax, az) < 0.05);
    expect(local.length).toBeGreaterThan(0);
    const top = Math.max(...local.map((p) => p.max.y));
    // At or above the local top, but not floating in the air.
    expect(ay).toBeGreaterThanOrEqual(top - 0.01);
    expect(ay - top).toBeLessThan(0.04);
  });
});

describe("INMP441 anchor", () => {
  it("lands on a real surface", () => {
    const nearest = Math.min(...pieces.map((p) => surfaceDistance(p, mx, my, mz)));
    expect(nearest, "anchor is floating away from the mesh").toBeLessThan(0.012);
  });

  it("is a near-spherical head, not a flange or a bolt", () => {
    const head = pieces
      .filter((p) => p.tris > 8 && p.centre.distanceTo({
        x: mx, y: my, z: mz,
      } as never) < 0.05 && longest(p) < 0.06)
      .sort((a, b) => longest(a) / shortest(a) - longest(b) / shortest(b))[0];
    expect(head).toBeDefined();
    expect(longest(head) / shortest(head)).toBeLessThan(1.6);
  });

  it("is carried on a vertical stem beneath it", () => {
    const stems = pieces
      .filter(
        (p) =>
          horiz(p, mx, mz) < 0.04 &&
          p.size.y > 0.04 &&
          p.size.y / Math.max(p.size.x, p.size.z) > 1.5 &&
          p.max.y < my,
      )
      .sort((a, b) => b.size.y - a.size.y);
    expect(
      stems.length,
      "expected a vertical stem beneath the microphone head",
    ).toBeGreaterThan(0);
  });
});
