/**
 * The EdgeSense mark is the brand identity, so its structure is asserted here
 * rather than eyeballed: the blue vibration ribbon must live to the left of the
 * core, the orange acoustic arcs to the right, the letter E must be present
 * inside the stator ring, and the whole composition must be framed and budgeted
 * the way the renderer assumes (3.4 units wide, mostly midground particles).
 */
import { describe, expect, it } from "vitest";
import { BLUE_SHARE, E_STROKES, OBJ_W, ORANGE_SHARE, buildEmblem } from "../emblem";

const COUNT = 4000;
const e = buildEmblem(COUNT);

const xs = (tint: number) =>
  Array.from({ length: COUNT }, (_, i) => i)
    .filter((i) => e.tint[i] === tint)
    .map((i) => e.home[i * 3]);

describe("EdgeSense emblem", () => {
  it("keeps the vibration ribbon on the left of the core", () => {
    const blue = xs(1);
    expect(blue.length).toBeGreaterThan(COUNT * BLUE_SHARE * 0.95);
    expect(Math.max(...blue)).toBeLessThan(-0.4);
  });

  it("keeps the acoustic arcs on the right of the core", () => {
    const orange = xs(2);
    expect(orange.length).toBeGreaterThan(COUNT * ORANGE_SHARE * 0.95);
    expect(Math.min(...orange)).toBeGreaterThan(0.4);
  });

  it("draws the E as a dense vertical spine inside the ring", () => {
    let spine = 0;
    for (let i = 0; i < COUNT; i++) {
      if (e.tint[i] !== 0 || e.layer[i] !== 1) continue;
      const x = e.home[i * 3];
      const y = e.home[i * 3 + 1];
      if (x > -0.42 && x < -0.28 && Math.abs(y) < 0.68) spine++;
    }
    // four strokes at 34% of the white budget leaves the spine well populated
    expect(spine).toBeGreaterThan(30);
  });

  it("is an E: three arms, and the middle one is the short one", () => {
    // three populated horizontal bands, to the left of the ring's right edge
    const band = (y: number) => {
      let n = 0;
      for (let i = 0; i < COUNT; i++) {
        if (e.tint[i] !== 0 || e.layer[i] !== 1) continue;
        if (Math.abs(e.home[i * 3 + 1] - y) < 0.06 && e.home[i * 3] < 0.34) n++;
      }
      return n;
    };
    expect(band(0.49)).toBeGreaterThan(20); // top arm
    expect(band(0.0)).toBeGreaterThan(20); // middle arm
    expect(band(-0.49)).toBeGreaterThan(20); // bottom arm

    // and a definitional check that this is an E rather than an F: the middle
    // arm is drawn short, the outer two reach equally far
    expect(E_STROKES[2].x1).toBeLessThan(E_STROKES[1].x1 - 0.1);
    expect(E_STROKES[3].x1).toBeCloseTo(E_STROKES[1].x1, 2);
  });

  it("frames the mark at the object width the renderer assumes", () => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let background = 0;
    for (let i = 0; i < COUNT; i++) {
      const x = e.home[i * 3];
      const y = e.home[i * 3 + 1];
      const z = e.home[i * 3 + 2];
      expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true);
      if (e.layer[i] === 0) {
        background++;
        continue;
      }
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    expect(maxX - minX).toBeCloseTo(OBJ_W, 1);
    // wide composition, never taller than the frame allowance
    expect(maxY - minY).toBeLessThan(3.35);
    expect(maxY - minY).toBeLessThan(maxX - minX);
    // a little haze, but the mark itself must dominate the budget
    expect(background / COUNT).toBeLessThan(0.2);
  });

  it("gives every particle a dispersion direction and a reasonable push", () => {
    for (let i = 0; i < COUNT; i += 37) {
      const len = Math.hypot(e.scatter[i * 3], e.scatter[i * 3 + 1], e.scatter[i * 3 + 2]);
      expect(len).toBeCloseTo(1, 3);
      expect(e.scatterAmp[i]).toBeGreaterThan(0.4);
      expect(e.scatterAmp[i]).toBeLessThan(3.1);
    }
  });
});
