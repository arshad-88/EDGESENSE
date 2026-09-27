/**
 * MachineScene — the 3D hero. Loads the supplied industrial motor GLB, splits
 * it into stationary housing + rotating rotor (see split-motor.ts — the GLB
 * ships as one combined mesh), and drives rotation purely from the central
 * machine state (rpm). ADXL345 (cyan) and INMP441 (orange) sensing effects
 * are physically positioned at the model's real sensor locations and scale
 * with the live vibration RMS / acoustic level.
 *
 * Clicking a sensor anchor shows an info panel with the sensor's name and
 * duty. In fullscreen the camera pulls back and the machine stays centered.
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

export interface SensorInfo {
  id: "ADXL345" | "INMP441";
  name: string;
  duty: string;
  measures: string;
  accent: string;
}

export const SENSOR_INFO: Record<SensorInfo["id"], SensorInfo> = {
  ADXL345: {
    id: "ADXL345",
    name: "ADXL345",
    duty: "3-Axis Accelerometer · Vibration sensing",
    measures: "Measures 3-axis vibration (RMS, kurtosis, peak) mounted on the motor housing.",
    accent: "#38bdf8",
  },
  INMP441: {
    id: "INMP441",
    name: "INMP441",
    duty: "I2S MEMS Microphone · Acoustic sensing",
    measures: "Measures acoustic emission near the coupling — audio level and spectrum.",
    accent: "#fb923c",
  },
};

/* ------------------------- GLB loading + split ------------------------- */

let cachedSplit: ReturnType<typeof splitRotorFromHousing> | null = null;

async function loadMotor(): Promise<typeof cachedSplit> {
  if (cachedSplit) return cachedSplit;
  const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>(
    (resolve, reject) => new GLTFLoader().load(GLB_URL, resolve, undefined, reject),
  );
  const scene = gltf.scene;
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
  // Split into a stationary housing + an independent, shrunken rotor insert.
  // The insert shares no topology with the housing (verified in split-motor),
  // so spinning it is structurally incapable of tearing the model.
  const mat = m.material as THREE.MeshStandardMaterial;
  const mkMat = () => {
    const mm = mat.clone();
    mm.side = THREE.DoubleSide;
    return mm;
  };
  const split = splitRotorFromHousing(m.geometry);
  split.housing.userData.material = mkMat();
  split.rotor.userData.material = mkMat();
  cachedSplit = split;
  return split;
}

/* ------------------- rotating groups (user-verified parts) --------------- */

/** A spinning mesh around the X (shaft) axis at the real RPM. */
function SpinPart({
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
      ref.current.rotation.x += ((s.rpm / 60) * Math.PI * 2 * dt) / 4;
    }
  });
  return (
    <mesh geometry={geometry} material={geometry.userData.material as THREE.Material} ref={ref} />
  );
}

/** Whole-machine vibration: a subtle shake driven by real vibration RMS. */
function MachineShake({
  stateRef,
  children,
}: {
  stateRef: React.RefObject<MachineState>;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((clockInfo) => {
    const s = stateRef.current;
    if (!ref.current || !s) return;
    const running = s.power === "ON" || s.power === "STARTING" || s.power === "STOPPING";
    const t = clockInfo.clock.elapsedTime;
    const intensity = running ? Math.min(1, s.vibrationRms / 1.5) : 0;
    // Dominant-frequency-driven micro-shake; far below what looks broken.
    const amp = intensity * 0.004;
    ref.current.position.x = Math.sin(t * s.dominantFrequency * 0.5) * amp;
    ref.current.position.y = Math.sin(t * s.dominantFrequency * 0.5 + 1.3) * amp * 0.7;
    ref.current.rotation.z = Math.sin(t * s.dominantFrequency * 0.35) * amp * 0.35;
  });
  return <group ref={ref}>{children}</group>;
}

function Housing({ geometry }: { geometry: THREE.BufferGeometry }) {
  return (
    <mesh geometry={geometry} material={geometry.userData.material as THREE.Material} />
  );
}

/* --------------------- physically positioned sensors -------------------- */

interface SensorAnchorProps {
  stateRef: React.RefObject<MachineState>;
  position: [number, number, number];
  onSelect: (id: SensorInfo["id"]) => void;
  selected: boolean;
}

/** Cyan vibration rings from the ADXL345 mount + click target. */
function Adxl345Effect({ stateRef, position, onSelect, selected }: SensorAnchorProps) {
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
    if (group.current) group.current.visible = on || selected;
  });
  return (
    <group
      ref={group}
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onSelect("ADXL345");
      }}
    >
      {/* invisible click target over the sensor location (no visual ball) */}
      <mesh
        position={[0, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onSelect("ADXL345"); }}
      >
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
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

/** Orange acoustic ripples from the INMP441 position + click target. */
function Inmp441Effect({ stateRef, position, onSelect, selected }: SensorAnchorProps) {
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
    if (group.current) group.current.visible = on || selected;
  });
  return (
    <group
      ref={group}
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onSelect("INMP441");
      }}
    >
      {/* invisible click target over the sensor location (no visual ball) */}
      <mesh
        position={[0, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onSelect("INMP441"); }}
      >
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {Array.from({ length: RING_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) rings.current[i] = el;
          }}
        >
          <ringGeometry args={[0.85, 1, 48]} />
          <meshBasicMaterial color="#fb923c" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------ scene root ------------------------------ */

function MotorAssembly({
  stateRef,
  onSelect,
  selected,
  fullscreen,
}: {
  stateRef: React.RefObject<MachineState>;
  onSelect: (id: SensorInfo["id"]) => void;
  selected: SensorInfo["id"] | null;
  fullscreen: boolean;
}) {
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
    <group position={[0, fullscreen ? 0.05 : 0.02, 0]} scale={fullscreen ? 2.1 : 1.55}>
      <MachineShake stateRef={stateRef}>
        <Housing geometry={split.housing} />
        {/* the only rotating mesh: the independent rotor insert */}
        <SpinPart geometry={split.rotor} stateRef={stateRef} />
      </MachineShake>
      {/*
        Sensor effect anchors. The model already includes the physical ADXL345
        (blue, top-left of housing) and INMP441 (near the pump inlet) meshes —
        these groups only emit sensing waves from those positions and provide
        the click targets; they never rotate.
      */}
      <Adxl345Effect
        stateRef={stateRef}
        position={[-0.28, 0.20, 0.04]}
        onSelect={onSelect}
        selected={selected === "ADXL345"}
      />
      <Inmp441Effect
        stateRef={stateRef}
        position={[0.30, 0.10, 0.22]}
        onSelect={onSelect}
        selected={selected === "INMP441"}
      />
    </group>
  );
}

export interface MachineSceneProps {
  stateRef: React.RefObject<MachineState>;
  className?: string;
  fullscreen?: boolean;
  onSelectSensor?: (id: SensorInfo["id"] | null) => void;
  selectedSensor?: SensorInfo["id"] | null;
}

export function MachineScene({
  stateRef,
  className,
  fullscreen = false,
  onSelectSensor,
  selectedSensor = null,
}: MachineSceneProps) {
  return (
    <div className={className}>
      <Canvas
        camera={{
          // Pull back in fullscreen so the machine appears large but fully framed.
          position: fullscreen ? [1.5, 0.75, 1.9] : [1.1, 0.55, 1.35],
          fov: 38,
        }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
        onPointerMissed={() => onSelectSensor?.(null)}
      >
        <ambientLight intensity={0.35} />
        <directionalLight position={[2, 3, 2]} intensity={1.4} color="#e2e8f0" />
        <directionalLight position={[-2, 1, -1]} intensity={0.5} color="#38bdf8" />
        <directionalLight position={[0, -2, 1]} intensity={0.25} color="#fb923c" />
        <Suspense fallback={null}>
          <MotorAssembly
            stateRef={stateRef}
            onSelect={(id) => onSelectSensor?.(id)}
            selected={selectedSensor}
            fullscreen={fullscreen}
          />
          <ContactShadows position={[0, -0.18, 0]} opacity={0.5} scale={4} blur={2.4} far={1} />
        </Suspense>
        <OrbitControls
          enablePan={false}
          minDistance={0.9}
          maxDistance={fullscreen ? 4 : 2.6}
          minPolarAngle={Math.PI * 0.12}
          maxPolarAngle={Math.PI * 0.62}
          target={[0, fullscreen ? 0.05 : 0.02, 0]}
          autoRotate={!fullscreen}
          autoRotateSpeed={0.5}
          enableDamping
        />
      </Canvas>
    </div>
  );
}
