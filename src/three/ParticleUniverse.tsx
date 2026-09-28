/**
 * ParticleUniverse — the EdgeSense particle engine.
 *
 * ── What is actually simulated ────────────────────────────────────────────
 * One BufferGeometry, one ShaderMaterial and a per-particle CPU integrator.
 * Every particle owns a position, a velocity, a target, a tint, a depth layer
 * and a seed, so the field is genuinely pushed around instead of being
 * imitated inside a vertex shader:
 *
 *   target = mix(emblemTarget, machineTarget, morph)     scroll: emblem → machine
 *          + scatter * dispersion                        scroll: dissolve outward
 *          + noise                                       always: subtle life
 *
 *   velocity += (target - position) * spring * dt        spring attraction
 *   velocity *= exp(-damping * dt)                       settle with overshoot
 *   velocity += repulsion(cursorForceField)              you can push it
 *   position += velocity * dt
 *
 * So the mark scatters under the cursor, decays, springs back, overshoots
 * slightly and reforms as the exact EdgeSense emblem — no teleporting, no
 * opacity tricks, no static PNG.
 *
 * ── The mark ─────────────────────────────────────────────────────────────
 * `./emblem` defines the brand mark as pure geometry (unit-tested, no GPU
 * needed): a vibration-drawn letter E locked inside a motor-core stator ring,
 * fed by a blue vibration ribbon and radiating orange acoustic arcs.
 *
 * ── The machine ──────────────────────────────────────────────────────────
 * As scroll progress completes, the same particles abandon the emblem and
 * settle onto the real GLB surface. Density and brightness fall over the
 * transition and the field splits into background / midground / foreground
 * layers, so the machine — not the effect — is what you look at.
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { SENSOR_ANCHORS } from "./sensor-anchors";
import { BLUE_SHARE, OBJ_W, ORANGE_SHARE, buildEmblem, rnd, smoothstep } from "./emblem";

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

/** Adaptive budget — modest hardware gets a lighter field. */
const COUNT =
  typeof navigator !== "undefined" && (navigator.hardwareConcurrency ?? 8) <= 4
    ? 2200
    : 4000;

/* ------------------------------ the machine ------------------------------- */

interface MachineAsset {
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
  adxl: [number, number, number];
  inmp: [number, number, number];
}

let cachedAsset: MachineAsset | null = null;

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

  // Bake the machine into the same object space as the emblem: centred, and
  // normalised to the same width, so one layout transform frames both.
  const geometry = mesh.geometry.clone();
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox as THREE.Box3;
  const center = bb.getCenter(new THREE.Vector3());
  const size = bb.getSize(new THREE.Vector3());
  const k = OBJ_W / Math.max(size.x, 1e-4);
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(k, k, k);
  geometry.computeVertexNormals();

  const bake = (a: readonly number[]): [number, number, number] => [
    (a[0] - center.x) * k,
    (a[1] - center.y) * k,
    (a[2] - center.z) * k,
  ];

  cachedAsset = {
    geometry,
    positions: (geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array,
    adxl: bake(SENSOR_ANCHORS.ADXL345),
    inmp: bake(SENSOR_ANCHORS.INMP441),
  };
  return cachedAsset;
}

/** Machine-side targets: surface for the body, tight clusters for the sensors. */
function buildShellTargets(asset: MachineAsset, count: number, layer: Float32Array): Float32Array {
  const targets = new Float32Array(count * 3);
  const verts = asset.positions.length / 3;
  const blueEnd = Math.round(count * BLUE_SHARE);
  const orangeEnd = blueEnd + Math.round(count * ORANGE_SHARE);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const h = rnd(i, 11);
    const h2 = rnd(i, 12);
    if (i < blueEnd) {
      // blue particles gather on the real ADXL345 mount
      targets[i3] = asset.adxl[0] + (h - 0.5) * 0.34;
      targets[i3 + 1] = asset.adxl[1] + (h2 - 0.5) * 0.24;
      targets[i3 + 2] = asset.adxl[2] + (rnd(i, 13) - 0.5) * 0.34;
    } else if (i < orangeEnd) {
      targets[i3] = asset.inmp[0] + (h - 0.5) * 0.36;
      targets[i3 + 1] = asset.inmp[1] + (h2 - 0.5) * 0.26 + 0.12;
      targets[i3 + 2] = asset.inmp[2] + (rnd(i, 13) - 0.5) * 0.36;
    } else {
      const vi = Math.floor(h * verts);
      targets[i3] = asset.positions[vi * 3] + (h2 - 0.5) * 0.03;
      targets[i3 + 1] = asset.positions[vi * 3 + 1] + (rnd(i, 13) - 0.5) * 0.03;
      targets[i3 + 2] = asset.positions[vi * 3 + 2] + (rnd(i, 14) - 0.5) * 0.03;
    }
  }

  // Depth hierarchy. The machine must dominate, so most of the field falls
  // behind it as dim dust and only a handful of particles come forward.
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    if (layer[i] === 0) {
      targets[i3] *= 1.7;
      targets[i3 + 1] = targets[i3 + 1] * 1.7 + 0.35;
      targets[i3 + 2] -= 4.2;
    } else if (layer[i] === 2) {
      targets[i3] *= 1.32;
      targets[i3 + 1] *= 1.32;
      targets[i3 + 2] += 2.4;
    }
  }
  return targets;
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

  // The machine phase dims and shrinks the whole field: it supports the
  // machine, it never competes with it.
  float machineDim = mix(1.0, 0.48, uMachine);

  vAlpha = layerAlpha * depthFade * twinkle * machineDim * uCalm;
  gl_PointSize = aSize * layerSize * uPixelScale * mix(1.0, 0.82, uMachine)
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
  const pointsRef = useRef<THREE.Points>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  const emblem = useMemo(() => buildEmblem(COUNT), []);

  /* simulation state — typed arrays, never React state */
  const sim = useMemo(() => {
    const pos: Float32Array = new Float32Array(emblem.home); // starts assembled
    const vel: Float32Array = new Float32Array(COUNT * 3);
    const shell: Float32Array = new Float32Array(emblem.home); // replaced once the GLB lands
    return { pos, vel, shell };
  }, [emblem]);

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

  const machineMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#8d9aa9"),
        metalness: 0.55,
        roughness: 0.48,
        transparent: true,
        opacity: 0,
      }),
    [],
  );

  /* -------------------------- load the machine --------------------------- */
  useEffect(() => {
    let dead = false;
    loadMachineAsset()
      .then((asset) => {
        if (dead) return;
        sim.shell = buildShellTargets(asset, COUNT, emblem.layer);
        if (meshRef.current) meshRef.current.geometry = asset.geometry;
      })
      .catch((e) => console.warn("[EdgeSense] machine targets unavailable:", e));
    return () => {
      dead = true;
    };
  }, [sim, emblem]);

  /* ------------------------- pointer force field ------------------------- */
  const pointer = useRef({
    ndc: new THREE.Vector2(0, 0),
    lastMove: -1e9,
    inside: false,
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
    const dispersion = Math.pow(Math.sin(Math.PI * p), 0.75);

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

    // ---- cursor → object space ----
    const pt = pointer.current;
    const cam = state.camera as THREE.PerspectiveCamera;
    const since = (performance.now() - pt.lastMove) / 1000;
    // The field calms on its own: stop moving and the push fades, so the mark
    // springs back together without the cursor having to leave the area.
    const active = pt.inside && since < 0.9 ? Math.max(0, 1 - since / 0.9) : 0;
    pt.strength += (active - pt.strength) * Math.min(1, dt * 4);
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

    // ---- integrate every particle ----
    const { pos, vel, shell } = sim;
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

    let morphSum = 0;

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      const sx = seed[i3];
      const sy = seed[i3 + 1];

      // Staggered morph: the assembly sweeps across the body.
      const m = smoothstep(0.3 + sx * 0.26, 0.74 + sy * 0.24, p);
      morphSum += m;

      const hx = home[i3];
      const hy = home[i3 + 1];
      const hz = home[i3 + 2];

      // ---- target: emblem → machine, displaced outward by scroll ----
      const d = dispersion * scatterAmp[i];
      let tx = hx + (shell[i3] - hx) * m + scatter[i3] * d;
      let ty = hy + (shell[i3 + 1] - hy) * m + scatter[i3 + 1] * d;
      let tz = hz + (shell[i3 + 2] - hz) * m + scatter[i3 + 2] * d;

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

    uniforms.uMachine.value += (morphSum / COUNT - uniforms.uMachine.value) * Math.min(1, dt * 2);
    (geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;

    // ---- the machine emerges from the same field ----
    const mesh = meshRef.current;
    if (mesh) {
      const targetOpacity = THREE.MathUtils.clamp((p - 0.42) / 0.5, 0, 1);
      machineMaterial.opacity += (targetOpacity - machineMaterial.opacity) * Math.min(1, dt * 1.8);
      mesh.visible = machineMaterial.opacity > 0.01;
      machineMaterial.emissive.setRGB(0, 0, running ? 0.035 : 0);
    }

    // ---- cinematic camera: gentle pointer parallax, never a full orbit ----
    const px = pt.inside ? pt.ndc.x : 0;
    const py = pt.inside ? pt.ndc.y : 0;
    cam.position.x += (px * 0.32 - cam.position.x) * Math.min(1, dt * 1.2);
    cam.position.y += (0.35 + py * 0.22 - cam.position.y) * Math.min(1, dt * 1.2);
    cam.lookAt(0, 0, 0);
  });

  return (
    <group ref={groupRef}>
      <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />
      {/* dispose={null}: this geometry is the module-cached machine asset,
          shared by whichever page is showing the field — it must survive
          unmount so the next mount does not rebuild a 14 MB GLB. */}
      <mesh
        ref={meshRef}
        material={machineMaterial}
        visible={false}
        frustumCulled={false}
        dispose={null}
      />
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
