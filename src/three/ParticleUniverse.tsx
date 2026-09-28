/**
 * ParticleUniverse — the EdgeSense immersive environment.
 *
 * Thousands of luminous data particles drift through a near-black volume with
 * layered procedural motion (drift + turbulence + orbital swirl), react to the
 * cursor with a soft depth-aware repulsion, and — driven by a single `reveal`
 * value — gradually abandon their drift and assemble around the REAL EdgeSense
 * machine as it fades in from the data field.
 *
 * Everything runs in one BufferGeometry + one ShaderMaterial (two draw calls
 * total: particles + machine). No per-particle React anything.
 *
 * Machine state (via an optional ref) drives the field:
 *  - OFF: calm, mostly white/neutral particles.
 *  - RUNNING: blue (ADXL345) and orange (INMP441) particles energise and
 *    tighten onto their real sensor anchors.
 *  - ANOMALY: turbulence amplitude rises and a restrained red strain bleeds
 *    into a fraction of the field. Never the whole page.
 */
import { useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { SENSOR_ANCHORS } from "./sensor-anchors";

export interface UniverseState {
  power: string;
  rpm: number;
  vibrationRms: number;
  acousticLevel: number;
  fusedAnomalyScore: number;
  behaviour: string;
}

export interface ParticleUniverseProps {
  /** 0 = free data field, 1 = machine fully emerged. Updated via ref, no re-renders. */
  revealRef: React.MutableRefObject<number>;
  /** Live machine state; omit (or null) for a calm, dormant field. */
  stateRef?: React.RefObject<UniverseState | null>;
  /** Login mode: dimmer, calmer field. */
  calm?: boolean;
  className?: string;
}

const GLB_URL = "/motor.glb";
const MACHINE_SCALE = 2.15;

/** Adaptive budget: modest hardware gets a lighter field. */
const COUNT =
  typeof navigator !== "undefined" && (navigator.hardwareConcurrency ?? 8) <= 4
    ? 3200
    : 7000;

/* ----------------------------- shaders ---------------------------------- */

const VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aSeed;   // three independent randoms 0..1
attribute vec3 aTarget; // machine-surface position (model space, pre-scaled)
attribute float aTint;  // 0 white · 1 blue (ADXL345) · 2 orange (INMP441)

uniform float uTime;
uniform float uReveal;    // 0..1 morph progress
uniform float uEnergy;    // 0 dormant .. 1 machine running hard
uniform float uAnomaly;   // 0..1
uniform vec3  uMouse;     // cursor in world space (z≈0 plane)

varying float vAlpha;
varying vec3  vColor;

void main() {
  float t = uTime;

  // ---- layered organic drift (no textures, no lookups) ----
  vec3 p = position;
  p += (0.38 + uEnergy * 0.35) * vec3(
    sin(t * 0.11 + aSeed.x * 6.2832),
    sin(t * 0.13 + aSeed.y * 6.2832),
    sin(t * 0.09 + aSeed.z * 6.2832));
  p += (0.10 + uAnomaly * 0.30) * vec3(
    sin(t * (0.31 + uAnomaly * 0.9) + aSeed.y * 12.0),
    cos(t * 0.27 + aSeed.z * 12.0),
    sin(t * 0.29 + aSeed.x * 12.0));

  // slow orbital swirl of the whole field
  float ang = 0.06 * sin(t * 0.05 + aSeed.x * 3.0);
  p.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p.xz;

  // ---- cursor: soft depth-aware repulsion ----
  vec3 d = p - uMouse;
  float dist = length(d);
  float push = smoothstep(1.4, 0.0, dist) * 0.38;
  p += (d / max(dist, 0.001)) * push;

  // ---- morph onto the machine ----
  // staggered per particle so the assembly sweeps across the body
  float k = smoothstep(0.0, 1.0, clamp(uReveal * 1.7 - aSeed.x * 0.7, 0.0, 1.0));
  vec3 tp = aTarget + (0.012 + uEnergy * 0.02) * vec3(
    sin(t * 2.1 + aSeed.x * 20.0),
    sin(t * 2.4 + aSeed.y * 20.0),
    sin(t * 1.8 + aSeed.z * 20.0));
  p = mix(p, tp, k);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * (280.0 / -mv.z);
  gl_Position = projectionMatrix * mv;

  // depth fade + gentle twinkle
  float twinkle = 0.75 + 0.25 * sin(t * (0.6 + aSeed.y) + aSeed.z * 40.0);
  vAlpha = twinkle * smoothstep(-16.0, -2.5, mv.z) * (0.35 + 0.65 * aSeed.z);

  // ---- colour: restrained palette ----
  vec3 white  = vec3(0.62, 0.70, 0.80);
  vec3 blue   = vec3(0.30, 0.68, 1.00);
  vec3 orange = vec3(1.00, 0.58, 0.24);
  vec3 col = white;
  if (aTint > 1.5) col = orange;
  else if (aTint > 0.5) col = blue;

  // sensor colours brighten only when their modality is live
  float vib = uEnergy;
  float acou = uEnergy;
  if (aTint > 0.5 && aTint < 1.5) col *= (0.35 + vib);
  if (aTint > 1.5) col *= (0.35 + acou);

  // anomaly: a fraction of the field strains toward red
  col = mix(col, vec3(1.0, 0.30, 0.18), uAnomaly * step(0.72, aSeed.y) * 0.85);

  vColor = col;
}
`;

const FRAG = /* glsl */ `
varying float vAlpha;
varying vec3  vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.04, d);
  float core = smoothstep(0.16, 0.0, d);
  gl_FragColor = vec4(vColor + core * 0.55, a * vAlpha);
}
`;

/* ------------------------- machine target sampling ----------------------- */

let machineData: {
  positions: Float32Array;
  targets: Float32Array; // COUNT*3, filled lazily
} | null = null;

async function loadMachineMesh(): Promise<THREE.BufferGeometry> {
  const gltf = await new Promise<{ scene: THREE.Group }>(
    (resolve, reject) =>
      new GLTFLoader().load(GLB_URL, resolve as never, undefined, reject),
  );
  let mesh: THREE.Mesh | null = null;
  gltf.scene.traverse((o) => {
    if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
  });
  if (!mesh) throw new Error("no mesh in machine GLB");
  return (mesh as THREE.Mesh).geometry;
}

/** Fill the target attribute: white → surface vertices, blue/orange → sensors. */
function buildTargets(positions: Float32Array, count: number): Float32Array {
  const targets = new Float32Array(count * 3);
  const adxl = SENSOR_ANCHORS.ADXL345.map((v) => v * MACHINE_SCALE);
  const inmp = SENSOR_ANCHORS.INMP441.map((v) => v * MACHINE_SCALE);
  for (let i = 0; i < count; i++) {
    const seed = (i * 2654435761) % 1000 / 1000;
    const tint = seed < 0.16 ? 1 : seed < 0.32 ? 2 : 0;
    if (tint === 1) {
      // cluster around the real ADXL345 mount
      targets[i * 3] = adxl[0] + (Math.random() - 0.5) * 0.5;
      targets[i * 3 + 1] = adxl[1] + (Math.random() - 0.5) * 0.3;
      targets[i * 3 + 2] = adxl[2] + (Math.random() - 0.5) * 0.5;
    } else if (tint === 2) {
      targets[i * 3] = inmp[0] + (Math.random() - 0.5) * 0.5;
      targets[i * 3 + 1] = inmp[1] + (Math.random() - 0.5) * 0.4;
      targets[i * 3 + 2] = inmp[2] + (Math.random() - 0.5) * 0.5;
    } else {
      // sample a random vertex of the machine shell
      const vi = Math.floor(Math.random() * (positions.length / 3));
      targets[i * 3] = positions[vi * 3] * MACHINE_SCALE;
      targets[i * 3 + 1] = positions[vi * 3 + 1] * MACHINE_SCALE;
      targets[i * 3 + 2] = positions[vi * 3 + 2] * MACHINE_SCALE;
    }
  }
  return targets;
}

/* ------------------------------ particles -------------------------------- */

function Particles({
  revealRef,
  stateRef,
  calm,
}: {
  revealRef: React.MutableRefObject<number>;
  stateRef?: React.RefObject<UniverseState | null>;
  calm?: boolean;
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const geoRef = useRef<THREE.BufferGeometry>(null);
  const mouse = useRef(new THREE.Vector3(999, 999, 0));
  const reveal = useRef(0);

  const { positions, seeds, sizes, tints } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);
    const tints = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      // slightly centre-weighted volume around the machine
      const r = Math.pow(Math.random(), 0.7);
      const th = Math.random() * Math.PI * 2;
      positions[i * 3] = Math.cos(th) * r * 6.5 + (Math.random() - 0.5) * 1.2;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 5.5 * r + (Math.random() - 0.5) * 0.6;
      positions[i * 3 + 2] = Math.sin(th) * r * 4.5 - 0.5 + (Math.random() - 0.5) * 1.2;
      seeds[i * 3] = Math.random();
      seeds[i * 3 + 1] = Math.random();
      seeds[i * 3 + 2] = Math.random();
      sizes[i] = 0.6 + Math.pow(Math.random(), 2.2) * 2.4;
      const s = (i * 2654435761) % 1000 / 1000;
      tints[i] = s < 0.16 ? 1 : s < 0.32 ? 2 : 0;
    }
    return { positions, seeds, sizes, tints };
  }, []);

  // Load machine geometry → fill aTarget once.
  useEffect(() => {
    let dead = false;
    loadMachineMesh()
      .then((geo) => {
        if (dead || !geoRef.current) return;
        machineData = {
          positions: (geo.getAttribute("position") as THREE.BufferAttribute)
            .array as Float32Array,
          targets: new Float32Array(0),
        };
        const targets = buildTargets(machineData.positions, COUNT);
        geoRef.current.setAttribute("aTarget", new THREE.BufferAttribute(targets, 3));
      })
      .catch((e) => console.warn("[EdgeSense] particle targets unavailable:", e));
    return () => {
      dead = true;
    };
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uEnergy: { value: 0 },
      uAnomaly: { value: 0 },
      uMouse: { value: new THREE.Vector3(999, 999, 0) },
    }),
    [],
  );

  useFrame((state, dt) => {
    uniforms.uTime.value += dt * (calm ? 0.7 : 1);
    // ease reveal so scroll feels cinematic
    reveal.current += (revealRef.current - reveal.current) * Math.min(1, dt * 2.2);
    uniforms.uReveal.value = reveal.current;

    const s = stateRef?.current ?? null;
    const running = !!s && (s.power === "ON" || s.power === "STARTING");
    const energy = running
      ? Math.min(1, 0.35 + s.vibrationRms / 1.5 + s.rpm / 3000)
      : 0;
    uniforms.uEnergy.value += (energy - uniforms.uEnergy.value) * Math.min(1, dt * 3);
    const anomaly = running && s.behaviour === "ANOMALY" ? Math.min(1, s.fusedAnomalyScore) : 0;
    uniforms.uAnomaly.value += (anomaly - uniforms.uAnomaly.value) * Math.min(1, dt * 2);

    // cursor → world point on the z≈0 plane through the machine
    const ndc = state.pointer;
    const cam = state.camera as THREE.PerspectiveCamera;
    const v = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(cam);
    const dir = v.sub(cam.position).normalize();
    const tPlane = -cam.position.z / (dir.z || -0.0001);
    if (tPlane > 0) {
      mouse.current.copy(cam.position).addScaledVector(dir, tPlane);
      uniforms.uMouse.value.lerp(mouse.current, Math.min(1, dt * 6));
    }
  });

  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[seeds, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-aTint" args={[tints, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={VERT}
        fragmentShader={FRAG}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* --------------------------- the machine itself --------------------------- */

let cachedGeometry: THREE.BufferGeometry | null = null;

function Machine({ revealRef, stateRef }: {
  revealRef: React.MutableRefObject<number>;
  stateRef?: React.RefObject<UniverseState | null>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#8f9cab"),
        metalness: 0.55,
        roughness: 0.45,
        transparent: true,
        opacity: 0,
      }),
    [],
  );

  useEffect(() => {
    let dead = false;
    if (cachedGeometry) return;
    loadMachineMesh()
      .then((geo) => {
        if (dead) return;
        cachedGeometry = geo;
        if (meshRef.current) meshRef.current.geometry = geo;
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, []);

  const opacity = useRef(0);
  useFrame((state, dt) => {
    if (!meshRef.current || !groupRef.current) return;
    const target = Math.max(0, (revealRef.current - 0.45) / 0.55);
    opacity.current += (target - opacity.current) * Math.min(1, dt * 2);
    mat.opacity = opacity.current;
    meshRef.current.visible = opacity.current > 0.01;

    const s = stateRef?.current ?? null;
    const running = !!s && (s.power === "ON" || s.power === "STARTING");
    // subtle illumination lift while running
    mat.emissive.setHex(running ? 0x0a1a24 : 0x000000);

    // cinematic camera: pull in as the machine emerges + pointer parallax
    const cam = state.camera as THREE.PerspectiveCamera;
    const dist = 7.2 - revealRef.current * 2.2;
    const tx = state.pointer.x * 0.55;
    const ty = 1.35 + state.pointer.y * 0.35;
    cam.position.x += (tx - cam.position.x) * Math.min(1, dt * 1.6);
    cam.position.y += (ty - cam.position.y) * Math.min(1, dt * 1.6);
    const dir = cam.position.clone().sub(new THREE.Vector3(0, 0, 0)).normalize();
    cam.position.copy(dir.multiplyScalar(dist));
    cam.lookAt(0, 0, 0);
  });

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef} geometry={cachedGeometry ?? undefined} material={mat} scale={MACHINE_SCALE} visible={false} />
    </group>
  );
}

/* --------------------------------- root ---------------------------------- */

export function ParticleUniverse({ revealRef, stateRef, calm = false, className }: ParticleUniverseProps) {
  return (
    <div className={className} aria-hidden="true">
      <Canvas
        camera={{ position: [0.8, 1.35, 7.2], fov: 42 }}
        dpr={[1, 1.6]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 4, 3]} intensity={1.3} color="#e6ebf2" />
        <directionalLight position={[-3, 1, -2]} intensity={0.4} color="#ccd6e0" />
        <Particles revealRef={revealRef} stateRef={stateRef} calm={calm} />
        <Machine revealRef={revealRef} stateRef={stateRef} />
      </Canvas>
    </div>
  );
}
