/**
 * ParticleUniverse — the EdgeSense particle engine.
 *
 * Two co-located point systems in one canvas, sharing one layout transform, one
 * cursor force field and one camera:
 *
 * 1. THE MACHINE — a dense point cloud sampled from the real GLB surface.
 *    The machine is not a mesh and it is not a picture. `loadMachineCloud()`
 *    loads `public/motor.glb` and `machine-cloud.ts` samples its triangles
 *    (sub-linearly area-weighted, barycentric inside the picked triangle) into
 *    tens of thousands of typed-array particle targets:
 *
 *      GLB → surface samples → THREE.Points targets
 *
 *    Those sampled positions ARE the targets, so the machine you see is
 *    literally the machine geometry. Displacement happens in the vertex shader
 *    as an offset from those positions: a real radial cursor force field, a
 *    scroll-driven dispersion, and an assembly ramp — all pure functions of
 *    the pointer and scroll state, which makes them exactly reversible. Nothing
 *    teleports, nothing dissolves into a flat image, and the particle machine
 *    always springs back onto the GLB-derived positions.
 *
 * 2. THE MARK — the EdgeSense emblem, per-particle CPU integration, so it can
 *    be genuinely shoved around: a cursor push, a scatter, an underdamped
 *    spring return (it overshoots, then settles) and a scroll dispersion that
 *    doubles as the dissolve into the machine.
 *
 *    velocity += (target - position) * spring * dt        spring attraction
 *    velocity *= exp(-damping * dt)                       settle with overshoot
 *    velocity += repulsion(cursorForceField)              you can push it
 *    position += velocity * dt
 *
 * `./emblem` defines the mark as pure geometry (unit-tested, no GPU needed): a
 * vibration-drawn letter E locked inside a motor-core stator ring, fed by a
 * blue vibration ribbon and radiating orange acoustic arcs.
 *
 * Colour follows the reference art direction: cool machine steel in the middle,
 * blue vibration energy bleeding off the pump end, orange acoustic arcs
 * radiating off the motor/fan end, and a dim mirrored reflection of the real
 * silhouette under the base plate.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { OBJ_W, buildEmblem, smoothstep } from "./emblem";
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
  /** 0 = the EdgeSense emblem, 1 = the machine fully emerged. Read per frame. */
  revealRef: React.MutableRefObject<number>;
  /** Live machine state; omit (or null) for a dormant field. */
  stateRef?: React.RefObject<UniverseState | null>;
  /** Login mode: calmer and dimmer. */
  calm?: boolean;
  className?: string;
}

const GLB_URL = "/motor.glb";

const LIGHT_TIER =
  typeof navigator !== "undefined" && (navigator.hardwareConcurrency ?? 8) <= 4;

/** The interactive CPU-integrated mark: modest hardware gets a lighter field. */
const EMBLEM_COUNT = LIGHT_TIER ? 2200 : 4000;

/**
 * The machine point cloud lives entirely on the GPU (the vertex shader does the
 * displacement), so it can be an order of magnitude denser than the CPU field.
 * This is the "tens/hundreds of thousands of particle positions" budget.
 */
const MACHINE_COUNT = LIGHT_TIER ? 60000 : 130000;

/* ------------------------------ the machine ------------------------------- */

let cachedAsset: MachineAsset | null = null;
let cachedCloud: MachineCloud | null = null;

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

/** One cached sample of the GLB, reused by every mount of the field. */
async function loadMachineCloud(count: number): Promise<MachineCloud> {
  if (cachedCloud) return cachedCloud;
  const asset = await loadMachineAsset();
  if (!cachedCloud) cachedCloud = buildMachineCloud(asset, count);
  return cachedCloud;
}

/* ------------------------------- shaders --------------------------------- */

const VERT = /* glsl */ `
attribute float aSize;
attribute float aTint;   // 0 white · 1 blue (ADXL345) · 2 orange (INMP441)
attribute float aLayer;  // 0 background · 1 midground · 2 foreground
attribute vec3  aSeed;

uniform float uTime;
uniform float uEnergy;   // 0 dormant .. 1 machine running hard
uniform float uAnomaly;  // 0..1
uniform float uMachine;  // 0 emblem .. 1 machine assembled
uniform float uCalm;     // 1 normal, <1 for the calm login field
uniform float uPixelScale;

varying float vAlpha;
varying vec3  vColor;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);

  float depthFade = smoothstep(-30.0, -1.5, mv.z);
  float layerAlpha = aLayer < 0.5 ? 0.26 : (aLayer < 1.5 ? 0.72 : 0.34);
  float layerSize  = aLayer < 0.5 ? 0.62 : (aLayer < 1.5 ? 1.0 : 1.85);
  float twinkle = 0.86 + 0.14 * sin(uTime * (0.65 + aSeed.y) + aSeed.z * 32.0);

  // The machine phase melts the mark away: the point-cloud machine is the
  // subject from here on, so the emblem only survives as ambient dust.
  float machineDim = mix(1.0, 0.12, uMachine);

  vAlpha = layerAlpha * depthFade * twinkle * machineDim * uCalm;
  gl_PointSize = aSize * layerSize * uPixelScale * mix(1.0, 0.7, uMachine)
    / max(-mv.z, 0.5);

  vec3 white  = vec3(0.70, 0.78, 0.90);
  vec3 blue   = vec3(0.28, 0.66, 1.00);
  vec3 orange = vec3(1.00, 0.56, 0.22);
  vec3 col = white;
  if (aTint > 1.5) col = orange * mix(0.6, 1.12, uEnergy);
  else if (aTint > 0.5) col = blue * mix(0.6, 1.12, uEnergy);

  // Anomaly: a restrained fraction of the field strains red.
  col = mix(col, vec3(1.0, 0.32, 0.20), uAnomaly * step(0.8, aSeed.y) * 0.8);

  vColor = col;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
varying float vAlpha;
varying vec3  vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.06, d);
  float core = smoothstep(0.18, 0.0, d);
  gl_FragColor = vec4(vColor + core * 0.35, a * vAlpha);
}
`;

/**
 * The machine point cloud. `position` IS the sampled GLB surface position, so
 * every displacement below is an *offset* that naturally collapses back to the
 * real geometry — the machine cannot end up somewhere it never was, and the
 * cursor/scroll state is the only thing that ever moves it.
 */
const MACHINE_VERT = /* glsl */ `
attribute vec3  aScatter;
attribute float aAmp;
attribute float aSize;
attribute float aKind;   // 0 body · 1 floor · 2 blue · 3 orange
attribute vec3  aSeed;

uniform float uTime;
uniform float uEnergy;
uniform float uAnomaly;
uniform float uReveal;       // 0 not yet formed .. 1 assembled on the GLB surface
uniform float uDispersion;   // scroll-driven outward release (reversible)
uniform float uCalm;
uniform float uPixelScale;
uniform float uPointerStrength;
uniform float uPointerRadius;
uniform vec3  uPointer;      // object-space cursor

varying float vAlpha;
varying vec3  vColor;

void main() {
  // ---- the GLB-derived home position ----
  vec3 pos = position;

  // ---- scroll dispersion + assembly: particles hang along their own scatter
  //      direction while the machine is unformed and fly home as reveal -> 1.
  //      Both terms are pure functions of the scroll progress, so scrolling
  //      back up returns every particle to its sampled position. ----
  float away = pow(max(0.0, 1.0 - uReveal), 1.7);
  pos += aScatter * (aAmp * (uDispersion + away * 1.35));

  // ---- cursor force field: a real radial push, not an opacity trick ----
  vec3 d = pos - uPointer;
  d.z *= 0.55;
  float dist = length(d) + 1e-4;
  float f = 1.0 - dist / uPointerRadius;
  if (f > 0.0 && uPointerStrength > 0.0) {
    float gain = 0.45 + aSeed.y * 0.75;      // some particles barely register it
    pos += normalize(d) * (f * f * uPointerStrength * gain * 0.34);
  }

  // ---- running machine: a fine synchronous shimmer over the body ----
  pos += vec3(0.0, sin(uTime * 46.0 + aSeed.x * 24.0), 0.0)
    * uEnergy * 0.004 * (aKind < 0.5 ? 1.0 : 0.35);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);

  // depth shading: the far side of the sampled shell reads darker, which is
  // what makes a hollow point cloud look like a solid volume
  float near = smoothstep(-11.0, -5.5, mv.z);
  float appear = smoothstep(0.04, 0.5, uReveal);
  float base = aKind < 0.5 ? 0.38 : (aKind < 1.5 ? 0.15 : 0.5);
  float depthFade = aKind < 1.5 ? mix(0.4, 1.0, near) : mix(0.72, 1.0, near);
  float twinkle = 0.82 + 0.18 * sin(uTime * (0.8 + aSeed.y * 1.6) + aSeed.z * 40.0);

  vAlpha = base * appear * twinkle * depthFade * uCalm;

  // ---- colour: cool steel in the middle, blue at the pump, orange at the fan ----
  float side = clamp(position.x / 1.4, -1.0, 1.0);
  vec3 steel = vec3(0.60, 0.70, 0.88);
  vec3 bodyCol = side < 0.0
    ? mix(steel, vec3(0.22, 0.60, 1.00), -side * 0.8)
    : mix(steel, vec3(1.00, 0.60, 0.26), side * 0.62);

  vec3 blue = vec3(0.24, 0.62, 1.00);
  vec3 orange = vec3(1.00, 0.55, 0.20);
  vec3 col;
  if (aKind < 0.5) col = bodyCol;
  else if (aKind < 1.5) col = bodyCol * 0.75;
  else if (aKind < 2.5) col = blue;
  else col = orange;

  col *= mix(0.85, 1.3, uEnergy);
  col = mix(col, vec3(1.0, 0.30, 0.18), uAnomaly * step(0.82, aSeed.y) * 0.75);
  vColor = col;

  float kindSize = aKind < 0.5 ? 1.0 : (aKind < 1.5 ? 0.7 : 1.2);
  gl_PointSize = clamp(aSize * kindSize * uPixelScale / max(-mv.z, 0.5), 0.85, 9.0);
  gl_Position = projectionMatrix * mv;
}
`;

const MACHINE_FRAG = /* glsl */ `
varying float vAlpha;
varying vec3  vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.12, d);
  float core = smoothstep(0.17, 0.0, d);
  gl_FragColor = vec4(vColor + core * 0.5, a * vAlpha);
}
`;

function buildMachineGeometry(cloud: MachineCloud): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(cloud.home, 3));
  g.setAttribute("aScatter", new THREE.BufferAttribute(cloud.scatter, 3));
  g.setAttribute("aAmp", new THREE.BufferAttribute(cloud.amp, 1));
  g.setAttribute("aSize", new THREE.BufferAttribute(cloud.size, 1));
  g.setAttribute("aKind", new THREE.BufferAttribute(cloud.kind, 1));
  g.setAttribute("aSeed", new THREE.BufferAttribute(cloud.seed, 3));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), OBJ_W * 1.4);
  return g;
}

/* ------------------------------- the field -------------------------------- */

function ParticleField({
  revealRef,
  stateRef,
  calm,
}: {
  revealRef: React.MutableRefObject<number>;
  stateRef?: React.RefObject<UniverseState | null>;
  calm: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);

  const emblem = useMemo(() => buildEmblem(EMBLEM_COUNT), []);

  /* simulation state — typed arrays, never React state */
  const sim = useMemo(
    () => ({
      pos: new Float32Array(emblem.home),
      vel: new Float32Array(EMBLEM_COUNT * 3),
    }),
    [emblem],
  );

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(sim.pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(emblem.seed, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(emblem.size, 1));
    g.setAttribute("aTint", new THREE.BufferAttribute(emblem.tint, 1));
    g.setAttribute("aLayer", new THREE.BufferAttribute(emblem.layer, 1));
    return g;
  }, [sim, emblem]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uAnomaly: { value: 0 },
      uMachine: { value: 0 },
      uCalm: { value: calm ? 0.55 : 1 },
      uPixelScale: { value: 900 },
    }),
    [calm],
  );

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [uniforms],
  );

  /* --------------------- the point-cloud machine ------------------------- */
  const [cloud, setCloud] = useState<MachineCloud | null>(null);

  useEffect(() => {
    let dead = false;
    loadMachineCloud(MACHINE_COUNT)
      .then((c) => {
        if (!dead) setCloud(c);
      })
      .catch((e) => console.warn("[EdgeSense] machine point cloud unavailable:", e));
    return () => {
      dead = true;
    };
  }, []);

  const machineGeometry = useMemo(
    () => (cloud ? buildMachineGeometry(cloud) : null),
    [cloud],
  );

  const machineUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uAnomaly: { value: 0 },
      uReveal: { value: 0 },
      uDispersion: { value: 0 },
      uCalm: { value: calm ? 0.5 : 1 },
      uPixelScale: { value: 900 },
      uPointerStrength: { value: 0 },
      uPointerRadius: { value: 0.62 },
      uPointer: { value: new THREE.Vector3(999, 999, 0) },
    }),
    [calm],
  );

  const machineMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: machineUniforms,
        vertexShader: MACHINE_VERT,
        fragmentShader: MACHINE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [machineUniforms],
  );

  /* ------------------------- pointer force field ------------------------- */
  const pointer = useRef({
    ndc: new THREE.Vector2(0, 0),
    lastMove: -1e9,
    inside: false,
    /** underdamped so a release visibly springs back */
    spring: { s: 0, v: 0 },
    strength: 0,
    world: new THREE.Vector3(),
    ray: new THREE.Vector3(),
    obj: new THREE.Vector3(999, 999, 0),
    target: new THREE.Vector3(999, 999, 0),
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
    const onLeave = () => {
      p.inside = false;
    };
    // Listen on window: the canvas sits behind `pointer-events-none` layers,
    // so it never receives pointer events itself.
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, []);

  /* ------------------------------ integration ---------------------------- */
  const clock = useRef(0);
  const reveal = useRef(0);
  const layout = useRef({ s: 0.9, ox: 0, oy: 0 });

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const dt = Math.min(0.033, Math.max(0.001, delta));
    clock.current += dt * (calm ? 0.75 : 1);
    const t = clock.current;

    // Scroll progress, eased so the transition reads as momentum.
    reveal.current += (revealRef.current - reveal.current) * Math.min(1, dt * 2.1);
    const p = Math.min(1, Math.max(0, reveal.current));
    // Dispersion peaks in the middle of the scroll: the mark dissolves into
    // data before it reforms as the machine. A pure function of scroll
    // progress, so scrolling back up reverses it exactly.
    const scrollDisp = Math.pow(Math.sin(Math.PI * p), 0.75);
    const assemble = smoothstep(0.22, 0.9, p);

    // ---- responsive layout: the object sits beside the copy when wide ----
    const aspect = state.size.width / Math.max(state.size.height, 1);
    const wide = aspect >= 1.12;
    const sTarget = THREE.MathUtils.clamp(aspect / 1.85, 0.56, 1.02);
    const oxTarget = wide ? 1.42 : 0;
    const oyTarget = wide ? 0 : -0.5;
    const l = layout.current;
    const ease = Math.min(1, dt * 3.5);
    l.s += (sTarget - l.s) * ease;
    l.ox += (oxTarget - l.ox) * ease;
    l.oy += (oyTarget - l.oy) * ease;
    group.position.set(l.ox, l.oy, 0);
    group.scale.setScalar(l.s);

    // ---- machine state (energy / anomaly / calm) ----
    const ms = stateRef?.current ?? null;
    const running =
      !!ms && (ms.power === "ON" || ms.power === "STARTING" || ms.power === "STOPPING");
    const energy = running ? Math.min(1, 0.35 + ms.vibrationRms / 1.6 + ms.rpm / 3200) : 0;
    uniforms.uEnergy.value += (energy - uniforms.uEnergy.value) * Math.min(1, dt * 3);
    const anomaly = running && ms.behaviour === "ANOMALY" ? Math.min(1, ms.fusedAnomalyScore) : 0;
    uniforms.uAnomaly.value += (anomaly - uniforms.uAnomaly.value) * Math.min(1, dt * 2);
    uniforms.uTime.value = t;
    uniforms.uPixelScale.value = state.size.height * state.gl.getPixelRatio() * 0.78;
    uniforms.uMachine.value = assemble;

    // ---- cursor → object space ----
    const pt = pointer.current;
    const cam = state.camera as THREE.PerspectiveCamera;
    const since = (performance.now() - pt.lastMove) / 1000;
    // The field calms on its own: stop moving and the push fades, so the mark
    // springs back together without the cursor having to leave the area.
    const active = pt.inside && since < 0.9 ? Math.max(0, 1 - since / 0.9) : 0;
    // Second-order response: the push overshoots slightly on release, which is
    // what makes the reassembly read as a spring rather than a fade.
    const sp = pt.spring;
    sp.v += (active - sp.s) * 42 * dt;
    sp.v *= Math.exp(-8.2 * dt);
    sp.s += sp.v * dt;
    pt.strength = sp.s;
    if (pt.strength > 0.001) {
      // Cursor → the z = 0 plane the object lives on, then into object space.
      pt.ray.set(pt.ndc.x, pt.ndc.y, 0.5).unproject(cam).sub(cam.position).normalize();
      const tPlane = -cam.position.z / (pt.ray.z === 0 ? -1e-4 : pt.ray.z);
      if (tPlane > 0) {
        pt.world.copy(cam.position).addScaledVector(pt.ray, tPlane);
        pt.target.set((pt.world.x - l.ox) / l.s, (pt.world.y - l.oy) / l.s, pt.world.z / l.s);
      }
    } else {
      pt.target.set(999, 999, 0);
    }
    pt.obj.lerp(pt.target, Math.min(1, dt * 12));

    // ---- drive the machine point cloud (all displacement happens on the GPU) ----
    machineUniforms.uTime.value = t;
    machineUniforms.uEnergy.value = uniforms.uEnergy.value;
    machineUniforms.uAnomaly.value = uniforms.uAnomaly.value;
    machineUniforms.uReveal.value = assemble;
    machineUniforms.uDispersion.value = scrollDisp * 0.42;
    machineUniforms.uPixelScale.value = uniforms.uPixelScale.value;
    machineUniforms.uPointerStrength.value = Math.max(0, pt.strength);
    machineUniforms.uPointer.value.copy(pt.obj);

    // ---- integrate every particle of the mark ----
    const { pos, vel } = sim;
    const { home, scatter, scatterAmp, seed } = emblem;
    const damp = Math.exp(-5.0 * dt);
    const noiseAmp = 0.018 + energy * 0.03;
    const mouseOn = pt.strength > 0.01;
    const MX = pt.obj.x;
    const MY = pt.obj.y;
    const MZ = pt.obj.z;
    const MR = 1.5;
    const MR2 = MR * MR;
    const MOUSE_F = 34;
    const MAXV = 12;
    const MAXV2 = MAXV * MAXV;

    // The mark keeps its own scroll dispersion, and additionally melts into the
    // ambient field as the machine takes over.
    const dispersion = Math.min(1.4, scrollDisp + assemble * 0.6);

    for (let i = 0; i < EMBLEM_COUNT; i++) {
      const i3 = i * 3;
      const sx = seed[i3];
      const sy = seed[i3 + 1];

      const d = dispersion * scatterAmp[i];
      let tx = home[i3] + scatter[i3] * d;
      let ty = home[i3 + 1] + scatter[i3 + 1] * d;
      let tz = home[i3 + 2] + scatter[i3 + 2] * d;

      // ---- subtle life ----
      tx += Math.sin(t * 0.62 + sx * 31.0) * noiseAmp;
      ty += Math.sin(t * 0.71 + sy * 27.0) * noiseAmp;
      tz += Math.sin(t * 0.55 + sx * 19.0) * noiseAmp * 1.4;

      // ---- spring attraction back to the target ----
      let vx = vel[i3] + (tx - pos[i3]) * 34 * dt;
      let vy = vel[i3 + 1] + (ty - pos[i3 + 1]) * 34 * dt;
      let vz = vel[i3 + 2] + (tz - pos[i3 + 2]) * 34 * dt;

      // ---- the cursor force field ----
      if (mouseOn) {
        const dx = pos[i3] - MX;
        const dy = pos[i3 + 1] - MY;
        const dz = (pos[i3 + 2] - MZ) * 0.45;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < MR2) {
          const dist = Math.sqrt(d2) + 1e-4;
          const falloff = 1 - dist / MR;
          // Per-particle sensitivity: some barely register it, some fly.
          const gain = 0.55 + sx * 0.95;
          const f = (falloff * falloff * MOUSE_F * pt.strength * gain * dt) / dist;
          vx += dx * f;
          vy += dy * f;
          vz += dz * f;
        }
      }

      // ---- damping, speed clamp, integrate ----
      vx *= damp;
      vy *= damp;
      vz *= damp;
      const sp2 = vx * vx + vy * vy + vz * vz;
      if (sp2 > MAXV2) {
        const k = MAXV / Math.sqrt(sp2);
        vx *= k;
        vy *= k;
        vz *= k;
      }
      vel[i3] = vx;
      vel[i3 + 1] = vy;
      vel[i3 + 2] = vz;
      pos[i3] += vx * dt;
      pos[i3 + 1] += vy * dt;
      pos[i3 + 2] += vz * dt;
    }

    (geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;

    // ---- cinematic camera: gentle pointer parallax, never a full orbit ----
    const px = pt.inside ? pt.ndc.x : 0;
    const py = pt.inside ? pt.ndc.y : 0;
    cam.position.x += (px * 0.32 - cam.position.x) * Math.min(1, dt * 1.2);
    cam.position.y += (0.35 + py * 0.22 - cam.position.y) * Math.min(1, dt * 1.2);
    cam.lookAt(0, 0, 0);
  });

  return (
    <group ref={groupRef}>
      {/* the machine: a real point cloud sampled from the GLB surface */}
      {machineGeometry && (
        <points
          geometry={machineGeometry}
          material={machineMaterial}
          frustumCulled={false}
        />
      )}
      {/* the mark: per-particle CPU simulation, the interactive layer */}
      <points geometry={geometry} material={material} frustumCulled={false} />
    </group>
  );
}

/* --------------------------------- root ---------------------------------- */

export function ParticleUniverse({
  revealRef,
  stateRef,
  calm = false,
  className,
}: ParticleUniverseProps) {
  return (
    <div className={className} aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0.35, 7.6], fov: 42 }}
        dpr={[1, 1.6]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[3, 4, 3]} intensity={1.15} color="#e6ebf2" />
        <directionalLight position={[-3, 1, -2]} intensity={0.35} color="#ccd6e0" />
        <ParticleField revealRef={revealRef} stateRef={stateRef} calm={calm} />
      </Canvas>
    </div>
  );
}
