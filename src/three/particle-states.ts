/**
 * The scroll particle state machine.
 *
 * The landing page is not a sequence of sections that fade in; it is ONE
 * particle dataset being continuously re-arranged. Scroll moves a single
 * scalar `s` through seven named states, and every frame the renderer samples
 * that scalar into a small set of weights — at most two states are ever
 * non-zero, so a particle's position is always a blend of two arrangements and
 * can never jump.
 *
 *     0 MACHINE_FORM          the assembled particle machine
 *     1 MACHINE_EXPANDED      structure separates, the volume opens up
 *     2 SIGNAL_FLOW           the field becomes the two sensor streams
 *     3 LEARNED_NORMAL        a dense stable behaviour cloud
 *     4 DEVIATION             the cloud plus what falls outside it
 *     5 INVESTIGATION         evidence streams between the findings
 *     6 MACHINE_RECONSTRUCT   everything returns to the machine
 *
 * Everything here is pure data and pure functions — no React, no Three.js, no
 * GPU — so the choreography can be unit-tested (see `__tests__/particle-states.test.ts`)
 * and reasoned about without a renderer.
 */

export const PARTICLE_STATES = [
  "MACHINE_FORM",
  "MACHINE_EXPANDED",
  "SIGNAL_FLOW",
  "LEARNED_NORMAL",
  "DEVIATION",
  "INVESTIGATION",
  "MACHINE_RECONSTRUCT",
] as const;

export type ParticleStateId = (typeof PARTICLE_STATES)[number];

export const STATE_COUNT = PARTICLE_STATES.length;

/** Which side of the frame the copy column owns in this state. */
export type CopySide = "left" | "right";

export interface StateKeyframe {
  id: ParticleStateId;
  /** Short label for the state rail. */
  label: string;
  /** One-line description shown as floating metadata. */
  note: string;
  /**
   * Layout: offset and scale multipliers applied to the whole scene group.
   * `ox` is signed so the machine can sit opposite the copy column.
   */
  ox: number;
  oy: number;
  scale: number;
  /** Camera distance / height / lateral for this beat of the story. */
  camZ: number;
  camY: number;
  camX: number;
  /** Slow machine rotation, radians. */
  rotY: number;
  rotX: number;
  /**
   * Arrangement weights. These are the per-particle targets the vertex shader
   * blends between; they are normalised on sample, so only their ratios matter.
   */
  machine: number;
  expanded: number;
  stream: number;
  cloud: number;
  deviation: number;
  evidence: number;
  /**
   * Stage multipliers. `sensor` scales the live vibration/acoustic wave
   * displacement, `anomaly` how far the deviation state strains red, `glow`
   * the additive brightness of the whole field.
   */
  sensor: number;
  anomaly: number;
  glow: number;
  /** Copy column side, so text and sculpture never fight. */
  copy: CopySide;
}

const K = (
  id: ParticleStateId,
  label: string,
  note: string,
  rest: Omit<StateKeyframe, "id" | "label" | "note">,
): StateKeyframe => ({ id, label, note, ...rest });

/**
 * The hero framing scale, in world units per object unit.
 *
 * The baked machine is 3.400 x 1.578 (the real GLB's proportions — see
 * `machine-cloud.ts`), and the hero camera sits at z = −5.6 with a 42° field of
 * view, which is 4.3 units of visible height. `HERO_SCALE = 1.6` therefore puts
 * the machine at roughly 59% of the viewport height and 71% of its width on a
 * 16:9 screen — the sculpture is unmistakably the subject, and the copy
 * column on the left still has clear air. Each keyframe's `scale` is a
 * multiplier around this, so the choreography is written in relative terms and
 * holds at any hero framing.
 */
export const HERO_SCALE = 1.6;

/**
 * The seven keyframes.
 *
 * ── Screen orientation ───────────────────────────────────────────────────
 * The camera looks from NEGATIVE Z, which is the same convention the dashboard
 * uses: world +X projects to screen LEFT. That is what puts the motor (and so
 * the blue ADXL345 and its blue vibration energy) on the left of the frame and
 * the pump (orange INMP441, acoustic arcs) on the right, exactly as the
 * reference art direction has it — while still keeping the sensors on the parts
 * they are physically bolted to.
 *
 * Consequently a NEGATIVE `ox` pushes the sculpture toward screen RIGHT. The
 * machine beats therefore use a negative `ox` (copy on the left) and the
 * behaviour beats a positive one (copy on the right).
 */
export const STATE_KEYFRAMES: readonly StateKeyframe[] = [
  K("MACHINE_FORM", "MACHINE FORM", "The assembled machine, learning its own normal.", {
    ox: -0.85,
    oy: -0.03,
    scale: 1,
    camZ: 5.6,
    camY: 0.3,
    camX: -0.2,
    rotY: -0.3,
    rotX: 0.06,
    // the hero is the machine and nothing else: no whisper of another
    // arrangement is allowed to leak onto the opening frame
    machine: 1,
    expanded: 0,
    stream: 0,
    cloud: 0,
    deviation: 0,
    evidence: 0,
    sensor: 0.9,
    anomaly: 0,
    glow: 1,
    copy: "left",
  }),
  K("MACHINE_EXPANDED", "EXPANDED", "The housing opens; mechanical structure becomes readable.", {
    ox: -0.72,
    oy: 0,
    scale: 0.95,
    camZ: 5.35,
    camY: 0.22,
    camX: -0.08,
    rotY: 0.2,
    rotX: -0.22,
    machine: 0.34,
    expanded: 1,
    stream: 0.08,
    cloud: 0.04,
    deviation: 0,
    evidence: 0,
    sensor: 1.15,
    anomaly: 0.05,
    glow: 1.05,
    copy: "left",
  }),
  K("SIGNAL_FLOW", "SIGNAL FLOW", "Two senses, one pipeline: vibration and sound on the wire.", {
    ox: 0,
    oy: -0.08,
    scale: 0.88,
    camZ: 6.1,
    camY: 0.05,
    camX: 0,
    rotY: 0.34,
    rotX: 0,
    machine: 0.05,
    expanded: 0.06,
    stream: 1,
    cloud: 0.05,
    deviation: 0.02,
    evidence: 0.05,
    sensor: 1.3,
    anomaly: 0.08,
    glow: 1.1,
    copy: "left",
  }),
  K("LEARNED_NORMAL", "LEARNED NORMAL", "Healthy running data, and the envelope it defines.", {
    ox: 0.55,
    oy: 0.05,
    scale: 0.95,
    camZ: 5.85,
    camY: 0.1,
    camX: 0.12,
    rotY: 0.12,
    rotX: 0.1,
    machine: 0.04,
    expanded: 0.05,
    stream: 0.16,
    cloud: 1,
    deviation: 0,
    evidence: 0.04,
    sensor: 0.8,
    anomaly: 0,
    glow: 1,
    copy: "right",
  }),
  K("DEVIATION", "DEVIATION", "Behaviour outside the envelope, and the trail that got it there.", {
    ox: 0.4,
    oy: 0.05,
    scale: 0.82,
    camZ: 5.55,
    camY: 0.15,
    camX: 0.2,
    rotY: -0.08,
    rotX: 0.14,
    machine: 0.03,
    expanded: 0.04,
    stream: 0.2,
    cloud: 0.5,
    deviation: 1,
    evidence: 0.06,
    sensor: 1,
    anomaly: 0.85,
    glow: 1.08,
    copy: "right",
  }),
  K("INVESTIGATION", "INVESTIGATION", "Evidence streams: which features moved, and by how much.", {
    ox: 0.28,
    oy: 0,
    scale: 0.86,
    camZ: 5.95,
    camY: 0.0,
    camX: -0.08,
    rotY: 0.26,
    rotX: 0.05,
    machine: 0.03,
    expanded: 0.05,
    stream: 0.42,
    cloud: 0.34,
    deviation: 0.3,
    evidence: 1,
    sensor: 1.1,
    anomaly: 0.5,
    glow: 1.06,
    copy: "right",
  }),
  K(
    "MACHINE_RECONSTRUCT",
    "RECONSTRUCT",
    "It all comes back: the machine, at the end of its own story.",
    {
      ox: -0.8,
      oy: -0.03,
      scale: 1,
      camZ: 5.4,
      camY: 0.28,
      camX: -0.18,
      rotY: 0.42,
      rotX: 0.04,
      // ...and so is the closing beat: the story ends by returning the field
      // fully to the machine, which is what makes it read as a loop
      machine: 1,
      expanded: 0,
      stream: 0,
      cloud: 0,
      deviation: 0,
      evidence: 0,
      sensor: 0.9,
      anomaly: 0,
      glow: 1.05,
      copy: "left",
    },
  ),
];

export interface SampledState {
  /** normalised arrangements */
  machine: number;
  expanded: number;
  stream: number;
  cloud: number;
  deviation: number;
  evidence: number;
  /** layout + camera, already interpolated */
  ox: number;
  oy: number;
  scale: number;
  camZ: number;
  camY: number;
  camX: number;
  rotY: number;
  rotX: number;
  sensor: number;
  anomaly: number;
  glow: number;
  /** index of the state the field is mostly in */
  nearest: number;
  /** label of `nearest` */
  label: string;
  note: string;
  copy: CopySide;
  /** 0..1 distance to the state boundary — how mid-transition we are */
  blend: number;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

const ARRANGEMENT_KEYS = [
  "machine",
  "expanded",
  "stream",
  "cloud",
  "deviation",
  "evidence",
] as const;

/**
 * Each keyframe's arrangement weights, normalised to a distribution.
 *
 * The keyframes express composition as ratios (`machine: 0.34, expanded: 1`),
 * and normalising them up front is what makes a blend a genuine interpolation
 * of two compositions. Interpolating the raw ratios instead and dividing once at
 * the end would quietly scale each arrangement by how much *other* arrangement
 * its keyframe happened to carry, so a mid-transition frame would not match
 * either neighbour.
 */
const KEYFRAME_ARRANGEMENTS: readonly (readonly number[])[] = STATE_KEYFRAMES.map((k) => {
  const raw = ARRANGEMENT_KEYS.map((key) => k[key]);
  const total = raw.reduce((n, v) => n + v, 0);
  return total > 0 ? raw.map((v) => v / total) : raw.map(() => 1 / raw.length);
});

/**
 * Sample the machine at position `s` (0..6, fractional). Uses a tent kernel so
 * each arrangement decays linearly into the next and a state is exactly
 * isolated at integer `s`.
 */
export function sampleParticleState(s: number): SampledState {
  const v = Number.isFinite(s) ? s : 0;
  const x = v < 0 ? 0 : v > STATE_COUNT - 1 ? STATE_COUNT - 1 : v;

  const w: number[] = [];
  let total = 0;
  for (let i = 0; i < STATE_COUNT; i++) {
    const t = Math.max(0, 1 - Math.abs(x - i));
    w.push(t);
    total += t;
  }
  if (total <= 0) {
    w.fill(0);
    w[Math.round(x)] = 1;
    total = 1;
  }

  // arrangements: a blend of two normalised compositions, so the shader's
  // weights always sum to 1 and are a true interpolation, never a rescale
  const arr = [0, 0, 0, 0, 0, 0];
  const mixed = {
    ox: 0,
    oy: 0,
    scale: 0,
    camZ: 0,
    camY: 0,
    camX: 0,
    rotY: 0,
    rotX: 0,
    sensor: 0,
    anomaly: 0,
    glow: 0,
  };

  for (let i = 0; i < STATE_COUNT; i++) {
    const k = STATE_KEYFRAMES[i];
    const n = w[i] / total;
    // scalar framing values interpolate directly: they are real quantities
    mixed.ox += k.ox * n;
    mixed.oy += k.oy * n;
    mixed.scale += k.scale * n;
    mixed.camZ += k.camZ * n;
    mixed.camY += k.camY * n;
    mixed.camX += k.camX * n;
    mixed.rotY += k.rotY * n;
    mixed.rotX += k.rotX * n;
    mixed.sensor += k.sensor * n;
    mixed.anomaly += k.anomaly * n;
    mixed.glow += k.glow * n;
    const own = KEYFRAME_ARRANGEMENTS[i];
    for (let a = 0; a < ARRANGEMENT_KEYS.length; a++) arr[a] += own[a] * n;
  }

  const nearest = Math.round(x);
  const k = STATE_KEYFRAMES[nearest];

  return {
    ...mixed,
    machine: arr[0],
    expanded: arr[1],
    stream: arr[2],
    cloud: arr[3],
    deviation: arr[4],
    evidence: arr[5],
    nearest,
    label: k.label,
    note: k.note,
    copy: k.copy,
    blend: clamp01(Math.abs(x - nearest)),
  };
}

/**
 * Weight the arrangement targets for the vertex shader.
 *
 * The shader takes two `vec4`s — a branch-free weight vector plus a
 * single scalar — where index 0 is "home" and index 1 folds
 * MACHINE_RECONSTRUCT back into the home arrangement (the closing state is the
 * machine again, seen from a different place), so nothing arrives twice.
 */
export function arrangementWeights(st: SampledState): {
  w0: [number, number, number, number];
  w1: [number, number, number, number];
} {
  return {
    // x home · y expanded · z stream · w cloud
    w0: [st.machine, st.expanded, st.stream, st.cloud],
    // x deviation · y evidence · z unused · w unused
    w1: [st.deviation, st.evidence, 0, 0],
  };
}

/**
 * Map a scroll position to the state scalar using the real measured section
 * centres.
 *
 * `centres` are the vertical centres of each story section in the scroll
 * container's content space; `focus` is the point of the viewport we treat as
 * "where the reader is". Piecewise-linear between consecutive centres means a
 * section reads as exactly one state while it is centred, and the transition
 * happens in the gap between two sections — which is precisely where there is
 * no copy to fight with.
 *
 * Outside the first/last centre the value is clamped, so the opening and
 * closing beats hold instead of over-rotating.
 */
export function stateFromSectionCentres(centres: number[], focus: number): number {
  if (centres.length === 0) return 0;
  if (centres.length === 1) return 0;
  if (!Number.isFinite(focus)) return 0;
  if (focus <= centres[0]) return 0;
  const last = centres.length - 1;
  if (focus >= centres[last]) return last;
  for (let i = 0; i < last; i++) {
    const a = centres[i];
    const b = centres[i + 1];
    if (focus >= a && focus <= b) {
      const span = b - a;
      const t = span > 1e-6 ? (focus - a) / span : 0;
      return i + t;
    }
  }
  return last;
}
