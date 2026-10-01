/**
 * ParticleUniverse — the EdgeSense particle engine.
 *
 * The particle system IS the identity of this page, so it is built as a small
 * renderer rather than as a background effect. Everything below lives in one
 * canvas and shares one camera, one cursor force field and one scroll scalar:
 *
 *  LAYER 3–2  `Backdrop`   an inside-out sphere: a vertical deep-space gradient
 *                          with a few procedural blue clouds and a floor glow.
 *                          Cloud layers painted from thousands of enormous soft
 *                          sprites are pure fill-rate, so they are shader maths
 *                          here instead of geometry.
 *  LAYER 4–7  `SpaceField` distant stars, mid-depth drifting particles on an
 *                          orbital flow, and close soft bokeh — one point system
 *                          where each particle carries its own parallax factor,
 *                          so a single pointer offset moves every layer by a
 *                          different amount and the depth is real.
 *  LAYER 6    `MachineField` the machine itself: hundreds of thousands of points
 *                          sampled off the GLB surface, moved entirely on the
 *                          GPU.
 *  LAYER 7    `SparkField` a small near-field of dust that only exists to be
 *                          shoved by the cursor, plus a lagged copy of it that
 *                          renders as a motion wake.
 *
 * ── The machine ────────────────────────────────────────────────────────────
 * `loadMachineCloud()` loads `public/motor.glb` and `machine-cloud.ts` samples
 * its triangles (sub-linearly area-weighted, barycentric inside the picked
 * triangle). Those sampled positions ARE the particles, so the machine you see
 * is literally the machine geometry — no mesh with particles around it, no billboard,
 * no pre-render. Displacement is always an *offset* from that position, which is
 * what makes the whole thing reversible: release the cursor, scroll back up,
 * return from an anomaly, and every particle lands back on the surface it came
 * from.
 *
 * ── One scalar drives the story ─────────────────────────────────────────────
 * `storyRef` carries a single number, 0..6, sampled from the real scroll
 * position of the story sections. `particle-states.ts` turns it into two weight
 * vectors, and the vertex shader blends six arrangements — the machine, an
 * expanded machine, the two signal streams, the learned-normal volume and the
 * evidence streams — with them. Nothing is created or destroyed: all six
 * arrangements exist in the same typed arrays from the first frame.
 *
 * ── Numbers you may want to tune ───────────────────────────────────────────
 * Particle counts and the bloom/bloom-off decision come from
 * `particle-quality.ts`; per-state framing from `particle-states.ts`; sizes and
 * alphas from the constants at the top of this file.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import * as THREE from "three";
import {
  arrangementWeights,
  HERO_SCALE,
  sampleParticleState,
  STATE_KEYFRAMES,
  type SampledState,
} from "./particle-states";
import {
  createFpsWatchdog,
  detectQualityTier,
  downgradeTier,
  prefersReducedMotion,
  qualityBudget,
  type QualityBudget,
  type QualityTier,
} from "./particle-quality";
import { buildSpaceField } from "./space-field";
import {
  bakeMachineGeometry,
  buildMachineCloud,
  type MachineAsset,
  type MachineCloud,
} from "./machine-cloud";

export interface UniverseState {
  power: string;
  rpm: number;
  vibrationRms: number;
  acousticLevel: number;
  fusedAnomalyScore: number;
  behaviour: string;
}

export interface ParticleUniverseProps {
  /** 0 = particles still scattered, 1 = fully assembled. Defaults to 1. */
  revealRef?: React.MutableRefObject<number>;
  /** Scroll-driven particle state machine position, 0..6. Defaults to 0. */
  storyRef?: React.RefObject<number>;
  /** Live machine state; omit (or null) for a dormant field. */
  stateRef?: React.RefObject<UniverseState | null>;
  /** Calmer, dimmer field (the auth screen). */
  calm?: boolean;
  className?: string;
  /** Fired once the machine geometry exists and a frame has been drawn. */
  onReady?: () => void;
  /** Reports what the field actually resolved to, for the HUD / QA. */
  onStats?: (stats: { machine: number; space: number; tier: QualityTier; bloom: boolean }) => void;
}

const GLB_URL = "/motor.glb";

/** Additive point brightness. Deliberately restrained: 100k+ additive points
 *  saturate fast, and over-exposing is a hard failure. */
const BODY_ALPHA = 0.16;
const FLOOR_ALPHA = 0.06;
const ENERGY_ALPHA = 0.28;
const NODE_ALPHA = 0.85;
const FLARE_ALPHA = 0.06;

/** How far the cursor shoves the machine, in object units. */
const MACHINE_PUSH = 0.42;
const MACHINE_POINTER_RADIUS = 0.66;
/** The near-field dust is shoved much harder — it is the tactile layer. */
const SPARK_PUSH = 1.05;
const SPARK_POINTER_RADIUS = 2.5;
/** How long a pointer sample stays "live" after the last move. */
const POINTER_LIFE = 0.85;
/** Wake lag: how far back the trailing copy samples the cursor. */
const WAKE_LAG = 0.17;

/* ------------------------------ the machine ------------------------------ */

let cachedAsset: MachineAsset | null = null;
const cloudCache = new Map<number, MachineCloud>();

function firstMesh(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh;
  });
  return found;
}

async function loadMachineAsset(): Promise<MachineAsset> {
  if (cachedAsset) return cachedAsset;
  const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) =>
    new GLTFLoader().load(GLB_URL, resolve as never, undefined, reject),
  );
  const mesh = firstMesh(gltf.scene);
  if (!mesh) throw new Error("no mesh in machine GLB");
  cachedAsset = bakeMachineGeometry(mesh.geometry);
  return cachedAsset;
}

/**
 * One cached sample of the GLB, reused by every mount at the same budget. The
 * build is ~100 ms at desktop density, so it must never happen per navigation.
 */
async function loadMachineCloud(count: number): Promise<MachineCloud> {
  const hit = cloudCache.get(count);
  if (hit) return hit;
  const asset = await loadMachineAsset();
  const cloud = buildMachineCloud(asset, count);
  cloudCache.set(count, cloud);
  return cloud;
}

/* ------------------------------- shaders --------------------------------- */

const BACKDROP_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Layers 1–3: near-black base, deep navy gradient, a few very faint blue
 * clouds, and a floor glow under the machine. All procedural, all in the
 * fragment shader, so it costs one full-screen pass and nothing else.
 */
const BACKDROP_FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uAccent;

float cloud(vec3 dir, vec3 c, float tight) {
  return pow(max(dot(dir, c), 0.0), tight);
}

void main() {
  vec3 dir = normalize(vDir);

  // layer 1 → 2: the void darkens downward, never fully to black at the top
  vec3 base = mix(
    vec3(0.0055, 0.0075, 0.0185),
    vec3(0.0135, 0.0215, 0.0520),
    smoothstep(-0.55, 0.75, dir.y)
  );
  // a cooler cast toward the machine's blue end
  base += uAccent * 0.055 * smoothstep(-0.2, 1.0, dir.x);

  // layer 3: three faint blue clouds, well off the machine so they stay weather
  float c1 = cloud(dir, normalize(vec3(0.55, 0.22, -0.80)), 7.0);
  float c2 = cloud(dir, normalize(vec3(-0.75, -0.10, -0.62)), 11.0);
  float c3 = cloud(dir, normalize(vec3(-0.15, 0.62, 0.75)), 14.0);
  vec3 nebulae = vec3(0.040, 0.075, 0.150) * c1
               + vec3(0.028, 0.052, 0.110) * c2
               + vec3(0.020, 0.034, 0.076) * c3;

  // the floor: a wide, very dim pool of light the machine appears to sit in
  float floorGlow = pow(max(0.0, 1.0 - abs(dir.y * 4.6)), 2.6);
  vec3 floorCol = vec3(0.030, 0.058, 0.095) * floorGlow;

  // and a shallow horizon band so the bottom of the frame never looks broken
  float horizon = pow(max(0.0, 1.0 - abs(dir.y * 2.2)), 5.0);
  vec3 col = base + nebulae + floorCol + vec3(0.012, 0.022, 0.038) * horizon;

  gl_FragColor = vec4(col, 1.0);
}
`;

const SPACE_VERT = /* glsl */ `
attribute float aSize;
attribute float aKind;      // 0 star · 1 drift · 2 foreground
attribute vec3  aSeed;
attribute vec3  aFlow;
attribute float aFlowAmp;
attribute float aParallax;

uniform float uTime;
uniform float uPixelScale;
uniform vec2  uParallax;    // pointer offset, already in world units
uniform float uGlow;

varying float vAlpha;
varying vec3  vColor;

void main() {
  vec3 pos = position;

  // a slow looping excursion along the local flow field: the field drifts and
  // curves rather than jitters, and neighbouring particles move together
  float w = sin(uTime * 0.06 + aSeed.x * 6.2831);
  pos += aFlow * w * aFlowAmp * mix(0.15, 1.1, step(0.5, aKind));

  // parallax: the closer the layer, the further it moves with the cursor
  pos.xy += uParallax * aParallax;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);

  // only a subset shimmers; a field where everything flickers reads as noise
  float twinkle = 1.0;
  if (aSeed.z > 0.62) {
    twinkle = 0.66 + 0.34 * sin(uTime * (0.35 + aSeed.y * 0.75) + aSeed.z * 43.0);
  }

  float base = aKind < 0.5 ? 0.34 : (aKind < 1.5 ? 0.17 : 0.045);
  vAlpha = base * twinkle * uGlow;

  // Cool and dim on purpose: the background must never compete with the
  // machine, and white is an accent rather than a default.
  vec3 star   = vec3(0.62, 0.74, 0.98);
  vec3 drift  = vec3(0.26, 0.50, 0.78);
  vec3 fore   = vec3(0.40, 0.58, 0.86);
  vColor = aKind < 0.5 ? star : (aKind < 1.5 ? drift : fore);

  gl_PointSize = clamp(aSize * uPixelScale / max(-mv.z, 0.6), 0.7, 64.0);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * The machine. `position` IS the sampled GLB surface position, so every
 * displacement below is an offset that collapses back onto the real geometry.
 *
 * Six arrangements are blended with two weight vectors:
 *   home (the machine) · expanded · stream · cloud · deviation · evidence
 * MACHINE_RECONSTRUCT folds back into `home` in the engine, so the closing state
 * is the machine again — seen from somewhere else — rather than a seventh cloud.
 */
const MACHINE_VERT = /* glsl */ `
attribute vec3  aScatter;
attribute float aAmp;
attribute float aSize;
attribute float aKind;   // 0 body · 1 floor · 2 blue · 3 orange · 4 blueNode
                         // 5 orangeNode · 6 blueFlare · 7 orangeFlare
attribute vec3  aSeed;
attribute vec3  aStream;
attribute vec3  aCloud;

uniform float uTime;
uniform float uEnergy;      // machine liveness 0..1
uniform float uAnomaly;     // 0..1
uniform float uReveal;      // 0 scattered .. 1 assembled
uniform vec4  uW0;          // home · expanded · stream · cloud
uniform vec4  uW1;          // deviation · evidence · - · -
uniform float uCalm;
uniform float uPixelScale;
uniform float uGlow;
uniform float uPointerStrength;
uniform float uPointerRadius;
uniform vec3  uPointer;
uniform vec4  uClick;       // xyz + age (seconds)
uniform float uBlue;        // live ADXL345 vibration magnitude 0..1
uniform float uOrange;      // live INMP441 acoustic magnitude 0..1
uniform vec3  uBlueAnchor;
uniform vec3  uOrangeAnchor;
uniform float uSensorGain;

varying float vAlpha;
varying vec3  vColor;

void main() {
  /* ---------------------------- arrangements --------------------------- */
  vec3 pHome  = position;
  vec3 pExp   = position * 1.62 + aScatter * aAmp * 0.9;
  vec3 pStr   = aStream;
  vec3 pCloud = aCloud;
  vec3 devDir = normalize(vec3(aSeed.x - 0.5, aSeed.y - 0.5, aSeed.z - 0.5) + 1e-3);
  vec3 pDev   = aCloud + devDir * (0.5 + aSeed.x * 1.15);
  vec3 pEvid  = mix(aStream, aCloud, aSeed.y);

  vec3 pos = pHome  * uW0.x
           + pExp   * uW0.y
           + pStr   * uW0.z
           + pCloud * uW0.w
           + pDev   * uW1.x
           + pEvid  * uW1.y;

  /* ------------------------- assembly ramp (§19) ------------------------ */
  // scattered → drifting → accelerating home; a pure function of uReveal, so
  // it is exactly reversible and the machine can never end up off-surface
  float away = (1.0 - uReveal) * (1.35 + aSeed.z * 2.6) * aAmp;
  pos += aScatter * away;

  /* -------------------- perpetual micro-motion (§9) --------------------- */
  // Even with the motor off the sculpture must not be frozen. A bounded
  // sinusoidal drift (never accumulating, so the surface is preserved) keeps
  // it alive, and it grows with uEnergy so a running machine breathes harder.
  float driftAmp = 0.0055 + 0.0045 * aSeed.y;
  pos += vec3(
    sin(uTime * 1.05 + aSeed.x * 29.0),
    sin(uTime * 0.87 + aSeed.y * 23.0),
    sin(uTime * 1.27 + aSeed.z * 17.0)
  ) * driftAmp * (1.0 + uEnergy * 2.2);

  /* ------------------- cursor force field (§21–25) --------------------- */
  // a real radial push with per-particle sensitivity, not an opacity trick
  vec3 d = pos - uPointer;
  d.z *= 0.55;
  float dist = length(d) + 1e-4;
  float f = 1.0 - dist / uPointerRadius;
  if (f > 0.0 && uPointerStrength > 0.0) {
    float gain = 0.45 + aSeed.y * 0.85;
    pos += normalize(d) * (f * f * uPointerStrength * gain * ${MACHINE_PUSH.toFixed(3)});
  }

  /* ---------------------- click impulse (§24) -------------------------- */
  if (uClick.w < 1.6) {
    vec3 cd = pos - uClick.xyz;
    cd.z *= 0.6;
    float cdist = length(cd) + 1e-4;
    float cf = 1.0 - cdist / 2.4;
    if (cf > 0.0) {
      pos += normalize(cd)
           * (cf * cf * exp(-uClick.w * 2.6) * 0.95 * (0.5 + aSeed.z));
    }
  }

  /* ------------------ sensor physics (§33–36, §46) --------------------- */
  // Displacement is proportional to the LIVE values, so with the motor off
  // there is nothing to see: no fabricated motion.
  vec3 bd = pos - uBlueAnchor;
  float bdist = length(bd) + 1e-4;
  float bw = exp(-bdist * bdist * 2.1) * uBlue * uSensorGain;
  pos += normalize(bd) * bw * (0.34 * sin(uTime * 3.1 - bdist * 7.5) + 0.16);

  vec3 od = pos - uOrangeAnchor;
  float odist = length(od) + 1e-4;
  float ow = exp(-odist * odist * 2.3) * uOrange * uSensorGain;
  pos += normalize(od) * ow * (0.30 * sin(uTime * 2.3 - odist * 5.6) + 0.14);

  // the energy systems themselves travel outward as waves
  if (aKind > 1.5 && aKind < 3.5) {
    bool isBlue = aKind < 2.5;
    float amp = isBlue ? uBlue : uOrange;
    vec3 hub = isBlue ? uBlueAnchor : uOrangeAnchor;
    float r = length(pos.xy - hub.xy);
    float phase = uTime * (isBlue ? 4.2 : 3.2) - r * 11.0;
    vec3 wdir = normalize(vec3(pos.xy - hub.xy, 0.0) + 1e-4);
    pos += wdir * (sin(phase) * amp * (1.0 - smoothstep(0.15, 2.3, r)) * 0.14);
    pos.z += sin(phase * 0.7 + aSeed.x * 6.0) * amp * 0.1;
  }

  /* -------------------- running machine + anomaly ----------------------- */
  // a fine synchronous shimmer over the body while it turns
  pos.y += sin(uTime * 46.0 + aSeed.x * 24.0) * uEnergy * 0.007 * step(aKind, 0.5);

  // anomaly is LOCAL and restrained: a minority of particles strain outward,
  // and they strain irregularly rather than uniformly
  pos += devDir * uAnomaly * step(0.72, aSeed.y)
       * (0.09 + 0.06 * sin(uTime * 11.0 + aSeed.x * 26.0));

  /* ------------------------------- output ------------------------------ */
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);

  // depth shading tuned to the actual hero framing: the machine is only ~1.5
  // units deep and the camera sits ~5.5 away, so the range has to be tight or
  // the far side of the shell reads at the same brightness as the near side and
  // the sculpture goes flat
  float near = smoothstep(-7.0, -4.55, mv.z);
  float appear = smoothstep(0.02, 0.32, uReveal);
  float depthFade = mix(0.28, 1.0, near);

  float base = aKind < 0.5 ? ${BODY_ALPHA.toFixed(3)}
             : aKind < 1.5 ? ${FLOOR_ALPHA.toFixed(3)}
             : aKind < 2.5 ? ${ENERGY_ALPHA.toFixed(3)} + uBlue * 0.5
             : aKind < 3.5 ? ${ENERGY_ALPHA.toFixed(3)} + uOrange * 0.5
             : aKind < 4.5 ? ${NODE_ALPHA.toFixed(3)} + uBlue * 0.4
             : aKind < 5.5 ? ${NODE_ALPHA.toFixed(3)} + uOrange * 0.4
             : ${FLARE_ALPHA.toFixed(3)};

  float twinkle = 0.86 + 0.14 * sin(uTime * (0.7 + aSeed.y * 1.4) + aSeed.z * 40.0);
  vAlpha = base * appear * twinkle * depthFade * uCalm * uGlow;

  /* colour: cool steel in the middle, the blue sensor toward the motor end
     (+X, screen left) and the orange sensor toward the pump end, always keyed
     off the HOME position so colour does not swim as particles move */
  float side = clamp(position.x / 1.35, -1.0, 1.0);
  // The structural base is a DEEP blue-steel, not white: the palette is
  // carried by electric blue/cyan and amber, with white kept as an accent.
  vec3 steel  = vec3(0.17, 0.30, 0.55);
  vec3 blueE  = vec3(0.12, 0.50, 1.00);
  vec3 orangeE = vec3(1.00, 0.50, 0.16);
  vec3 bodyCol = side > 0.0
    ? mix(steel, blueE, side * 0.55)
    : mix(steel, orangeE, -side * 0.45);

  vec3 col;
  if (aKind < 0.5)       col = bodyCol;
  else if (aKind < 1.5)  col = bodyCol * 0.72;
  else if (aKind < 2.5)  col = blueE   * (0.72 + uBlue * 0.55);
  else if (aKind < 3.5)  col = orangeE * (0.72 + uOrange * 0.55);
  else if (aKind < 4.5)  col = blueE   * 1.45;
  else if (aKind < 5.5)  col = orangeE * 1.45;
  else if (aKind < 6.5)  col = blueE   * 0.55;
  else                   col = orangeE * 0.55;

  col = mix(col, vec3(1.0, 0.30, 0.17), uAnomaly * step(0.8, aSeed.y) * 0.75);
  vColor = col;

  float kindSize = aKind < 0.5 ? 1.0
                 : aKind < 1.5 ? 0.75
                 : aKind < 3.5 ? 1.15
                 : aKind < 5.5 ? 1.6
                 : 3.2;
  // "tiny 1px dots" is a hard failure, so the floor on a visible point is
  // explicit: everything stays a soft, luminous, readable point at any depth
  gl_PointSize = clamp(aSize * kindSize * uPixelScale / max(-mv.z, 0.6), 1.8, 48.0);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * Soft circular point sprite with a bright core. Square points are a hard
 * failure, so the falloff is a smooth radius and the core is added on top:
 * a luminous physical point, brighter where the particle is closer.
 */
const PARTICLE_FRAG = /* glsl */ `
varying float vAlpha;
varying vec3  vColor;
uniform float uCore;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.08, d);
  float core = smoothstep(0.2, 0.0, d);
  vec3 col = vColor + vColor * core * uCore;
  gl_FragColor = vec4(col, a * vAlpha);
}
`;

const SPACE_FRAG = PARTICLE_FRAG;

/** The near-field dust: same particle language, much stronger response. */
const SPARK_VERT = /* glsl */ `
attribute float aSize;
attribute vec3  aSeed;
attribute vec3  aFlow;
attribute float aFlowAmp;
attribute float aParallax;

uniform float uTime;
uniform float uPixelScale;
uniform float uGlow;
uniform vec2  uParallaxOffset;
uniform float uPointerStrength;
uniform float uPointerRadius;
uniform vec3  uPointer;
uniform vec4  uClick;
uniform float uWake;        // 0 = leading copy, 1 = trailing copy

varying float vAlpha;
varying vec3  vColor;

void main() {
  vec3 pos = position;

  float w = sin(uTime * 0.11 + aSeed.x * 6.2831);
  pos += aFlow * w * aFlowAmp * 0.85;

  // the cursor shoves this layer hard, and the trailing copy samples a lagged
  // cursor position, so a fast swipe leaves a physical wake behind it
  vec3 d = pos - uPointer;
  d.z *= 0.55;
  float dist = length(d) + 1e-4;
  float f = 1.0 - dist / uPointerRadius;
  if (f > 0.0 && uPointerStrength > 0.0) {
    pos += normalize(d) * (f * f * uPointerStrength * (0.65 + aSeed.y * 1.1)
           * ${SPARK_PUSH.toFixed(3)});
  }

  if (uClick.w < 1.6) {
    vec3 cd = pos - uClick.xyz;
    cd.z *= 0.6;
    float cdist = length(cd) + 1e-4;
    float cf = 1.0 - cdist / 3.2;
    if (cf > 0.0) {
      pos += normalize(cd) * (cf * cf * exp(-uClick.w * 2.2) * 1.7);
    }
  }

  pos.xy += uParallaxOffset * (0.5 + aParallax);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);

  float twinkle = 0.8 + 0.2 * sin(uTime * (0.6 + aSeed.z * 1.2) + aSeed.y * 31.0);
  vAlpha = mix(0.30, 0.10, uWake) * twinkle * uGlow;
  vColor = mix(vec3(0.55, 0.74, 0.95), vec3(0.30, 0.52, 0.80), uWake);

  gl_PointSize = clamp(aSize * mix(1.0, 0.78, uWake) * uPixelScale
                 / max(-mv.z, 0.6), 1.0, 30.0);
  gl_Position = projectionMatrix * mv;
}
`;

/* --------------------------- geometry builders --------------------------- */

function buildMachineGeometry(cloud: MachineCloud): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(cloud.home, 3));
  g.setAttribute("aScatter", new THREE.BufferAttribute(cloud.scatter, 3));
  g.setAttribute("aAmp", new THREE.BufferAttribute(cloud.amp, 1));
  g.setAttribute("aSize", new THREE.BufferAttribute(cloud.size, 1));
  g.setAttribute("aKind", new THREE.BufferAttribute(cloud.kind, 1));
  g.setAttribute("aSeed", new THREE.BufferAttribute(cloud.seed, 3));
  g.setAttribute("aStream", new THREE.BufferAttribute(cloud.stream, 3));
  g.setAttribute("aCloud", new THREE.BufferAttribute(cloud.cloud, 3));
  // The field is displaced far outside the sampled bounds, so culling it by a
  // bounding sphere would pop it out of view mid-scatter.
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);
  return g;
}

function buildSpaceGeometry(count: number): THREE.BufferGeometry {
  const f = buildSpaceField(count);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(f.home, 3));
  g.setAttribute("aKind", new THREE.BufferAttribute(f.kind, 1));
  g.setAttribute("aSize", new THREE.BufferAttribute(f.size, 1));
  g.setAttribute("aSeed", new THREE.BufferAttribute(f.seed, 3));
  g.setAttribute("aFlow", new THREE.BufferAttribute(f.flow, 3));
  g.setAttribute("aFlowAmp", new THREE.BufferAttribute(f.flowAmp, 1));
  g.setAttribute("aParallax", new THREE.BufferAttribute(f.parallax, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 160);
  return g;
}

/* ------------------------------- backdrop -------------------------------- */

function Backdrop() {
  const uniforms = useMemo(
    () => ({ uAccent: { value: new THREE.Color(0.22, 0.62, 1.0) } }),
    [],
  );
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: BACKDROP_VERT,
        fragmentShader: BACKDROP_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
      }),
    [uniforms],
  );
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh material={material} frustumCulled={false} renderOrder={-10} scale={140}>
      <sphereGeometry args={[1, 32, 24]} />
    </mesh>
  );
}

/* --------------------------------- space --------------------------------- */

function SpaceLayer({
  count,
  material,
}: {
  count: number;
  material: THREE.ShaderMaterial;
}) {
  const geometry = useMemo(() => buildSpaceGeometry(count), [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

function useSpaceMaterial(reducedMotion: boolean) {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelScale: { value: 1000 },
      uParallax: { value: new THREE.Vector2() },
      uGlow: { value: 1 },
      uCore: { value: 0.22 },
    }),
    [],
  );
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: SPACE_VERT,
        fragmentShader: SPACE_FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    [uniforms],
  );
  useEffect(() => () => material.dispose(), [material]);
  // the field keeps drifting either way; reduced motion only slows it down
  useEffect(() => {
    if (reducedMotion) uniforms.uGlow.value = 0.85;
  }, [reducedMotion, uniforms]);
  return material;
}

/* ------------------------------ spark field ------------------------------ */

function buildSparkGeometry(count: number): THREE.BufferGeometry {
  const home = new Float32Array(count * 3);
  const seed = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const flow = new Float32Array(count * 3);
  const flowAmp = new Float32Array(count);
  const parallax = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const a = (i * 2.399963) % (Math.PI * 2);
    const r = 2.3 + ((i * 0.6180339) % 1) * 3.4;
    home[i3] = Math.cos(a) * r;
    home[i3 + 1] = Math.sin(a) * r * 0.55;
    // in front of the machine means negative Z with this camera
    home[i3 + 2] = -2.2 + ((i * 0.7548776) % 1) * 3.6;
    seed[i3] = (i * 0.3171) % 1;
    seed[i3 + 1] = (i * 0.7193) % 1;
    seed[i3 + 2] = (i * 0.1337) % 1;
    size[i] = 0.016 + ((i * 0.5241) % 1) ** 2 * 0.042;
    const fr = Math.hypot(home[i3], home[i3 + 1]) || 1;
    flow[i3] = -home[i3 + 1] / fr;
    flow[i3 + 1] = home[i3] / fr;
    flow[i3 + 2] = (((i * 0.9137) % 1) - 0.5) * 0.6;
    flowAmp[i] = 0.4 + ((i * 0.2711) % 1) * 1.2;
    parallax[i] = 0.5 + ((i * 0.4111) % 1) * 0.5;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(home, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  g.setAttribute("aFlow", new THREE.BufferAttribute(flow, 3));
  g.setAttribute("aFlowAmp", new THREE.BufferAttribute(flowAmp, 1));
  g.setAttribute("aParallax", new THREE.BufferAttribute(parallax, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);
  return g;
}

/* --------------------------- the whole universe -------------------------- */

interface PointerSample {
  x: number;
  y: number;
  z: number;
  t: number;
}

/**
 * Universe — everything that must live INSIDE the canvas.
 *
 * `useFrame` and `useThree` only work within react-three-fiber's context, so
 * this component is mounted as a child of `<Canvas>` rather than around it. It
 * owns the geometry, the materials, the pointer listeners and the animation
 * loop; the canvas element, the quality budget and the WebGL capability probe
 * live one level up (see `ParticleUniverse`). Getting that boundary wrong is
 * what produces "Hooks can only be used within the Canvas component".
 */
interface UniverseProps {
  budget: QualityBudget;
  revealRef?: React.MutableRefObject<number>;
  storyRef?: React.RefObject<number>;
  stateRef?: React.RefObject<UniverseState | null>;
  calm: boolean;
  onReady?: () => void;
  onStats?: (stats: {
    machine: number;
    space: number;
    tier: QualityTier;
    bloom: boolean;
  }) => void;
  /** The loop reporting sustained slowness: shed bloom and pixel ratio. */
  onDegraded: () => void;
  /** The bloom pass itself failed: drop a whole quality tier. */
  onBloomUnavailable: () => void;
}

function Universe({
  budget,
  revealRef,
  storyRef,
  stateRef,
  calm = false,
  onReady,
  onStats,
  onDegraded,
  onBloomUnavailable,
}: UniverseProps) {
  const reducedMotion = budget.reducedMotion;

  useEffect(() => {
    onStats?.({
      machine: budget.machine,
      space: budget.space,
      tier: budget.tier,
      bloom: budget.bloom,
    });
  }, [budget, onStats]);

  const machineRef = useRef<THREE.Group>(null);

  /* ------------------------ machine point cloud ------------------------ */
  const [cloud, setCloud] = useState<MachineCloud | null>(null);
  const [cloudError, setCloudError] = useState(false);

  useEffect(() => {
    let dead = false;
    loadMachineCloud(budget.machine)
      .then((c) => {
        if (dead) return;
        setCloud(c);
        onReady?.();
      })
      .catch((e) => {
        console.warn("[EdgeSense] machine point cloud unavailable:", e);
        if (dead) return;
        setCloudError(true);
        // the loading state must never be a permanent screen: report ready and
        // let the fallback stand in
        onReady?.();
      });
    return () => {
      dead = true;
    };
  }, [budget.machine, onReady]);

  const machineGeometry = useMemo(() => (cloud ? buildMachineGeometry(cloud) : null), [cloud]);
  useEffect(() => () => machineGeometry?.dispose(), [machineGeometry]);

  const machineUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uAnomaly: { value: 0 },
      uReveal: { value: 0 },
      uW0: { value: new THREE.Vector4(1, 0, 0, 0) },
      uW1: { value: new THREE.Vector4(0, 0, 0, 0) },
      uCalm: { value: calm ? 0.55 : 1 },
      uPixelScale: { value: 1000 },
      uGlow: { value: 1 },
      uPointerStrength: { value: 0 },
      uPointerRadius: { value: MACHINE_POINTER_RADIUS },
      uPointer: { value: new THREE.Vector3(999, 999, 0) },
      uClick: { value: new THREE.Vector4(999, 999, 0, 99) },
      uBlue: { value: 0 },
      uOrange: { value: 0 },
      uBlueAnchor: { value: new THREE.Vector3() },
      uOrangeAnchor: { value: new THREE.Vector3() },
      uSensorGain: { value: reducedMotion ? 0.5 : 1 },
      uCore: { value: 0.3 },
    }),
    [calm, reducedMotion],
  );

  useEffect(() => {
    if (!cloud) return;
    machineUniforms.uBlueAnchor.value.fromArray(cloud.anchors.blue);
    machineUniforms.uOrangeAnchor.value.fromArray(cloud.anchors.orange);
  }, [cloud, machineUniforms]);

  /* ------------------------- spark / wake layer ------------------------ */
  const sparkGeometry = useMemo(() => buildSparkGeometry(budget.interaction), [budget.interaction]);
  useEffect(() => () => sparkGeometry.dispose(), [sparkGeometry]);

  const sparkUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelScale: { value: 1000 },
      uGlow: { value: calm ? 0.6 : 1 },
      uParallaxOffset: { value: new THREE.Vector2() },
      uPointerStrength: { value: 0 },
      uPointerRadius: { value: SPARK_POINTER_RADIUS },
      uPointer: { value: new THREE.Vector3(999, 999, 0) },
      uClick: { value: new THREE.Vector4(999, 999, 0, 99) },
      uWake: { value: 0 },
      uCore: { value: 0.28 },
    }),
    [calm],
  );
  const wakeUniforms = useMemo(
    () => ({ ...sparkUniforms, uWake: { value: 1 } }),
    [sparkUniforms],
  );

  const makeMaterial = useCallback(
    (uniforms: Record<string, THREE.IUniform>, vertex: string, frag: string) =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: vertex,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  /* the space material is built here so the frame loop has a handle on it */
  const spaceMaterial = useSpaceMaterial(reducedMotion);

  const sparkMaterial = useMemo(
    () => makeMaterial(sparkUniforms, SPARK_VERT, PARTICLE_FRAG),
    [makeMaterial, sparkUniforms],
  );
  const wakeMaterial = useMemo(
    () => makeMaterial(wakeUniforms, SPARK_VERT, PARTICLE_FRAG),
    [makeMaterial, wakeUniforms],
  );
  useEffect(
    () => () => {
      sparkMaterial.dispose();
      wakeMaterial.dispose();
    },
    [sparkMaterial, wakeMaterial],
  );

  const machineMaterial = useMemo(
    () => makeMaterial(machineUniforms, MACHINE_VERT, PARTICLE_FRAG),
    [makeMaterial, machineUniforms],
  );
  useEffect(() => () => machineMaterial.dispose(), [machineMaterial]);

  /* --------------------------- pointer state --------------------------- */
  const spaceUniforms = spaceMaterial.uniforms;

  const pointer = useRef({
    ndc: new THREE.Vector2(0, 0),
    lastMove: -1e9,
    inside: false,
    /** underdamped: a release visibly overshoots, then settles */
    spring: { s: 0, v: 0 },
    strength: 0,
    world: new THREE.Vector3(),
    ray: new THREE.Vector3(),
    /** cursor in the machine's object space */
    obj: new THREE.Vector3(999, 999, 0),
    objTarget: new THREE.Vector3(999, 999, 0),
    /** cursor in world space, for the near-field dust */
    spark: new THREE.Vector3(999, 999, 0),
    history: [] as PointerSample[],
    /** lagged sample used for the wake */
    wake: new THREE.Vector3(999, 999, 0),
    click: new THREE.Vector4(999, 999, 0, 99),
  });

  useEffect(() => {
    const p = pointer.current;
    const onMove = (e: PointerEvent) => {
      p.ndc.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -((e.clientY / window.innerHeight) * 2) + 1,
      );
      p.lastMove = performance.now();
      p.inside = true;
    };
    const onDown = (e: PointerEvent) => {
      onMove(e);
      // click impulse: scatter briefly, then let the machine reassemble
      p.click.set(p.spark.x, p.spark.y, p.spark.z, 0);
    };
    const onLeave = () => {
      p.inside = false;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, []);

  /* ---------------------------- integration ---------------------------- */
  const clock = useRef(0);
  const reveal = useRef(0);
  const story = useRef(0);
  const camLook = useRef(new THREE.Vector3());
  const watchdog = useRef(createFpsWatchdog());
  useFrame((state, delta) => {
    const machineGroup = machineRef.current;
    if (!machineGroup) return;

    const dt = Math.min(0.033, Math.max(0.001, delta));

    /* ---------------- runtime quality watchdog (§49) ------------------ */
    if (state.clock.elapsedTime > 3 && watchdog.current(delta * 1000)) {
      console.warn("[EdgeSense] sustained slow frames — dropping bloom and pixel ratio");
      onDegraded();
    }

    clock.current += dt * (calm ? 0.7 : 1);
    const t = clock.current;

    /* -------------------- the story scalar (§37/38/55) ---------------- */
    // eased, so the field has momentum: stop scrolling and it settles
    const storyTarget = Math.min(
      STATE_KEYFRAMES.length - 1,
      Math.max(0, storyRef?.current ?? 0),
    );
    story.current += (storyTarget - story.current) * Math.min(1, dt * 4.2);
    const st: SampledState = sampleParticleState(story.current);

    /* --------------------------- assembly ---------------------------- */
    const revealTarget = revealRef ? revealRef.current : 1;
    reveal.current += (revealTarget - reveal.current) * Math.min(1, dt * 2.4);
    const assembled = Math.min(1, Math.max(0, reveal.current));

    /* --------------------------- layout ------------------------------ */
    const aspect = state.size.width / Math.max(state.size.height, 1);
    const wide = aspect >= 1.05;
    const fit = wide
      ? THREE.MathUtils.clamp(aspect / 1.78, 0.6, 1)
      : THREE.MathUtils.clamp(aspect / 1.4, 0.3, 0.62);
    const sTarget = HERO_SCALE * st.scale * fit;
    // portrait cannot put a 2.15:1 machine beside a column of copy, so the
    // sculpture moves to the upper third and the copy takes the lower half
    const oxTarget = wide ? st.ox * fit : 0;
    const oyTarget = wide ? st.oy : 0.95;
    const ease = Math.min(1, dt * 2.6);
    machineGroup.scale.setScalar(
      machineGroup.scale.x + (sTarget - machineGroup.scale.x) * ease,
    );
    machineGroup.position.x += (oxTarget - machineGroup.position.x) * ease;
    machineGroup.position.y += (oyTarget - machineGroup.position.y) * ease;
    machineGroup.rotation.y += (st.rotY - machineGroup.rotation.y) * Math.min(1, dt * 1.5);
    machineGroup.rotation.x += (st.rotX - machineGroup.rotation.x) * Math.min(1, dt * 1.5);
    machineGroup.updateMatrixWorld();

    /* ----------------------- machine state → field ------------------- */
    const ms = stateRef?.current ?? null;
    const running =
      !!ms && (ms.power === "ON" || ms.power === "STARTING" || ms.power === "STOPPING");
    const energy = running
      ? Math.min(1, 0.32 + ms.vibrationRms / 1.6 + ms.rpm / 3200)
      : 0;
    machineUniforms.uEnergy.value +=
      (energy - machineUniforms.uEnergy.value) * Math.min(1, dt * 3);

    const anomaly =
      running && ms.behaviour === "ANOMALY"
        ? Math.min(1, 0.35 + ms.fusedAnomalyScore * 0.9)
        : 0;
    machineUniforms.uAnomaly.value +=
      (anomaly - machineUniforms.uAnomaly.value) * Math.min(1, dt * 2);

    // Live sensor magnitudes. Both are the actual simulated values, normalised
    // over their real operating range — nothing here invents motion.
    const blue = running ? THREE.MathUtils.clamp(ms.vibrationRms / 1.5, 0, 1) : 0;
    const orange = running ? THREE.MathUtils.clamp((ms.acousticLevel - 40) / 50, 0, 1) : 0;
    const sensorEase = Math.min(1, dt * 3.5);
    machineUniforms.uBlue.value += (blue - machineUniforms.uBlue.value) * sensorEase;
    machineUniforms.uOrange.value += (orange - machineUniforms.uOrange.value) * sensorEase;

    /* --------------------- pointer → force fields -------------------- */
    const pt = pointer.current;
    const cam = state.camera as THREE.PerspectiveCamera;
    const since = (performance.now() - pt.lastMove) / 1000;
    const active = pt.inside && since < POINTER_LIFE ? Math.max(0, 1 - since / POINTER_LIFE) : 0;

    const sp = pt.spring;
    sp.v += (active - sp.s) * 42 * dt;
    sp.v *= Math.exp(-8.2 * dt);
    sp.s += sp.v * dt;
    pt.strength = sp.s;

    // cursor on the z = 0 plane the scene lives on
    pt.ray.set(pt.ndc.x, pt.ndc.y, 0.5).unproject(cam).sub(cam.position).normalize();
    const tPlane = -cam.position.z / (pt.ray.z === 0 ? -1e-4 : pt.ray.z);
    if (tPlane > 0) {
      pt.world.copy(cam.position).addScaledVector(pt.ray, tPlane);
      if (pt.spark.x > 500) pt.spark.copy(pt.world);
      else pt.spark.lerp(pt.world, Math.min(1, dt * 16));
    }

    // object space, so the machine's own offset/scale/rotation is undone
    pt.objTarget.copy(pt.spark);
    machineGroup.worldToLocal(pt.objTarget);
    pt.obj.lerp(pt.objTarget, Math.min(1, dt * 12));

    // pointer history: powers the wake, and the click impulse's origin
    const now = performance.now() / 1000;
    if (pt.inside && since < 0.2) {
      pt.history.push({ x: pt.spark.x, y: pt.spark.y, z: pt.spark.z, t: now });
      if (pt.history.length > 32) pt.history.shift();
    }
    // find the sample from ~WAKE_LAG ago
    let best: PointerSample | null = null;
    for (let i = pt.history.length - 1; i >= 0; i--) {
      const s = pt.history[i];
      if (now - s.t >= WAKE_LAG) {
        best = s;
        break;
      }
    }
    if (best) pt.wake.set(best.x, best.y, best.z);
    else pt.wake.copy(pt.spark);

    if (pt.click.w < 3) pt.click.w += dt;

    /* --------------------- drive the machine field ------------------- */
    const w = arrangementWeights(st);
    machineUniforms.uW0.value.set(w.w0[0], w.w0[1], w.w0[2], w.w0[3]);
    machineUniforms.uW1.value.set(w.w1[0], w.w1[1], w.w1[2], w.w1[3]);
    machineUniforms.uTime.value = t;
    machineUniforms.uReveal.value = assembled;
    machineUniforms.uGlow.value = st.glow;
    machineUniforms.uSensorGain.value = st.sensor * (reducedMotion ? 0.5 : 1);
    // point sizes are authored in CSS-pixel-ish units at unit depth, so the
    // field looks the same on a 1080p panel and on a HiDPI laptop
    const pixelScale = state.size.height * state.gl.getPixelRatio() * 1.0;
    machineUniforms.uPixelScale.value = pixelScale;
    machineUniforms.uPointerStrength.value = Math.max(0, pt.strength) * budget.force;
    machineUniforms.uPointer.value.copy(pt.obj);
    machineUniforms.uClick.value.set(pt.click.x, pt.click.y, pt.click.z, pt.click.w);

    /* ------------------------- space + sparks ------------------------ */
    spaceUniforms.uTime.value = t;
    spaceUniforms.uPixelScale.value = pixelScale;
    // screen-right is −X with this camera, so the parallax is mirrored with it
    (spaceUniforms.uParallax.value as THREE.Vector2).set(
      -(pt.inside ? pt.ndc.x : 0) * 1.5 * budget.camera,
      (pt.inside ? pt.ndc.y : 0) * 0.9 * budget.camera,
    );
    for (const u of [sparkUniforms, wakeUniforms]) {
      u.uTime.value = t;
      u.uPixelScale.value = pixelScale;
      (u.uParallaxOffset.value as THREE.Vector2).set(
        -(pt.inside ? pt.ndc.x : 0) * 2.4 * budget.camera,
        (pt.inside ? pt.ndc.y : 0) * 1.5 * budget.camera,
      );
      u.uPointerStrength.value = Math.max(0, pt.strength) * budget.force;
      u.uClick.value.set(pt.click.x, pt.click.y, pt.click.z, pt.click.w);
    }
    sparkUniforms.uPointer.value.copy(pt.spark);
    wakeUniforms.uPointer.value.copy(pt.wake);

    /* ------------------------ cinematic camera ----------------------- */
    // slow push-in while the particles assemble, then stable hero framing;
    // pointer parallax only, never an orbit
    const push = (1 - assembled) * 1.8;
    const pxc = pt.inside ? pt.ndc.x : 0;
    const pyc = pt.inside ? pt.ndc.y : 0;
    // the camera looks from NEGATIVE Z (motor toward screen left), so a cursor
    // moving right must move the camera toward screen-right, which is −X
    const camX = st.camX - pxc * 0.42 * budget.camera;
    const camY = st.camY + push * 0.35 + pyc * 0.26 * budget.camera;
    const camZ = -(st.camZ + push);
    const camEase = Math.min(1, dt * 1.8);
    cam.position.x += (camX - cam.position.x) * camEase;
    cam.position.y += (camY - cam.position.y) * camEase;
    cam.position.z += (camZ - cam.position.z) * camEase;
    camLook.current.lerp(machineGroup.position, Math.min(1, dt * 2.2));
    cam.lookAt(camLook.current);
  });

  return (
    <>
      <Backdrop />
      <SpaceLayer count={budget.space} material={spaceMaterial} />
      {/* the machine lives in its own group: the state machine moves this,
          never the particles */}
      <group ref={machineRef}>
        {machineGeometry && (
          <points
            geometry={machineGeometry}
            material={machineMaterial}
            frustumCulled={false}
          />
        )}
      </group>
      {/* the tactile near-field, plus its lagged copy: the motion wake */}
      <points geometry={sparkGeometry} material={wakeMaterial} frustumCulled={false} />
      <points geometry={sparkGeometry} material={sparkMaterial} frustumCulled={false} />
      {cloudError && <FallbackNote />}
      <PostFX
        enabled={budget.bloom}
        strength={budget.bloomStrength}
        onUnavailable={onBloomUnavailable}
      />
    </>
  );
}

/** GLB-less fallback: still EdgeSense, never a blank page. */
function FallbackNote() {
  return (
    <group>
      <mesh position={[0.9, 0, 0]}>
        <icosahedronGeometry args={[1.15, 2]} />
        <meshBasicMaterial color="#1b3a5c" wireframe transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

/* ------------------------------- post FX --------------------------------- */

/**
 * Real bloom, from three's own post-processing passes — no extra dependency.
 *
 * This component takes over the render loop: once any `useFrame` subscriber
 * asks for a positive priority, react-three-fiber stops auto-rendering and the
 * composer becomes responsible for every frame. That is the intended way to run
 * a composer inside r3f, and it keeps the effect inside this canvas instead of
 * wrapping the app.
 *
 * The bloom threshold is deliberately high: only the bright cores of particles
 * bloom, which is what makes individual points stay legible while the field
 * around them glows. Over-exposing is a hard failure, so strength is modest and
 * the pass is dropped entirely on the low tier.
 */
function PostFX({
  enabled,
  strength,
  onUnavailable,
}: {
  enabled: boolean;
  strength: number;
  onUnavailable: () => void;
}) {
  const { gl, scene, camera, size } = useThree();

  const composer = useMemo(() => {
    if (!enabled) return null;
    try {
      const pixelRatio = gl.getPixelRatio();
      const c = new EffectComposer(gl);
      c.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(size.width * pixelRatio, size.height * pixelRatio),
        strength,
        // a tight radius and a HIGH threshold: only the bright particle cores
        // bloom, so individual points stay legible instead of blowing out
        0.45,
        0.82,
      );
      c.addPass(bloom);
      c.addPass(new OutputPass());
      return c;
    } catch (e) {
      console.warn("[EdgeSense] bloom unavailable, rendering directly:", e);
      return null;
    }
    // size/strength are read once at construction; resizing is handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, enabled]);

  /* Report a failure from an EFFECT, never from inside the memo: telling the
   * parent to change tiers while this component is still rendering is a
   * setState-during-render of a different component, which React rejects. */
  const onUnavailableRef = useRef(onUnavailable);
  const reported = useRef(false);
  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);
  const failed = enabled && composer === null;
  useEffect(() => {
    if (!failed || reported.current) return;
    reported.current = true;
    onUnavailableRef.current();
  }, [failed]);

  useEffect(() => {
    if (!composer) return;
    const pixelRatio = gl.getPixelRatio();
    // EffectComposer works in device pixels, r3f reports CSS pixels
    composer.setSize(size.width * pixelRatio, size.height * pixelRatio);
  }, [composer, gl, size.width, size.height]);

  useEffect(() => () => composer?.dispose(), [composer]);

  // Registering ANY positive-priority subscriber turns off react-three-fiber's
  // own render loop, so this callback owns every frame — including the frames
  // where there is no composer (the low tier, or a bloom failure). Without the
  // direct `gl.render` branch the canvas would be left holding a cleared buffer.
  useFrame(() => {
    if (composer) composer.render();
    else gl.render(scene, camera);
  }, 1);

  return null;
}

/* --------------------------------- root ---------------------------------- */

/**
 * Is this browser actually able to give us a WebGL context? Asked once, before
 * the canvas mounts, because react-three-fiber cannot recover from a failed
 * context and a blank page is not an acceptable answer on an old browser.
 */
function supportsWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Graceful static representation for a browser without WebGL. It is deliberately
 * honest rather than a fake of the real thing: the deep-space layers and a
 * dim steel/blue/orange machine silhouette, so the page still reads as EdgeSense
 * and still explains itself through the copy, with a plain note about what is
 * missing. The machine is not simulated here in any way.
 */
function StaticFallback({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <div className="absolute inset-0 bg-[#02030a]" />
      <div className="absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_58%,rgba(56,189,248,0.10),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(55%_40%_at_72%_46%,rgba(251,146,60,0.07),transparent_72%)]" />
      {/* the machine, as a static silhouette: motor (blue end, screen left),
          coupling, pump (orange end) on a lit base plate */}
      <div className="absolute left-1/2 top-1/2 h-[34%] w-[58%] -translate-x-1/2 -translate-y-1/2">
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-[radial-gradient(closest-side,rgba(56,189,248,0.4),transparent)]" />
        <div className="absolute bottom-[6%] left-[4%] h-[58%] w-[38%] rounded-sm border border-sky-400/25 bg-gradient-to-r from-sky-400/15 to-transparent shadow-[0_0_60px_rgba(56,189,248,0.18)]" />
        <div className="absolute bottom-[6%] left-[43%] h-[26%] w-[10%] rounded-sm border border-white/10 bg-white/5" />
        <div className="absolute bottom-[6%] right-[4%] h-[48%] w-[42%] rounded-sm border border-orange-400/25 bg-gradient-to-l from-orange-400/15 to-transparent shadow-[0_0_60px_rgba(251,146,60,0.16)]" />
      </div>
      <p className="absolute inset-x-0 bottom-[8%] text-center text-[10px] tracking-[0.24em] text-muted-foreground/50">
        PARTICLE FIELD UNAVAILABLE — THIS BROWSER HAS NO WEBGL.
        <br />
        THE MACHINE INTELLIGENCE BELOW IS UNAFFECTED.
      </p>
    </div>
  );
}

export function ParticleUniverse({
  revealRef,
  storyRef,
  stateRef,
  calm = false,
  className,
  onReady,
  onStats,
}: ParticleUniverseProps) {
  // `onStats` and `onReady` are kept in refs so the engine's effects never
  // re-run because a parent re-rendered — the stable callbacks below are what
  // actually cross the boundary, and they never change identity.
  const onStatsRef = useRef(onStats);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onStatsRef.current = onStats;
    onReadyRef.current = onReady;
  }, [onStats, onReady]);
  const [webgl] = useState(supportsWebGL);

  useEffect(() => {
    // never leave a caller (or a loading screen) waiting on a canvas that will
    // not exist
    if (!webgl) onReadyRef.current?.();
  }, [webgl]);

  const stableStats = useCallback(
    (s: { machine: number; space: number; tier: QualityTier; bloom: boolean }) =>
      onStatsRef.current?.(s),
    [],
  );
  const stableReady = useCallback(() => onReadyRef.current?.(), []);

  /* ---------------------------- quality tier ---------------------------- */
  /* decided once, then can only ever step down */
  const initialTier = useMemo<QualityTier>(() => detectQualityTier(), []);
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);
  const [tier, setTier] = useState<QualityTier>(initialTier);
  const [degraded, setDegraded] = useState(false);
  const budget = useMemo<QualityBudget>(() => {
    const b = qualityBudget(tier, reducedMotion);
    // a runtime downgrade keeps the density but drops the expensive extras
    return degraded ? { ...b, bloom: false, dpr: [1, 1.15] } : b;
  }, [tier, reducedMotion, degraded]);

  /** The animation loop reporting sustained slowness. */
  const handleDegraded = useCallback(() => setDegraded(true), []);

  /** Bloom could not be created at all: step the budget down a tier, which
   *  reduces density as well as dropping bloom. */
  const handleBloomUnavailable = useCallback(() => setTier((prev) => downgradeTier(prev)), []);

  if (!webgl) return <StaticFallback className={className} />;

  return (
    <div className={className} aria-hidden="true">
      <Canvas
        camera={{ position: [-0.2, 1.6, -8.0], fov: 42, near: 0.1, far: 400 }}
        dpr={budget.dpr}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: "high-performance",
          // ACES rolls off the highlights, which is what stops 100k+ additive
          // particles from blowing out to flat white
          toneMapping: THREE.ACESFilmicToneMapping,
          // dark, deep, high-contrast: exposure is pulled DOWN, never up
          toneMappingExposure: 0.82,
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 1);
        }}
        style={{ background: "#02030a" }}
      >
        <Universe
          budget={budget}
          revealRef={revealRef}
          storyRef={storyRef}
          stateRef={stateRef}
          calm={calm}
          onReady={stableReady}
          onStats={stableStats}
          onDegraded={handleDegraded}
          onBloomUnavailable={handleBloomUnavailable}
        />
      </Canvas>
    </div>
  );
}
