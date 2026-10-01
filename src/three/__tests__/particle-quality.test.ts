/**
 * The spec puts hard numbers on the particle budget (HIGH 100k–150k, MEDIUM
 * 60k–100k, LOW 30k–60k machine particles) and forbids the failure mode where a
 * weak device is handed "a few hundred dots". Those numbers are the contract, so
 * they are asserted here rather than trusted to a comment.
 *
 * The watchdog is asserted too: it must shed the extras only after a genuinely
 * sustained slowdown, and it must fire once, because a tier that oscillates is
 * worse than a tier that is merely low.
 */
import { describe, expect, it } from "vitest";
import {
  createFpsWatchdog,
  detectQualityTier,
  downgradeTier,
  isSlowFrame,
  prefersReducedMotion,
  QUALITY_ORDER,
  qualityBudget,
  type QualityTier,
} from "../particle-quality";

const TIERS: QualityTier[] = ["high", "medium", "low"];

describe("particle budgets", () => {
  it("keeps every tier inside the density bracket the spec demands", () => {
    const brackets: Record<QualityTier, [number, number]> = {
      high: [100_000, 150_000],
      medium: [60_000, 100_000],
      low: [30_000, 60_000],
    };
    for (const tier of TIERS) {
      const b = qualityBudget(tier, false);
      const [lo, hi] = brackets[tier];
      expect(b.machine).toBeGreaterThanOrEqual(lo);
      expect(b.machine).toBeLessThanOrEqual(hi);
    }
  });

  it("never falls back to a few hundred dots, even at the lowest tier", () => {
    for (const tier of TIERS) {
      const b = qualityBudget(tier, false);
      expect(b.machine).toBeGreaterThan(20_000);
      expect(b.space).toBeGreaterThan(5_000);
      expect(b.interaction).toBeGreaterThan(1_000);
    }
  });

  it("orders the tiers by density", () => {
    const machine = TIERS.map((t) => qualityBudget(t, false).machine);
    expect(machine[0]).toBeGreaterThan(machine[1]);
    expect(machine[1]).toBeGreaterThan(machine[2]);
    expect(QUALITY_ORDER).toEqual(["low", "medium", "high"]);
  });

  it("turns bloom off only on the lowest tier", () => {
    expect(qualityBudget("high", false).bloom).toBe(true);
    expect(qualityBudget("medium", false).bloom).toBe(true);
    expect(qualityBudget("low", false).bloom).toBe(false);
    expect(qualityBudget("low", false).bloomStrength).toBe(0);
    for (const tier of TIERS) {
      const b = qualityBudget(tier, false);
      expect(b.bloomStrength).toBeGreaterThanOrEqual(0);
      expect(b.bloomStrength).toBeLessThan(1);
      expect(b.dpr[0]).toBeGreaterThanOrEqual(1);
      expect(b.dpr[1]).toBeGreaterThanOrEqual(b.dpr[0]);
    }
  });

  it("keeps reduced motion at full density and eases the motion instead", () => {
    // the spec keeps the particles and reduces the movement, so density and
    // bloom are untouched while force and camera travel come right down
    for (const tier of TIERS) {
      const full = qualityBudget(tier, false);
      const calm = qualityBudget(tier, true);
      expect(calm.machine).toBe(full.machine);
      expect(calm.bloom).toBe(full.bloom);
      expect(calm.camera).toBeLessThan(full.camera);
      expect(calm.force).toBeLessThan(full.force);
      expect(calm.force).toBeGreaterThan(0);
      expect(calm.reducedMotion).toBe(true);
    }
  });

  it("probes a capability tier without a browser", () => {
    // the probes are all guarded, so this must not throw outside the DOM
    expect(TIERS).toContain(detectQualityTier());
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("downgrading", () => {
  it("steps down once and then stays put", () => {
    expect(downgradeTier("high")).toBe("medium");
    expect(downgradeTier("medium")).toBe("low");
    expect(downgradeTier("low")).toBe("low");
  });
});

describe("frame-rate watchdog", () => {
  it("classifies frames by budget", () => {
    expect(isSlowFrame(40)).toBe(true);
    expect(isSlowFrame(8)).toBe(false);
  });

  it("fires only after a sustained slowdown", () => {
    const w = createFpsWatchdog(26, 30);
    for (let i = 0; i < 29; i++) expect(w(40)).toBe(false);
    expect(w(40)).toBe(true);
  });

  it("forgives a single long frame", () => {
    const w = createFpsWatchdog(26, 30);
    for (let i = 0; i < 25; i++) expect(w(40)).toBe(false);
    // one fast frame clears the run, so a resize or a tab switch cannot
    // downgrade the field
    expect(w(8)).toBe(false);
    for (let i = 0; i < 29; i++) expect(w(40)).toBe(false);
    expect(w(40)).toBe(true);
  });

  it("never fires twice, so the tier cannot oscillate", () => {
    const w = createFpsWatchdog(26, 5);
    for (let i = 0; i < 5; i++) w(50);
    for (let i = 0; i < 200; i++) expect(w(50)).toBe(false);
  });
});
