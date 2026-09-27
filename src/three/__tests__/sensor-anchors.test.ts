/**
 * Sensor anchor verification.
 *
 * The sensor markers were repeatedly re-anchored to the wrong part because the
 * positions were chosen by eyeballing screenshots instead of measuring the
 * mesh. These tests assert each anchor against the REAL `public/motor.glb`
 * geometry, so a future edit that moves one back onto a neighbouring part will
 * fail loudly rather than silently mislabeling the machine.
 *
 * What each anchor must be, per the intended hardware:
 *  - INMP441 — a spherical microphone head raised on a vertical post, high
 *    above the pump deck, between the motor and the coupling guard.
 *  - ADXL345 — a point on the motor housing at the drive end, sitting just
 *    clear of the local surface so the marker is never buried in the casting.
 */
import { describe, it, expect } from "vitest";
import { SENSOR_ANCHORS } from "../sensor-anchors";
import { loadPieces, type Piece } from "./glb-fixture";

const pieces: Piece[] = loadPieces();
const [ax, ay, az] = SENSOR_ANCHORS.ADXL345;
const [mx, my, mz] = SENSOR_ANCHORS.INMP441;

const horizDist = (p: Piece, x: number, z: number) =>
  Math.hypot(p.centre.x - x, p.centre.z - z);

describe("INMP441 anchor sits on a raised spherical mic head", () => {
  it("lands on real geometry, not empty space", () => {
    const hit = pieces
      .map((p) => ({ p, d: p.centre.distanceTo({ x: mx, y: my, z: mz } as never) }))
      .sort((a, b) => a.d - b.d)[0];
    expect(hit.d).toBeLessThan(0.02);
  });

  it("the head is a ball, not a flange or a bolt", () => {
    // Pick the MOST spherical piece near the anchor.
    const ratio = (p: Piece) =>
      Math.max(...p.size.toArray()) / Math.min(...p.size.toArray());
    const head = pieces
      .filter((p) => horizDist(p, mx, mz) < 0.02 && Math.abs(p.centre.y - my) < 0.02)
      .sort((a, b) => ratio(a) - ratio(b))[0];
    // Roughly isotropic — a mic capsule, not a disc or a rectangular flange.
    expect(ratio(head)).toBeLessThan(1.6);
    expect(Math.max(...head.size.toArray())).toBeLessThan(0.04);
  });

  it("the head is raised high above the pump deck on a thin vertical post", () => {
    // A mic resting on the pump body would sit near the deck height (~0.17).
    // The real mic is carried on a post and stands well above it.
    expect(my).toBeGreaterThan(0.20);

    // Among everything standing under the head, take the thinnest post.
    const crossSection = (p: Piece) => Math.max(p.size.x, p.size.z);
    const posts = pieces
      .filter(
        (p) =>
          horizDist(p, mx, mz) < 0.025 &&
          p.size.y > 0.04 &&
          p.size.y / Math.max(p.size.x, p.size.z) > 2.5 &&
          p.max.y < my,
      )
      .sort((a, b) => crossSection(a) - crossSection(b));
    expect(posts.length, "expected a vertical post beneath the mic head").toBeGreaterThan(0);
    expect(crossSection(posts[0])).toBeLessThan(0.015);
  });

  it("is on the pump side of the skid, past the motor", () => {
    // Motor occupies negative X; the guard and pump are positive X.
    expect(mx).toBeGreaterThan(0);
    // ...but still before the coupling guard, so it is not buried in the pump.
    expect(mx).toBeLessThan(0.25);
  });
});

describe("ADXL345 anchor sits clear on the motor housing", () => {
  it("is on the motor (drive) end, opposite the microphone", () => {
    expect(ax).toBeLessThan(-0.1);
    expect(mx - ax).toBeGreaterThan(0.3);
  });

  it("is not buried inside the motor casting", () => {
    // Highest surface of the casting within a 60 mm slab around the anchor.
    const deck = Math.max(
      ...pieces
        .filter((p) => Math.abs(p.centre.x - ax) < 0.06)
        .map((p) => p.max.y),
    );
    expect(ay, `anchor sits below the local deck (${deck})`).toBeGreaterThanOrEqual(
      deck,
    );
    // ...but not floating in the sky.
    expect(ay - deck).toBeLessThan(0.03);
  });
});

describe("the two markers are visually distinct", () => {
  it("are far enough apart that neither label can cover the other", () => {
    const d = Math.hypot(ax - mx, ay - my, az - mz);
    expect(d).toBeGreaterThan(0.4);
  });
});
