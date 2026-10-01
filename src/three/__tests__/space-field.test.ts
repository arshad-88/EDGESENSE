/**
 * The background is what makes the machine read as *inside* something rather
 * than pasted on black, so its layering is a contract:
 *
 *  - the three populations are contiguous and account for every particle, so
 *    each can be drawn on its own;
 *  - stars are genuinely far, dim and small;
 *  - mid-depth drift never intrudes into the machine's own cavity;
 *  - foreground particles are close, in front, and large (bokeh, not dust);
 *  - every parallax factor is derived from depth, which is what makes one
 *    pointer offset move the layers by different amounts.
 */
import { describe, expect, it } from "vitest";
import { buildSpaceField, DRIFT_SHARE, STAR_SHARE } from "../space-field";

const COUNT = 12000;
const field = buildSpaceField(COUNT);

const radius = (i: number) =>
  Math.hypot(field.home[i * 3], field.home[i * 3 + 1], field.home[i * 3 + 2]);

describe("deep-space field", () => {
  it("accounts for every particle exactly once, in contiguous blocks", () => {
    const { stars, drift, foreground } = field.blocks;
    expect(stars.start).toBe(0);
    expect(drift.start).toBe(stars.start + stars.count);
    expect(foreground.start).toBe(drift.start + drift.count);
    expect(foreground.start + foreground.count).toBe(COUNT);
    expect(stars.count).toBeGreaterThan(COUNT * STAR_SHARE * 0.98);
    expect(drift.count).toBeGreaterThan(COUNT * DRIFT_SHARE * 0.98);
  });

  it("keeps the stars far away, small and dim", () => {
    const { stars } = field.blocks;
    let minR = Infinity;
    let maxSize = 0;
    for (let i = stars.start; i < stars.start + stars.count; i++) {
      expect(field.kind[i]).toBe(0);
      minR = Math.min(minR, radius(i));
      maxSize = Math.max(maxSize, field.size[i]);
      expect(field.parallax[i]).toBeLessThan(0.2);
    }
    expect(minR).toBeGreaterThan(20);
    // a star must stay a star: a couple of pixels, not a bokeh ball
    expect((maxSize * 1400) / 60).toBeLessThan(4);
  });

  it("keeps mid-depth drift out of the machine", () => {
    const { drift, foreground } = field.blocks;
    // the machine is 3.4 wide and sits on the origin, so drift closer than the
    // cavity radius would end up inside the sculpture
    let closest = Infinity;
    for (let i = drift.start; i < drift.start + drift.count; i++) {
      expect(field.kind[i]).toBe(1);
      closest = Math.min(closest, radius(i));
    }
    expect(closest).toBeGreaterThan(2.5);
    // foreground particles exist, are close, IN FRONT of the machine, and large.
    // The camera looks from negative Z, so in front means more negative than
    // the machine — getting this sign wrong would put the bokeh behind the
    // sculpture instead of between it and the lens.
    expect(foreground.count).toBeGreaterThan(0);
    let maxZ = -Infinity;
    let minSize = Infinity;
    for (let i = foreground.start; i < foreground.start + foreground.count; i++) {
      expect(field.kind[i]).toBe(2);
      maxZ = Math.max(maxZ, field.home[i * 3 + 2]);
      minSize = Math.min(minSize, field.size[i]);
      expect(field.parallax[i]).toBe(1);
    }
    expect(maxZ).toBeLessThan(-1);
    expect(minSize).toBeGreaterThan(0.07);
  });

  it("derives parallax from depth, so no two layers move alike", () => {
    const star = field.parallax[0];
    const drift = field.parallax[field.blocks.drift.start];
    const fore = field.parallax[field.blocks.foreground.start];
    expect(star).toBeLessThan(drift);
    expect(drift).toBeLessThan(fore);
  });

  it("gives every moving particle a unit flow direction and a positive size", () => {
    for (let i = 0; i < COUNT; i += 13) {
      const len = Math.hypot(
        field.flow[i * 3],
        field.flow[i * 3 + 1],
        field.flow[i * 3 + 2],
      );
      // stars are effectively fixed: they have no local flow to follow
      if (field.kind[i] === 0) expect(len).toBe(0);
      else expect(len).toBeCloseTo(1, 3);
      expect(field.size[i]).toBeGreaterThan(0);
      expect(field.flowAmp[i]).toBeGreaterThan(0);
      expect(field.parallax[i]).toBeGreaterThan(0);
      expect(Number.isFinite(field.home[i * 3 + 1])).toBe(true);
    }
  });

  it("gives the drift field an orbital flow rather than random jitter", () => {
    // the flow is a pure function of position, so neighbours travel together.
    // An orbit has almost no radial component — that is what distinguishes a
    // flow field from per-particle noise, which would average ~0.5 radially.
    let outward = 0;
    let n = 0;
    for (let i = field.blocks.drift.start; i < field.blocks.drift.start + 2000; i++) {
      const px = field.home[i * 3];
      const py = field.home[i * 3 + 1];
      const r = Math.hypot(px, py) || 1;
      // radial component of the flow: an orbit has almost none
      const radial = (px / r) * field.flow[i * 3] + (py / r) * field.flow[i * 3 + 1];
      outward += Math.abs(radial);
      n++;
    }
    expect(outward / n).toBeLessThan(0.6);
  });

  it("builds deterministically", () => {
    const again = buildSpaceField(500);
    const first = buildSpaceField(500);
    expect(Array.from(again.home.slice(0, 30))).toEqual(Array.from(first.home.slice(0, 30)));
    expect(again.count).toBe(500);
  });
});
