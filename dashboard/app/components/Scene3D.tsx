"use client";

import { useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Html,
  RoundedBox,
  Environment,
  Float,
} from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  Vignette,
} from "@react-three/postprocessing";
import * as THREE from "three";
import { services, type Service } from "../data";

function HoloGrid() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const mat = ref.current.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  const shader = useMemo(
    () => ({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        void main() {
          vec2 p = vUv * 40.0;
          float gx = smoothstep(0.92, 1.0, abs(sin(p.x * 3.14159)));
          float gy = smoothstep(0.92, 1.0, abs(sin(p.y * 3.14159)));
          float grid = max(gx, gy);
          float fade = 1.0 - smoothstep(0.0, 0.5, length(vUv - 0.5));
          float scan = smoothstep(0.98, 1.0, sin(vUv.y * 80.0 + uTime * 2.0));
          float alpha = grid * fade * 0.15 + scan * fade * 0.03;
          gl_FragColor = vec4(0.35, 0.6, 1.0, alpha);
        }
      `,
    }),
    []
  );

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.2, 0]}>
      <planeGeometry args={[30, 30, 1, 1]} />
      <shaderMaterial
        {...shader}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function ScanBeam() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const t = clock.getElapsedTime();
      ref.current.position.y = Math.sin(t * 0.5) * 2.5;
      const mat = ref.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.04 + Math.sin(t * 2) * 0.02;
    }
  });

  return (
    <mesh ref={ref} position={[0, 0, 0]}>
      <planeGeometry args={[3, 0.05, 1, 1]} />
      <meshBasicMaterial color="#60a5fa" transparent opacity={0.05} side={THREE.DoubleSide} />
    </mesh>
  );
}

function StatusLight({ status }: { status: Service["status"] }) {
  const color =
    status === "running" ? "#22c55e" : status === "degraded" ? "#eab308" : "#ef4444";
  return (
    <mesh position={[0.85, 0, 0.51]}>
      <sphereGeometry args={[0.04, 16, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} toneMapped={false} />
    </mesh>
  );
}

function CategoryIndicator({ category }: { category: Service["category"] }) {
  const colors: Record<string, string> = {
    app: "#a78bfa", infra: "#f97316", monitoring: "#22d3ee", storage: "#60a5fa",
  };
  return (
    <mesh position={[-0.95, 0, 0.501]}>
      <boxGeometry args={[0.04, 0.25, 0.01]} />
      <meshStandardMaterial color={colors[category]} emissive={colors[category]} emissiveIntensity={2} toneMapped={false} />
    </mesh>
  );
}

function ServiceUnit({
  service, position, onClick, isSelected,
}: {
  service: Service;
  position: [number, number, number];
  onClick: () => void;
  isSelected: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current) {
      const s = isSelected ? 1.06 : hovered ? 1.03 : 1;
      meshRef.current.scale.lerp(new THREE.Vector3(s, s, s), delta * 8);
    }
    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = isSelected ? 0.12 : hovered ? 0.06 : 0;
    }
  });

  return (
    <group position={position}>
      <mesh ref={glowRef} position={[0, 0, -0.05]}>
        <boxGeometry args={[2.2, 0.4, 1.1]} />
        <meshBasicMaterial color={service.color} transparent opacity={0} toneMapped={false} />
      </mesh>

      <RoundedBox ref={meshRef} args={[2, 0.35, 1]} radius={0.03} smoothness={4}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}
      >
        <meshPhysicalMaterial
          color={isSelected ? "#2a2a4a" : hovered ? "#252535" : "#1e1e2e"}
          metalness={0.8} roughness={0.2} clearcoat={0.5} clearcoatRoughness={0.1}
        />
      </RoundedBox>

      <mesh position={[0, 0, 0.501]}>
        <planeGeometry args={[2, 0.35]} />
        <meshBasicMaterial
          color={isSelected ? service.color : "#2a2a3a"}
          transparent opacity={isSelected ? 0.15 : 0.05} toneMapped={false}
        />
      </mesh>

      <CategoryIndicator category={service.category} />

      <Html position={[0, 0, 0.52]} center distanceFactor={5}
        style={{ pointerEvents: "none", whiteSpace: "nowrap" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontFamily: "monospace" }}>
          <span style={{
            color: isSelected ? "#ffffff" : "#b0b0c0",
            fontWeight: isSelected ? 600 : 400,
            textShadow: isSelected ? "0 0 10px " + service.color + "80" : "none",
          }}>
            {service.icon} {service.name}
          </span>
          <span style={{ color: "#505060", fontSize: "10px" }}>
            {service.ip === "internal" ? "cluster" : service.ip}
          </span>
        </div>
      </Html>

      <StatusLight status={service.status} />
    </group>
  );
}

function ServerRack({
  onSelect, selectedIdx,
}: {
  onSelect: (idx: number) => void;
  selectedIdx: number | null;
}) {
  const rackHeight = services.length * 0.42 + 0.5;

  return (
    <group position={[0, 0, 0]}>
      <RoundedBox args={[2.5, rackHeight, 1.3]} radius={0.06}
        position={[0, (services.length * 0.42) / 2 - 0.1, -0.1]}
      >
        <meshPhysicalMaterial color="#0a0a1a" metalness={0.9} roughness={0.15}
          transparent opacity={0.5} side={THREE.DoubleSide}
        />
      </RoundedBox>

      <mesh position={[0, rackHeight / 2 + services.length * 0.21 - 0.35, 0.56]}>
        <boxGeometry args={[2.3, 0.01, 0.01]} />
        <meshBasicMaterial color="#60a5fa" toneMapped={false} />
      </mesh>

      {services.map((svc, i) => (
        <ServiceUnit key={svc.name} service={svc}
          position={[0, services.length * 0.4 - i * 0.42 - 0.3, 0]}
          onClick={() => onSelect(i)} isSelected={selectedIdx === i}
        />
      ))}

      <Html position={[0, services.length * 0.4 + 0.2, 0.61]} center distanceFactor={5}
        style={{ pointerEvents: "none", whiteSpace: "nowrap" }}
      >
        <div style={{ fontSize: "14px", fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.05em" }}>
          <span style={{ color: "#60a5fa", textShadow: "0 0 15px #60a5fa60" }}>{"\u26A1"} M2</span>
          <span style={{ color: "#404050", margin: "0 6px" }}>|</span>
          <span style={{ color: "#606070" }}>192.168.1.10</span>
          <span style={{ color: "#404050", margin: "0 6px" }}>|</span>
          <span style={{ color: "#3fb950", fontSize: "10px" }}>{"\u25CF"} ONLINE</span>
        </div>
      </Html>
    </group>
  );
}

function Particles() {
  const ref = useRef<THREE.Points>(null);
  const count = 300;
  const [positions] = useState(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 20;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 12;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    return arr;
  });

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.getElapsedTime() * 0.015;
      ref.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.01) * 0.1;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.015} color="#4080c0" transparent opacity={0.5} sizeAttenuation toneMapped={false} />
    </points>
  );
}

function DataStreams() {
  const ref = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      mesh.position.y = ((t * (0.5 + i * 0.1) + i * 2) % 8) - 4;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.1 + Math.sin(t + i) * 0.05;
    });
  });

  return (
    <group ref={ref}>
      {Array.from({ length: 6 }).map((_, i) => (
        <mesh key={i} position={[(i - 2.5) * 0.5, 0, -2]}>
          <boxGeometry args={[0.005, 0.3, 0.005]} />
          <meshBasicMaterial color="#60a5fa" transparent opacity={0.1} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

export default function Scene3D({
  onSelect, selectedIdx,
}: {
  onSelect: (idx: number | null) => void;
  selectedIdx: number | null;
}) {
  return (
    <Canvas camera={{ position: [0, 2, 8], fov: 50 }}
      style={{ background: "transparent" }} gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 8, 5]} intensity={0.6} />
      <pointLight position={[-3, 3, 3]} intensity={0.5} color="#60a5fa" distance={15} />
      <pointLight position={[3, -1, 2]} intensity={0.3} color="#a78bfa" distance={10} />

      <Float speed={0.4} rotationIntensity={0.015} floatIntensity={0.08}>
        <ServerRack onSelect={(i) => onSelect(i)} selectedIdx={selectedIdx} />
      </Float>

      <HoloGrid />
      <ScanBeam />
      <Particles />
      <DataStreams />

      <EffectComposer>
        <Bloom luminanceThreshold={0.3} luminanceSmoothing={0.9} intensity={0.6} mipmapBlur />
        <Vignette eskil={false} offset={0.1} darkness={0.8} />
      </EffectComposer>

      <OrbitControls enablePan={false} minDistance={3} maxDistance={12}
        minPolarAngle={Math.PI / 6} maxPolarAngle={Math.PI / 2.2} makeDefault
      />
      <Environment preset="night" />
    </Canvas>
  );
}
