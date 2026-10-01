/**
 * Adaptive quality for the particle engine.
 *
 * The landing page is expected to push six figures of particles, which is only
 * defensible if the budget is chosen from what the device can actually do. The
 * tiers below are the spec's brackets — HIGH 100k–150k, MEDIUM 60k–100k, LOW
 * 30k–60k machine particles — plus the background field, bloom and interaction
 * complexity that each tier can afford.
 *
 * Two independent things feed the tier:
 *
 *  1. a capability probe at mount (cores, device memory, pointer coarseness,
 *     viewport size), and
 *  2. a runtime frame-rate watchdog, which can only ever step DOWN — a device
 *     that stutters gets cheaper particles, and it never oscillates back up
 *     into stutter.
 *
 * `prefers-reduced-motion` is deliberately NOT a downgrade to a lower tier: the
 * spec keeps the particles and reduces the *motion*, so it stays HIGH density
 * with the displacement, camera travel and repulsion force scaled back.
 */

export type QualityTier = "high" | "medium" | "low";

export interface QualityBudget {
  tier: QualityTier;
  /** machine particles (the sculpture itself) */
  machine: number;
  /** deep-space field particles: stars, nebula dust, mid-depth drift, foreground */
  space: number;
  /** the CPU-integrated cursor field that rides in front of the machine */
  interaction: number;
  bloom: boolean;
  bloomStrength: number;
  /** device pixel ratio range handed to the renderer */
  dpr: [number, number];
  /** repulsion strength multiplier — reduced motion keeps this low */
  force: number;
  /** camera travel multiplier */
  camera: number;
  reducedMotion: boolean;
}

/* ------------------------- environment probes ---------------------------- */

function nav(): Navigator | null {
  if (typeof navigator === "undefined") return null;
  return navigator;
}

/** `deviceMemory` is Chromium-only and not in the DOM lib types. */
function deviceMemory(): number {
  const n = nav() as (Navigator & { deviceMemory?: number }) | null;
  return n?.deviceMemory ?? 0;
}

/**
 * Safe media query. `?.` does not save you here: in a non-DOM environment
 * `window` itself is undefined, so touching `window.matchMedia` throws before
 * any optional chaining can help. Every probe in this file goes through this.
 */
function matches(query: string): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(query).matches;
}

export function prefersReducedMotion(): boolean {
  return matches("(prefers-reduced-motion: reduce)");
}

/** A coarse pointer with a small viewport is treated as a phone. */
function isHandheld(): boolean {
  if (typeof window === "undefined") return false;
  const small = Math.min(window.innerWidth, window.innerHeight) < 620;
  return matches("(pointer: coarse)") && small;
}

/**
 * Capability tier. Desktop starts HIGH; anything that reports itself as a
 * handheld, a low-core machine or a small viewport drops a tier, and a device
 * that fails on both counts drops two. LOW still gets tens of thousands of
 * particles, never "a few hundred dots".
 */
export function detectQualityTier(): QualityTier {
  const n = nav();
  if (!n) return "high";
  const cores = n.hardwareConcurrency ?? 8;
  const mem = deviceMemory();

  let score = 0;
  if (cores <= 4) score += 1;
  if (cores <= 2) score += 1;
  if (mem > 0 && mem <= 4) score += 1;
  if (isHandheld()) score += 2;
  else if (matches("(pointer: coarse)")) score += 1;

  if (score >= 2) return "low";
  if (score === 1) return "medium";
  return "high";
}

const TIERS: Record<QualityTier, Omit<QualityBudget, "reducedMotion" | "force" | "camera">> = {
  high: {
    tier: "high",
    machine: 130_000,
    space: 30_000,
    interaction: 6_000,
    bloom: true,
    // Deliberately low: with 100k+ additive points a strong bloom turns the
    // machine into a white blob and destroys the silhouette.
    bloomStrength: 0.4,
    dpr: [1, 1.75],
  },
  medium: {
    tier: "medium",
    machine: 82_000,
    space: 18_000,
    interaction: 4_000,
    bloom: true,
    bloomStrength: 0.3,
    dpr: [1, 1.5],
  },
  low: {
    tier: "low",
    machine: 46_000,
    space: 10_000,
    interaction: 2_500,
    bloom: false,
    bloomStrength: 0,
    dpr: [1, 1.25],
  },
};

export function qualityBudget(
  tier: QualityTier,
  reducedMotion: boolean,
): QualityBudget {
  return {
    ...TIERS[tier],
    reducedMotion,
    // Reduced motion keeps the field but stops shoving it around.
    force: reducedMotion ? 0.28 : 1,
    camera: reducedMotion ? 0.25 : 1,
  };
}

/** One step down, never up. */
export function downgradeTier(tier: QualityTier): QualityTier {
  return tier === "high" ? "medium" : "low";
}

export const QUALITY_ORDER: QualityTier[] = ["low", "medium", "high"];

/** Convenience: does this delta count as a slow frame? */
export const isSlowFrame = (deltaMs: number, slowMs = 26) => deltaMs > slowMs;

/**
 * Frame-rate watchdog. Feed it the frame delta in MILLISECONDS; it reports when
 * the renderer has been running below ~38 fps for a sustained stretch, at most
 * once, so the caller can shed the expensive extras and stop watching.
 *
 * Three details matter here:
 *  - only slow frames accumulate, and one fast frame forgives the whole
 *    backlog, so a single long frame (tab switch, resize, baseline training
 *    hitch) can never trigger a downgrade;
 *  - `sustain` is a run length, so the trigger needs roughly 1.5 s of genuine
 *    sustained slowness on a 60 Hz display;
 *  - it fires once, which is why the tier can be trusted never to oscillate.
 */
export function createFpsWatchdog(slowMs = 26, sustain = 90): (deltaMs: number) => boolean {
  let slow = 0;
  let fired = false;
  return (deltaMs: number) => {
    if (fired) return false;
    if (isSlowFrame(deltaMs, slowMs)) slow += 1;
    else slow = 0;
    if (slow < sustain) return false;
    fired = true;
    return true;
  };
}
