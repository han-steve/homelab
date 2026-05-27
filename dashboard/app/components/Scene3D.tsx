"use client";

import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Html,
  RoundedBox,
  Environment,
  Float,
} from "@react-three/drei";
import * as THREE from "three";
import { services, type Service } from "../data";

function StatusLight({ status }: { status: Service["status"] }) {
  const color =
    status === "running"
      ? "#22c55e"
      : status === "degraded"
        ? "#eab308"
        : "#ef4444";
  return (
    <mesh position={[0.85, 0, 0.51]}>
      <sphereGeometry args={[0.04, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={2}
      />
    </mesh>
  );
}

function ServiceUnit({
  service,
  position,
  onClick,
  isSelected,
}: {
  service: Service;
  position: [number, number, number];
  onClick: () => void;
  isSelected: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((_, delta) => {
    if (meshRef.current) {
      const targetScale = isSelected ? 1.05 : hovered ? 1.02 : 1;
      meshRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        delta * 8
      );
    }
  });

  return (
    <group position={position}>
      <RoundedBox
        ref={meshRef}
        args={[2, 0.35, 1]}
        radius={0.03}
        smoothness={4}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "default";
        }}
      >
        <meshPhysicalMaterial
          color={isSelected ? service.color : hovered ? "#3a3a4a" : "#2a2a3a"}
          metalness={0.7}
          roughness={0.3}
          clearcoat={0.3}
        />
      </RoundedBox>

      {/* Service name */}
      <Html
        position={[0, 0, 0.51]}
        center
        distanceFactor={5}
        style={{ pointerEvents: "none", whiteSpace: "nowrap" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontFamily: "system-ui" }}>
          <span style={{ color: isSelected ? "#ffffff" : "#a0a0b0" }}>
            {service.icon} {service.name}
          </span>
          <span style={{ color: "#606070", fontSize: "10px" }}>
            {service.ip === "internal" ? "cluster-only" : service.ip}
          </span>
        </div>
      </Html>

      <StatusLight status={service.status} />
    </group>
  );
}

function ServerRack({
  onSelect,
  selectedIdx,
}: {
  onSelect: (idx: number) => void;
  selectedIdx: number | null;
}) {
  return (
    <group position={[0, 0, 0]}>
      {/* Rack frame */}
      <RoundedBox
        args={[2.4, services.length * 0.42 + 0.5, 1.2]}
        radius={0.05}
        position={[0, (services.length * 0.42) / 2 - 0.1, -0.05]}
      >
        <meshPhysicalMaterial
          color="#1a1a2e"
          metalness={0.8}
          roughness={0.2}
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
        />
      </RoundedBox>

      {/* Service units */}
      {services.map((svc, i) => (
        <ServiceUnit
          key={svc.name}
          service={svc}
          position={[0, services.length * 0.4 - i * 0.42 - 0.3, 0]}
          onClick={() => onSelect(i)}
          isSelected={selectedIdx === i}
        />
      ))}

      {/* Rack title */}
      <Html
        position={[0, services.length * 0.4 + 0.15, 0.61]}
        center
        distanceFactor={5}
        style={{ pointerEvents: "none", whiteSpace: "nowrap" }}
      >
        <div style={{ fontSize: "14px", color: "#60a5fa", fontFamily: "system-ui", fontWeight: "bold" }}>
          🖥️ M2 NODE — 192.168.1.10
        </div>
      </Html>
    </group>
  );
}

function AnimatedParticles() {
  const ref = useRef<THREE.Points>(null);
  const count = 200;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 15;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 15;
  }

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.02;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial size={0.02} color="#4060a0" transparent opacity={0.4} />
    </points>
  );
}

export default function Scene3D({
  onSelect,
  selectedIdx,
}: {
  onSelect: (idx: number | null) => void;
  selectedIdx: number | null;
}) {
  return (
    <Canvas
      camera={{ position: [0, 2, 8], fov: 50 }}
      style={{ background: "transparent" }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} />
      <pointLight position={[-3, 3, 3]} intensity={0.4} color="#60a5fa" />

      <Float speed={0.5} rotationIntensity={0.02} floatIntensity={0.1}>
        <ServerRack
          onSelect={(i) => onSelect(i)}
          selectedIdx={selectedIdx}
        />
      </Float>

      <AnimatedParticles />

      <OrbitControls
        enablePan={false}
        minDistance={3}
        maxDistance={10}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.2}
        makeDefault
      />
      <Environment preset="night" />
    </Canvas>
  );
}
