/**
 * MachineScene — the 3D hero. Loads the supplied industrial motor GLB, splits
 * it into stationary housing + rotating rotor (see split-motor.ts — the GLB
 * ships as one combined mesh), and drives rotation purely from the central
 * machine state (rpm). ADXL345 (cyan) and INMP441 (orange) sensing effects
 * are physically positioned relative to the machine body and scale with the
 * live vibration RMS / acoustic level from the same state.
 *
 * No UI state churn: the animation loop mutates Three.js objects directly via
 * refs, so high-frequency sensor visuals never re-render React.
 */
import { Suspense, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import type { MachineState } from "@/core/edgesense";
import { splitRotorFromHousing } from "./split-motor";

const GLB_URL = "/motor.glb";

/* ------------------------- GLB loading + split ------------------------- */

let cachedSplit: ReturnType<typeof splitRotorFromHousing> | null = null;

async function loadMotor(): Promise<typeof cachedSplit> {
  if (cachedSplit) return cachedSplit;
  const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>(
    (resolve, reject) => new GLTFLoader().load(GLB_URL, resolve, undefined, reject),
  );
  const scene = gltf.scene;
  // Log hierarchy per the integration spec (node names, clips).
  const names: string[] = [];
  scene.traverse((o) => names.push(`${o.type}:${o.name || "(unnamed)"}`));
  console.info("[EdgeSense 3D] GLB loaded. Nodes:", names);
  console.info("[EdgeSense 3D] Animation clips:", gltf.animations.map((a) => a.name));

  let mesh: THREE.Mesh | null = null;
  scene.traverse((o) => {
    if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
  });
  if (!mesh) throw new Error("No mesh found in motor GLB");
  const m = mesh as THREE.Mesh;
  const split = splitRotorFromHousing(m.geometry);
  // Preserve the original material (textured PBR).
  split.housing.userData.material = m.material;
  split.rotor.userData.material = m.material;
  cachedSplit = split;
  return split;
}

/* --------------------------- rotating rotor ---------------------------- */

function Rotor({
  geometry,
  stateRef,
}: {
  geometry: THREE.BufferGeometry;
  stateRef: React.RefObject<MachineState>;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    const s = stateRef.current;
    if (!ref.current || !s) return;
    const running = s.power === "ON" || s.power === "STARTING" || s.power === "STOPPING";
    if (running) {
      // radians per second from rpm (rpm/60 × 2π), slowed for watchability.
      ref.current.rotation.x += ((s.rpm / 60) * Math.PI * 2 * dt) / 6;
    } else {
      ref.current.rotation.x += 0; // fully stopped when OFF
    }
  });
  return (
    <mesh ref={ref} geometry={geometry} material={geometry.userData.material as THREE.Material} />
  );
}

function Housing({ geometry }: { geometry: THREE.BufferGeometry }) {
  return (
    <mesh geometry={geometry} material={geometry.userData.material as THREE.Material} />
  );
}

/* --------------------- physically positioned sensors -------------------- */

/** Cyan vibration rings emanating from the ADXL345 mount on the housing top. */
function Adxl345Effect({ stateRef, position }: { stateRef: React.RefObject<MachineState>; position: [number, number, number] }) {
  const group = useRef<THREE.Group>(null);
  const rings = useRef<THREE.Mesh[]>([]);
  const RING_COUNT = 3;
  useFrame((clockInfo) => {
    const s = stateRef.current;
    const t = clockInfo.clock.elapsedTime;
    const on = s ? s.power === "ON" || s.power === "STARTING" : false;
    const intensity = s ? Math.min(1, s.vibrationRms / 1.5) : 0;
    for (let i = 0; i < RING_COUNT; i++) {
      const ring = rings.current[i];
      if (!ring) continue;
      const phase = (t * (0.5 + intensity * 1.2) + i / RING_COUNT) % 1;
      ring.visible = on && intensity > 0.02;
      const scale = 0.04 + phase * (0.10 + intensity * 0.22);
      ring.scale.setScalar(scale);
      const mat = ring.material as THREE.MeshBasicMaterial;
      mat.opacity = on ? (1 - phase) * (0.25 + intensity * 0.6) : 0;
    }
    if (group.current) group.current.visible = on;
  });
  return (
    <group ref={group} position={position}>
      {Array.from({ length: RING_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) rings.current[i] = el;
          }}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.85, 1, 48]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Orange acoustic ripples from the INMP441 microphone position beside the machine. */
function Inmp441Effect({ stateRef, position }: { stateRef: React.RefObject<MachineState>; position: [number, number, number] }) {
  const group = useRef<THREE.Group>(null);
  const rings = useRef<THREE.Mesh[]>([]);
  const RING_COUNT = 3;
  useFrame((clockInfo) => {
    const s = stateRef.current;
    const t = clockInfo.clock.elapsedTime;
    const on = s ? s.power === "ON" || s.power === "STARTING" : false;
    const intensity = s ? Math.min(1, s.acousticLevel / 90) : 0;
    for (let i = 0; i < RING_COUNT; i++) {
      const ring = rings.current[i];
      if (!ring) continue;
      const irregular = s && s.behaviour === "ANOMALY" ? 0.35 * Math.sin(t * 9 + i * 2.4) : 0;
      const phase = (t * (0.4 + intensity * 1.1) + i / RING_COUNT + irregular + 1) % 1;
      ring.visible = on && intensity > 0.02;
      const scale = 0.03 + phase * (0.09 + intensity * 0.26);
      ring.scale.setScalar(scale);
      const mat = ring.material as THREE.MeshBasicMaterial;
      mat.opacity = on ? (1 - phase) * (0.2 + intensity * 0.55) : 0;
    }
  });
  return (
    <group ref={group} position={position}>
      {Array.from({ length: RING_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) rings.current[i] = el;
          }}
          rotation={[0, 0, 0]}
        >
          <ringGeometry args={[0.85, 1, 48]} />
          <meshBasicMaterial color="#fb923c" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------ scene root ------------------------------ */

function MotorAssembly({ stateRef }: { stateRef: React.RefObject<MachineState> }) {
  const [split, setSplit] = useState<ReturnType<typeof splitRotorFromHousing> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useMemo(() => {
    loadMotor()
      .then(setSplit)
      .catch((e) => {
        console.error("[EdgeSense 3D] model loading failed:", e);
        setError(String(e));
      });
  }, []);

  if (error) {
    console.error("[EdgeSense 3D] showing fallback geometry — GLB failed:", error);
    return (
      <group>
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[0.9, 0.5, 0.6]} />
          <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.5} />
        </mesh>
      </group>
    );
  }
  if (!split) return null;

  return (
    <group position={[0, 0.02, 0]} scale={1.55}>
      <Housing geometry={split.housing} />
      <Rotor geometry={split.rotor} stateRef={stateRef} />
      {/*
        Sensor effect anchors. The model already includes the physical ADXL345
        (blue, top-left of housing) and INMP441 (near the pump inlet) meshes —
        these groups only emit the sensing waves from those same positions;
        they add no sensor geometry and never rotate (siblings of Housing).
      */}
      <Adxl345Effect stateRef={stateRef} position={[-0.28, 0.20, 0.04]} />
      <Inmp441Effect stateRef={stateRef} position={[0.30, 0.10, 0.22]} />
    </group>
  );
}

export interface MachineSceneProps {
  stateRef: React.RefObject<MachineState>;
  className?: string;
}

export function MachineScene({ stateRef, className }: MachineSceneProps) {
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [1.1, 0.55, 1.35], fov: 38 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.35} />
        <directionalLight position={[2, 3, 2]} intensity={1.4} color="#e2e8f0" />
        <directionalLight position={[-2, 1, -1]} intensity={0.5} color="#38bdf8" />
        <directionalLight position={[0, -2, 1]} intensity={0.25} color="#fb923c" />
        <Suspense fallback={null}>
          <MotorAssembly stateRef={stateRef} />
          <ContactShadows position={[0, -0.18, 0]} opacity={0.5} scale={4} blur={2.4} far={1} />
        </Suspense>
        <OrbitControls
          enablePan={false}
          minDistance={0.9}
          maxDistance={2.6}
          minPolarAngle={Math.PI * 0.12}
          maxPolarAngle={Math.PI * 0.62}
          autoRotate
          autoRotateSpeed={0.5}
          enableDamping
        />
      </Canvas>
    </div>
  );
}
