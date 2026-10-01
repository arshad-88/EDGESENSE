/**
 * The scroll state machine is the connective tissue of the landing page, so its
 * contract is worth pinning down precisely:
 *
 *  - each of the seven states is exactly isolated at its own integer position;
 *  - between two states the blend is an interpolation, never a scale change, so
 *    a particle can never drift off the arrangement it is supposed to be in;
 *  - the mapping from real section centres to the state scalar puts a centred
 *    section exactly on its own state and clamps at both ends;
 *  - the framing values are all finite and positive, because the renderer feeds
 *    them straight into a camera and a scale.
 */
import { describe, expect, it } from "vitest";
import {
  arrangementWeights,
  HERO_SCALE,
  PARTICLE_STATES,
  sampleParticleState,
  STATE_COUNT,
  STATE_KEYFRAMES,
  stateFromSectionCentres,
} from "../particle-states";

const ARRANGEMENTS = ["machine", "expanded", "stream", "cloud", "deviation", "evidence"] as const;

describe("the seven states", () => {
  it("declares exactly the seven story states, once each", () => {
    expect(STATE_COUNT).toBe(7);
    expect(PARTICLE_STATES).toHaveLength(7);
    expect(new Set(PARTICLE_STATES).size).toBe(7);
    expect(STATE_KEYFRAMES.map((k) => k.id)).toEqual([...PARTICLE_STATES]);
  });

  it("keeps every keyframe finite and framable", () => {
    for (const k of STATE_KEYFRAMES) {
      for (const v of [k.ox, k.oy, k.scale, k.camZ, k.camY, k.camX, k.rotY, k.rotX]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      expect(k.scale).toBeGreaterThan(0.3);
      expect(k.camZ).toBeGreaterThan(3);
      expect(k.camZ).toBeLessThan(12);
      expect(HERO_SCALE * k.scale).toBeGreaterThan(0.7);
      expect(k.label.length).toBeGreaterThan(0);
      expect(k.note.length).toBeGreaterThan(0);
    }
  });

  it("uses both copy columns, so the sculpture always has a free side", () => {
    const sides = new Set(STATE_KEYFRAMES.map((k) => k.copy));
    expect(sides.has("left")).toBe(true);
    expect(sides.has("right")).toBe(true);
  });
});

/** The keyframe's own arrangement vector, normalised — what a particle must
 *  look like when that state is read exactly. */
const ownVector = (i: number) => {
  const k = STATE_KEYFRAMES[i];
  const raw = ARRANGEMENTS.map((a) => k[a]);
  const sum = raw.reduce((n, v) => n + v, 0);
  return raw.map((v) => v / sum);
};

const vectorOf = (s: number) => {
  const st = sampleParticleState(s);
  return ARRANGEMENTS.map((a) => st[a]);
};

describe("sampling the state scalar", () => {
  it("isolates each state on its own integer, with no bleed from its neighbours", () => {
    for (let i = 0; i < STATE_COUNT; i++) {
      const st = sampleParticleState(i);
      const k = STATE_KEYFRAMES[i];
      const got = vectorOf(i);
      const want = ownVector(i);
      for (let a = 0; a < ARRANGEMENTS.length; a++) {
        // fully isolated: the arrangement composition is exactly the keyframe's,
        // not a fraction of it diluted by the states either side
        expect(got[a]).toBeCloseTo(want[a], 6);
      }
      // and the framing is exactly the keyframe's
      expect(st.scale).toBeCloseTo(k.scale, 6);
      expect(st.ox).toBeCloseTo(k.ox, 6);
      expect(st.oy).toBeCloseTo(k.oy, 6);
      expect(st.camZ).toBeCloseTo(k.camZ, 6);
      expect(st.rotY).toBeCloseTo(k.rotY, 6);
      expect(st.sensor).toBeCloseTo(k.sensor, 6);
      expect(st.nearest).toBe(i);
      expect(st.blend).toBeCloseTo(0, 6);
      expect(st.copy).toBe(k.copy);
      expect(st.label).toBe(k.label);
    }
  });

  it("names the arrangement each state is actually made of", () => {
    const dominant = (i: number) => {
      const vec = ownVector(i);
      const best = Math.max(...vec);
      return ARRANGEMENTS[vec.indexOf(best)];
    };
    expect(dominant(0)).toBe("machine");
    expect(dominant(1)).toBe("expanded");
    expect(dominant(2)).toBe("stream");
    expect(dominant(3)).toBe("cloud");
    expect(dominant(4)).toBe("deviation");
    expect(dominant(5)).toBe("evidence");
    // the closing state is the machine again, from a different place
    expect(dominant(6)).toBe("machine");
    expect(sampleParticleState(6).rotY).not.toBeCloseTo(sampleParticleState(0).rotY, 3);
  });

  it("keeps the hero and the closing beat pure machine", () => {
    for (const s of [0, 6]) {
      expect(sampleParticleState(s).machine).toBeCloseTo(1, 6);
      for (const a of ARRANGEMENTS.filter((x) => x !== "machine")) {
        expect(sampleParticleState(s)[a]).toBeCloseTo(0, 6);
      }
    }
  });

  it("blends between two states without ever scaling the field", () => {
    for (let s = 0; s <= STATE_COUNT - 1; s += 0.125) {
      const st = sampleParticleState(s);
      const sum = ARRANGEMENTS.reduce((n, a) => n + st[a], 0);
      expect(sum).toBeCloseTo(1, 6);
      for (const a of ARRANGEMENTS) expect(st[a]).toBeGreaterThanOrEqual(0);
    }
  });

  it("is a true two-way blend halfway between neighbouring states", () => {
    for (let i = 0; i < STATE_COUNT - 1; i++) {
      const got = vectorOf(i + 0.5);
      const a = ownVector(i);
      const b = ownVector(i + 1);
      for (let k = 0; k < ARRANGEMENTS.length; k++) {
        expect(got[k]).toBeCloseTo((a[k] + b[k]) / 2, 6);
      }
    }
  });

  it("never mixes in an arrangement that neither neighbour uses", () => {
    for (let s = 0; s < STATE_COUNT - 1; s += 0.05) {
      const i = Math.floor(s);
      const allowed = new Set([
        ...ARRANGEMENTS.filter((_, k) => ownVector(i)[k] > 1e-6),
        ...ARRANGEMENTS.filter((_, k) => ownVector(i + 1)[k] > 1e-6),
      ]);
      const st = sampleParticleState(s);
      for (const a of ARRANGEMENTS) {
        if (!allowed.has(a)) expect(st[a]).toBeCloseTo(0, 6);
      }
    }
  });

  it("interpolates the framing monotonically between neighbours", () => {
    for (let i = 0; i < STATE_COUNT - 1; i++) {
      const a = STATE_KEYFRAMES[i].scale;
      const b = STATE_KEYFRAMES[i + 1].scale;
      const mid = sampleParticleState(i + 0.5).scale;
      expect(mid).toBeGreaterThanOrEqual(Math.min(a, b) - 1e-6);
      expect(mid).toBeLessThanOrEqual(Math.max(a, b) + 1e-6);
      expect(mid).toBeCloseTo((a + b) / 2, 6);
    }
  });

  it("clamps outside the story instead of over-rotating", () => {
    const under = sampleParticleState(-4);
    const over = sampleParticleState(99);
    expect(under.scale).toBeCloseTo(STATE_KEYFRAMES[0].scale, 6);
    expect(over.scale).toBeCloseTo(STATE_KEYFRAMES[6].scale, 6);
    expect(sampleParticleState(NaN).nearest).toBe(0);
  });

  it("reports how mid-transition it is, for the HUD", () => {
    // distance to the nearest state: 0 when a state is exactly centred, 0.5 at
    // the midpoint between two — which is the widest any transition gets
    expect(sampleParticleState(2.5).blend).toBeCloseTo(0.5, 6);
    expect(sampleParticleState(2).blend).toBeCloseTo(0, 6);
    expect(sampleParticleState(2.9).blend).toBeCloseTo(0.1, 6);
    expect(sampleParticleState(2.1).blend).toBeCloseTo(0.1, 6);
  });
});

describe("shader weights", () => {
  it("folds MACHINE_RECONSTRUCT into the home arrangement", () => {
    // the closing state must reuse the machine target rather than introducing a
    // seventh one: the shader carries five arrangements for exactly that reason
    const closing = arrangementWeights(sampleParticleState(6));
    expect(closing.w0[0]).toBeCloseTo(1, 6);
    expect(closing.w0[1]).toBeCloseTo(0, 6);
    expect(closing.w0[2]).toBeCloseTo(0, 6);
    expect(closing.w0[3]).toBeCloseTo(0, 6);
    expect(closing.w1[0]).toBeCloseTo(0, 6);
    expect(closing.w1[1]).toBeCloseTo(0, 6);
  });

  it("hands the shader four weights that sum to one", () => {
    for (let s = 0; s <= STATE_COUNT - 1; s += 0.2) {
      const w = arrangementWeights(sampleParticleState(s));
      const total = w.w0[0] + w.w0[1] + w.w0[2] + w.w0[3] + w.w1[0] + w.w1[1];
      expect(total).toBeCloseTo(1, 6);
      expect(w.w1[2]).toBe(0);
      expect(w.w1[3]).toBe(0);
    }
  });
});

describe("scroll position to state", () => {
  const centres = [0, 1000, 2000, 3000, 4000, 5000, 6000];

  it("reads a centred section as exactly one state", () => {
    centres.forEach((c, i) => {
      expect(stateFromSectionCentres(centres, c)).toBeCloseTo(i, 6);
    });
  });

  it("interpolates linearly in the gap between two sections", () => {
    expect(stateFromSectionCentres(centres, 500)).toBeCloseTo(0.5, 6);
    expect(stateFromSectionCentres(centres, 2500)).toBeCloseTo(2.5, 6);
    expect(stateFromSectionCentres(centres, 5500)).toBeCloseTo(5.5, 6);
  });

  it("clamps before the first and after the last section", () => {
    expect(stateFromSectionCentres(centres, -9999)).toBe(0);
    expect(stateFromSectionCentres(centres, 9999)).toBe(6);
  });

  it("survives a layout that has not been measured yet", () => {
    expect(stateFromSectionCentres([], 500)).toBe(0);
    expect(stateFromSectionCentres([400], 500)).toBe(0);
    expect(stateFromSectionCentres(centres, NaN)).toBe(0);
    // a zero-height section cannot produce NaN or Infinity
    const degenerate = stateFromSectionCentres([0, 0], 500);
    expect(Number.isFinite(degenerate)).toBe(true);
    expect(degenerate).toBe(1);
  });

  it("never leaves an undriven state, whatever the layout looks like", () => {
    const uneven = [0, 250, 2600, 2700, 5000, 5100, 9000];
    const seen = new Set<number>();
    for (let y = -500; y <= 9500; y += 25) {
      const s = stateFromSectionCentres(uneven, y);
      seen.add(Math.round(s));
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(6);
    }
    expect(seen.size).toBe(7);
  });
});
