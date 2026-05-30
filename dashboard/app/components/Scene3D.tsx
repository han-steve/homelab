"use client";

import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import {
  OrbitControls,
  Text,
  Html,
  Float,
  useGLTF,
  Line,
  Billboard,
} from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { services, node, gpuNode, router } from "../data";

/* ── colour palette ────────────────────────────────── */
const CATEGORY_COLORS: Record<string, string> = {
  app: "#a855f7",
  infra: "#f97316",
  monitoring: "#06b6d4",
  storage: "#3b82f6",
};

/* ── responsive camera ─────────────────────────────── */
function ResponsiveCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    // Wider FOV on narrow viewports so the scene fits
    cam.fov = size.width < 640 ? 70 : 50;
    cam.updateProjectionMatrix();
  }, [camera, size.width]);
  return null;
}

/* ── GLSL holographic grid ─────────────────────────── */
function HoloGrid() {
  const ref = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.ShaderMaterial>(null!);
  useFrame(({ clock }) => {
    if (mat.current) mat.current.uniforms.uTime.value = clock.getElapsedTime();
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} raycast={() => {}}>
      <planeGeometry args={[40, 40, 1, 1]} />
      <shaderMaterial
        ref={mat}
        transparent
        uniforms={{ uTime: { value: 0 } }}
        vertexShader={`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`}
        fragmentShader={`
          uniform float uTime;
          varying vec2 vUv;
          void main(){
            vec2 g = fract(vUv * 30.0);
            float line = smoothstep(0.02,0.0, min(g.x, g.y));
            float fade = 1.0 - smoothstep(0.0, 0.5, length(vUv - 0.5));
            float scan = smoothstep(0.48,0.5, fract(vUv.y - uTime*0.05));
            float a = (line * 0.12 + scan * 0.04) * fade;
            gl_FragColor = vec4(0.2, 0.5, 1.0, a);
          }
        `}
      />
    </mesh>
  );
}

/* ── floating particles ────────────────────────────── */
function Particles({ count = 80 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null!);
  const positions = useMemo(() => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * 20;
      p[i * 3 + 1] = Math.random() * 8 - 2;
      p[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    return p;
  }, [count]);
  useFrame(({ clock }) => {
    ref.current.rotation.y = clock.getElapsedTime() * 0.01;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.03} color="#4488ff" transparent opacity={0.4} sizeAttenuation />
    </points>
  );
}

/* ── floor-level glowing ethernet cable ─────────────── */
function FloorCable({
  from, to, color = "#58a6ff", active = true
}: {
  from: [number, number, number];
  to: [number, number, number];
  color?: string;
  active?: boolean;
}) {
  const flowRef = useRef<THREE.Mesh>(null!);

  const curve = useMemo(() => {
    const f = new THREE.Vector3(from[0], 0.03, from[2]);
    const t = new THREE.Vector3(to[0], 0.03, to[2]);
    const mid = new THREE.Vector3().addVectors(f, t).multiplyScalar(0.5);
    // Small side offset so cable looks organic
    const perp = new THREE.Vector3(t.z - f.z, 0, f.x - t.x).normalize().multiplyScalar(0.5);
    const ctrl = mid.clone().add(perp);
    ctrl.y = 0.03;
    return new THREE.QuadraticBezierCurve3(f, ctrl, t);
  }, [from, to]);

  const flowTex = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 4;
    const ctx = canvas.getContext("2d")!;
    for (let x = 0; x < 512; x++) {
      const a = Math.pow(Math.sin((x / 512) * Math.PI * 8), 2) * 0.9;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(x, 0, 1, 4);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(5, 1);
    return tex;
  }, []);

  useFrame(({ clock }) => {
    if (flowRef.current && active) {
      const mat = flowRef.current.material as THREE.MeshBasicMaterial;
      if (mat.map) mat.map.offset.x = -clock.getElapsedTime() * 0.4;
    }
  });

  return (
    <group>
      {/* Base cable dim glow */}
      <mesh raycast={() => {}}>
        <tubeGeometry args={[curve, 80, 0.018, 6, false]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.18 : 0.05} />
      </mesh>
      {/* Animated flow layer */}
      {active && (
        <mesh ref={flowRef} raycast={() => {}}>
          <tubeGeometry args={[curve, 80, 0.018, 6, false]} />
          <meshBasicMaterial color={color} transparent opacity={0.85} map={flowTex} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/* ── glow ring fixed on floor ────────────────────────── */
function GlowRing({
  position, color, online, isSelected, isHovered
}: {
  position: [number, number, number];
  color: string;
  online: boolean;
  isSelected: boolean;
  isHovered: boolean;
}) {
  const outerRef = useRef<THREE.Mesh>(null!);
  const fillRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (outerRef.current) {
      const base = isSelected ? 1.06 : 1.0;
      const pulse = online ? Math.sin(t * 2.2) * 0.06 : 0;
      outerRef.current.scale.setScalar(base + pulse);
    }
    if (fillRef.current) {
      const mat = fillRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = online
        ? (isSelected ? 0.09 : isHovered ? 0.055 : 0.03) + Math.sin(t * 2.2) * 0.015
        : 0.008;
    }
  });

  const outerOpacity = online ? (isSelected ? 0.95 : isHovered ? 0.65 : 0.45) : 0.12;

  return (
    <group position={position} rotation-x={-Math.PI / 2}>
      <mesh ref={outerRef}>
        <torusGeometry args={[1.05, 0.025, 16, 80]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={outerOpacity} />
      </mesh>
      <mesh>
        <torusGeometry args={[0.68, 0.01, 16, 60]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={online ? 0.22 : 0.04} />
      </mesh>
      <mesh ref={fillRef}>
        <circleGeometry args={[1.05, 64]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.03} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ── pulsing selection ring ──────────────────────────── */
function SelectionRing({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (ref.current) {
      const s = 1 + Math.sin(clock.getElapsedTime() * 3) * 0.04;
      ref.current.scale.setScalar(s);
    }
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, 0.06, 0]}>
      <torusGeometry args={[1.2, 0.03, 16, 80]} />
      <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.9} />
    </mesh>
  );
}

/* ── Callout panel: square marker → dashed line → floating dialog ── */
function CalloutPanel({
  anchorPos, panelOffset, title, lines, color, visible, onClose
}: {
  anchorPos: [number, number, number];
  panelOffset: [number, number, number];
  title: string;
  lines: { label: string; value: string }[];
  color: string;
  visible: boolean;
  onClose: () => void;
}) {
  const panelPos = useMemo<[number, number, number]>(() => [
    anchorPos[0] + panelOffset[0],
    anchorPos[1] + panelOffset[1],
    anchorPos[2] + panelOffset[2],
  ], [anchorPos, panelOffset]);

  const linePoints = useMemo(() => [
    new THREE.Vector3(...anchorPos),
    new THREE.Vector3(...panelPos),
  ], [anchorPos, panelPos]);

  if (!visible) return null;

  return (
    <group>
      {/* Square marker at anchor (billboard – always faces camera) */}
      <Billboard position={anchorPos}>
        {/* Square outline (4-sided ring) */}
        <mesh rotation-z={Math.PI / 4}>
          <ringGeometry args={[0.07, 0.11, 4]} />
          <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.9} side={THREE.DoubleSide} />
        </mesh>
        {/* Center dot */}
        <mesh>
          <circleGeometry args={[0.03, 12]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
        {/* Subtle fill */}
        <mesh>
          <ringGeometry args={[0, 0.07, 4]} />
          <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.08} />
        </mesh>
      </Billboard>

      {/* Dashed connector line */}
      <Line
        points={linePoints}
        color={color}
        lineWidth={1.2}
        transparent
        opacity={0.55}
        dashed
        dashScale={3}
        dashSize={0.18}
        gapSize={0.08}
      />

      {/* Floating panel at end of line */}
      <Html position={panelPos} center distanceFactor={8} zIndexRange={[100, 0]}>
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "rgba(9,9,16,0.94)",
            border: `1px solid ${color}50`,
            borderRadius: 8,
            padding: "12px 16px",
            minWidth: 190,
            maxWidth: 270,
            fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            fontSize: 11,
            color: "#e4e4e7",
            boxShadow: `0 0 24px ${color}25, inset 0 0 0 1px ${color}18, 0 8px 32px rgba(0,0,0,0.6)`,
            backdropFilter: "blur(12px)",
            pointerEvents: "auto",
            position: "relative",
          }}
        >
          {/* Top accent line */}
          <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: 1, background: `linear-gradient(90deg, transparent, ${color}80, transparent)` }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
            <span style={{ color, fontWeight: 700, fontSize: 12, letterSpacing: 0.5 }}>{title}</span>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14, padding: "0 0 0 8px", lineHeight: 1, transition: "color 0.15s" }}
              onMouseOver={(e) => (e.currentTarget.style.color = "#ccc")}
              onMouseOut={(e) => (e.currentTarget.style.color = "#555")}
            >
              ✕
            </button>
          </div>
          <div style={{ borderTop: `1px solid ${color}18`, paddingTop: 7 }}>
            {lines.map((l, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2.5px 0", gap: 12 }}>
                <span style={{ color: "#666", textTransform: "uppercase", letterSpacing: 1, flexShrink: 0, fontSize: 10 }}>{l.label}</span>
                <span style={{ color: "#d4d4d8", textAlign: "right", fontSize: 11 }}>{l.value}</span>
              </div>
            ))}
          </div>
        </div>
      </Html>
    </group>
  );
}

/* ── status indicator dot ──────────────────────────── */
function StatusDot({
  position, status
}: {
  position: [number, number, number];
  status: "online" | "planned" | "offline" | "running" | "degraded" | "stopped";
}) {
  const ref = useRef<THREE.Mesh>(null!);
  const isOn = status === "online" || status === "running";
  const color = isOn ? "#22c55e" : status === "planned" || status === "degraded" ? "#eab308" : "#ef4444";
  useFrame(({ clock }) => {
    if (ref.current && isOn) {
      ref.current.scale.setScalar(1 + Math.sin(clock.getElapsedTime() * 3) * 0.15);
    }
  });
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.06, 16, 16]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

/* ── Hardware 3D model (GLB) ───────────────────────── */
function HardwareModel({
  url, scale = 0.08, position = [0, 0, 0], rotation = [0, 0, 0], opacity = 1
}: {
  url: string;
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  opacity?: number;
}) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    if (opacity < 1) {
      c.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => {
            (m as THREE.MeshStandardMaterial).transparent = true;
            (m as THREE.MeshStandardMaterial).opacity = opacity;
          });
        }
      });
    }
    return c;
  }, [scene, opacity]);
  return (
    // raycast disabled — parent group's explicit hitbox handles all pointer events
    <primitive
      object={cloned}
      scale={scale}
      position={position}
      rotation={rotation}
      raycast={() => {}}
    />
  );
}

/* ── Hardware node on floor ─────────────────────────── */
function HardwareNode({
  modelUrl, modelScale, modelOffset, modelRotation,
  position, label, sublabel, color, status,
  isSelected, isHovered, onClick, onPointerOver, onPointerOut,
}: {
  modelUrl: string;
  modelScale?: number;
  modelOffset?: [number, number, number];
  modelRotation?: [number, number, number];
  position: [number, number, number];
  label: string;
  sublabel?: string;
  color: string;
  status: "online" | "planned" | "offline";
  isSelected: boolean;
  isHovered: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const isOnline = status === "online";

  useFrame(() => {
    if (groupRef.current) {
      const targetY = position[1] + (isHovered ? 0.35 : isSelected ? 0.2 : 0);
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y, targetY, 0.08
      );
    }
  });

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={onClick}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; onPointerOver(); }}
      onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = "default"; onPointerOut(); }}
    >
      {/* Invisible large click hitbox — ensures reliable raycast regardless of model geometry */}
      <mesh>
        <boxGeometry args={[2.2, 3.2, 2.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <HardwareModel
        url={modelUrl}
        scale={modelScale ?? 0.1}
        position={modelOffset ?? [0, 0, 0]}
        rotation={modelRotation ?? [0, 0, 0]}
        opacity={isOnline ? 1 : 0.55}
      />

      {/* Wireframe engraved overlay for offline */}
      {!isOnline && (
        <mesh>
          <boxGeometry args={[2.5, 2.5, 2.5]} />
          <meshBasicMaterial color={color} wireframe transparent opacity={0.055} />
        </mesh>
      )}

      {/* Point light when online */}
      {isOnline && (
        <pointLight
          position={[0, 1.5, 0]}
          color={color}
          intensity={isSelected ? 5 : isHovered ? 3.5 : 1.8}
          distance={7}
          decay={2}
        />
      )}

      {/* Shadow / ground presence disc */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <circleGeometry args={[1.1, 32]} />
        <meshBasicMaterial color={color} transparent opacity={isOnline ? 0.07 : 0.02} depthWrite={false} toneMapped={false} />
      </mesh>

      {/* Selection ring */}
      {isSelected && <SelectionRing color={color} />}

      {/* Label */}
      <Text
        position={[0, 2.1, 0.5]}
        fontSize={0.17}
        color={isOnline ? "#e4e4e7" : "#555"}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.01}
        outlineColor="#000000"
      >
        {label}
      </Text>

      <Text
        position={[0, 1.82, 0.5]}
        fontSize={0.11}
        color={isOnline ? "#22c55e" : "#554444"}
        anchorX="center"
        anchorY="middle"
      >
        {isOnline ? "● ONLINE" : "○ OFFLINE"}
      </Text>

      {sublabel && (
        <Text
          position={[0, 1.58, 0.5]}
          fontSize={0.09}
          color="#555"
          anchorX="center"
          anchorY="middle"
          maxWidth={3}
        >
          {sublabel}
        </Text>
      )}
    </group>
  );
}

/* ── Service glass sphere ─────────────────────────── */
function ServiceSphere({
  position, service, visible, delay = 0,
  isSelected, isHovered, onClick, onPointerOver, onPointerOut,
}: {
  position: [number, number, number];
  service: typeof services[0];
  visible: boolean;
  delay?: number;
  isSelected: boolean;
  isHovered: boolean;
  onClick: () => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
}) {
  // Single group: scale animation. Float wraps BOTH hit sphere + visual so they stay in sync.
  const outerRef = useRef<THREE.Group>(null!);
  const catColor = CATEGORY_COLORS[service.category] || "#666";
  const isRunning = service.status === "running";

  useFrame(() => {
    if (outerRef.current) {
      const targetScale = visible ? 1 : 0;
      const curr = outerRef.current.scale.x;
      outerRef.current.scale.setScalar(curr + (targetScale - curr) * (visible ? 0.12 : 0.22));
    }
  });

  return (
    <group
      ref={outerRef}
      position={position}
      onClick={(e) => { e.stopPropagation(); if (outerRef.current && outerRef.current.scale.x > 0.1) onClick(); }}
      onPointerOver={(e) => { e.stopPropagation(); if (outerRef.current && outerRef.current.scale.x > 0.1) { document.body.style.cursor = "pointer"; onPointerOver(); } }}
      onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = "default"; onPointerOut(); }}
    >
      {/* Float wraps hit sphere + visual together — hover area always matches visual position */}
      <Float speed={1.1} floatIntensity={0.08} rotationIntensity={0}>
        {/* Invisible hit sphere — same position as visual */}
        <mesh>
          <sphereGeometry args={[0.48, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {/* Glass icosahedron orb */}
        <mesh>
          <icosahedronGeometry args={[0.36, 1]} />
          <meshPhysicalMaterial
            color={catColor}
            metalness={0}
            roughness={0.08}
            transparent
            opacity={isRunning ? 0.65 : 0.22}
            clearcoat={1.0}
            clearcoatRoughness={0.05}
            emissive={catColor}
            emissiveIntensity={isSelected ? 0.45 : isHovered ? 0.25 : (isRunning ? 0.15 : 0.03)}
          />
        </mesh>
        {/* Outer glow shell on hover/select */}
        {(isSelected || isHovered) && (
          <mesh>
            <icosahedronGeometry args={[0.44, 1]} />
            <meshBasicMaterial color={catColor} transparent opacity={0.12} toneMapped={false} />
          </mesh>
        )}
        {/* Icon */}
        <Text position={[0, 0, 0.38]} fontSize={0.21} anchorX="center" anchorY="middle">
          {service.icon}
        </Text>
        {/* Name */}
        <Text position={[0, -0.54, 0]} fontSize={0.07} color={isRunning ? "#c4c4c8" : "#444"} anchorX="center" anchorY="top" maxWidth={1.1}>
          {service.name}
        </Text>
      </Float>
    </group>
  );
}

/* ── Services radial display ─────────────────────────── */
function ServicesDisplay({
  nodePos, visible, selectedSvc, hoveredSvc, onSelectSvc, onHoverSvc, onUnhoverSvc,
}: {
  nodePos: [number, number, number];
  visible: boolean;
  selectedSvc: number | null;
  hoveredSvc: number | null;
  onSelectSvc: (i: number | null) => void;
  onHoverSvc: (i: number) => void;
  onUnhoverSvc: () => void;
}) {
  const positions = useMemo<[number, number, number][]>(() => {
    const cols = 5;
    return services.map((_, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const rowCount = Math.min(cols, services.length - row * cols);
      const xOffset = (col - (rowCount - 1) / 2) * 1.25;
      // Fan services directly above node (same z = correct depth, no z offset)
      return [
        nodePos[0] + xOffset,
        nodePos[1] + 2.0 + row * 1.2,
        nodePos[2],
      ] as [number, number, number];
    });
  }, [nodePos]);

  return (
    <>
      {services.map((svc, i) => (
        <ServiceSphere
          key={svc.name}
          position={positions[i]}
          service={svc}
          visible={visible}
          delay={i}
          isSelected={selectedSvc === i}
          isHovered={hoveredSvc === i}
          onClick={() => onSelectSvc(selectedSvc === i ? null : i)}
          onPointerOver={() => onHoverSvc(i)}
          onPointerOut={onUnhoverSvc}
        />
      ))}
    </>
  );
}

/* ── ArgoCD floating glass object ─────────────────── */
function ArgoCDObject({ position }: { position: [number, number, number] }) {
  const innerRef = useRef<THREE.Mesh>(null!);
  const outerRef = useRef<THREE.Mesh>(null!);
  const ringRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (innerRef.current) innerRef.current.rotation.y = t * 0.45;
    if (outerRef.current) { outerRef.current.rotation.y = -t * 0.18; outerRef.current.rotation.x = t * 0.12; }
    if (ringRef.current) ringRef.current.rotation.z = t * 0.3;
  });

  return (
    <Float speed={2.5} rotationIntensity={0.2} floatIntensity={0.5}>
      <group position={position}>
        <mesh ref={outerRef}>
          <icosahedronGeometry args={[0.55, 1]} />
          <meshPhysicalMaterial color="#ef7b4d" metalness={0} roughness={0} transparent opacity={0.15} clearcoat={1} clearcoatRoughness={0} emissive="#ef7b4d" emissiveIntensity={0.12} />
        </mesh>
        <mesh ref={innerRef}>
          <octahedronGeometry args={[0.28, 0]} />
          <meshPhysicalMaterial color="#ef7b4d" metalness={0.2} roughness={0.15} clearcoat={0.9} emissive="#ef7b4d" emissiveIntensity={0.55} />
        </mesh>
        <mesh ref={ringRef} rotation-x={Math.PI / 4}>
          <torusGeometry args={[0.65, 0.013, 16, 64]} />
          <meshBasicMaterial color="#ef7b4d" transparent opacity={0.65} toneMapped={false} />
        </mesh>
        <Text position={[0, -0.85, 0]} fontSize={0.1} color="#ef7b4d" anchorX="center">ArgoCD</Text>
      </group>
    </Float>
  );
}

/* ── Cilium CNI object ───────────────────────────────── */
function CiliumObject({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.z = clock.getElapsedTime() * 0.55; });
  return (
    <Float speed={1.8} floatIntensity={0.4}>
      <group position={position}>
        <mesh ref={ref}>
          <torusKnotGeometry args={[0.24, 0.07, 64, 8, 2, 3]} />
          <meshPhysicalMaterial color="#f7a800" metalness={0.3} roughness={0.2} clearcoat={0.8} emissive="#f7a800" emissiveIntensity={0.45} />
        </mesh>
        <Text position={[0, -0.62, 0]} fontSize={0.09} color="#f7a800" anchorX="center">Cilium CNI</Text>
      </group>
    </Float>
  );
}

/* ── Longhorn storage object ─────────────────────────── */
function LonghornObject({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.35;
  });
  return (
    <Float speed={1.5} floatIntensity={0.35}>
      <group position={position}>
        <group ref={ref}>
          {[0, 1, 2].map(i => (
            <mesh key={i} position={[0, (i - 1) * 0.25, 0]}>
              <cylinderGeometry args={[0.35 - i * 0.05, 0.35 - i * 0.05, 0.12, 32]} />
              <meshPhysicalMaterial color="#3b82f6" metalness={0.5} roughness={0.3} clearcoat={0.6} emissive="#3b82f6" emissiveIntensity={0.3 - i * 0.08} />
            </mesh>
          ))}
        </group>
        <Text position={[0, -0.75, 0]} fontSize={0.09} color="#3b82f6" anchorX="center">Longhorn</Text>
      </group>
    </Float>
  );
}

/* ── Main Scene ────────────────────────────────────── */
export default function Scene3D({
  onSelect,
  selectedIdx,
}: {
  onSelect: (i: number | null) => void;
  selectedIdx: number | null;
}) {
  const [selectedNode, setSelectedNode] = useState<"router" | "m2" | "gpu" | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [showAllServices, setShowAllServices] = useState(false);
  const [hoveredSvc, setHoveredSvc] = useState<number | null>(null);

  // Hardware positions (on the floor)
  const m2Pos: [number, number, number] = [-3.5, 0, 2];
  const gpuPos: [number, number, number] = [3.5, 0, 2];
  const routerPos: [number, number, number] = [0, 0, -4.5];

  // Services are ONLY shown via the toggle button — node click just shows info callout
  const showServices = showAllServices;

  const nodeInfoLines = [
    { label: "IP", value: node.ip },
    { label: "CPU", value: node.cpu },
    { label: "RAM", value: node.ram },
    { label: "OS", value: node.os },
    { label: "K8s", value: node.k8sVersion },
    { label: "Storage", value: node.storage },
  ];
  const gpuInfoLines = [
    { label: "IP", value: gpuNode.ip },
    { label: "CPU", value: gpuNode.cpu },
    { label: "GPU", value: gpuNode.gpu },
    { label: "RAM", value: gpuNode.ram },
    { label: "Status", value: gpuNode.status },
  ];
  const routerInfoLines = [
    { label: "Model", value: router.model },
    { label: "IP", value: router.ip },
    { label: "Ports", value: router.ports },
    { label: "ISP", value: router.isp },
  ];

  // Service callout anchor position (matches ServicesDisplay layout)
  const cols = 5;
  const getSvcPos = (i: number): [number, number, number] => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const rowCount = Math.min(cols, services.length - row * cols);
    return [
      m2Pos[0] + (col - (rowCount - 1) / 2) * 1.25,
      m2Pos[1] + 2.0 + row * 1.2,
      m2Pos[2],
    ];
  };

  return (
    <Canvas
      camera={{ position: [0, 7, 13], fov: 55 }}
      style={{ position: "absolute", inset: 0, background: "#07070e" }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      onPointerMissed={() => { setSelectedNode(null); onSelect(null); }}
    >
      <color attach="background" args={["#07070e"]} />
      <fog attach="fog" args={["#07070e", 20, 40]} />
      <ResponsiveCamera />

      {/* Lighting */}
      <ambientLight intensity={0.15} />
      <directionalLight position={[6, 10, 6]} intensity={0.5} color="#cce0ff" />
      <pointLight position={[0, 6, 0]} intensity={0.25} color="#3355ff" />

      <HoloGrid />
      <Particles />

      {/* Floor cables (at ground level) */}
      <FloorCable from={routerPos} to={m2Pos} color="#58a6ff" active />
      <FloorCable from={routerPos} to={gpuPos} color="#d29922" active={false} />

      {/* Glow rings at floor level (fixed, don't hover with models) */}
      <GlowRing position={[routerPos[0], 0.01, routerPos[2]]} color="#8b949e" online isSelected={selectedNode === "router"} isHovered={hoveredNode === "router"} />
      <GlowRing position={[m2Pos[0], 0.01, m2Pos[2]]} color="#58a6ff" online isSelected={selectedNode === "m2"} isHovered={hoveredNode === "m2"} />
      <GlowRing position={[gpuPos[0], 0.01, gpuPos[2]]} color="#d29922" online={false} isSelected={selectedNode === "gpu"} isHovered={hoveredNode === "gpu"} />

      {/* Router */}
      <HardwareNode
        modelUrl="/models/att_bgw320.glb"
        modelScale={0.075}
        modelRotation={[0, Math.PI * 0.25, 0]}
        position={routerPos}
        label={router.name}
        sublabel={router.ip}
        color="#8b949e"
        status="online"
        isSelected={selectedNode === "router"}
        isHovered={hoveredNode === "router"}
        onClick={(e) => { e.stopPropagation(); setSelectedNode(selectedNode === "router" ? null : "router"); }}
        onPointerOver={() => setHoveredNode("router")}
        onPointerOut={() => setHoveredNode(null)}
      />
      <CalloutPanel
        anchorPos={[routerPos[0], routerPos[1] + 1.5, routerPos[2]]}
        panelOffset={[2.2, 1.8, 0]}
        title={"📡 " + router.name}
        lines={routerInfoLines}
        color="#8b949e"
        visible={selectedNode === "router"}
        onClose={() => setSelectedNode(null)}
      />

      {/* M2 Node */}
      <HardwareNode
        modelUrl="/models/minisforum_m2.glb"
        modelScale={0.14}
        modelRotation={[0, Math.PI * 0.15, 0]}
        position={m2Pos}
        label={"M2 · " + node.ip}
        sublabel={node.cpu.split("(")[0].trim()}
        color="#58a6ff"
        status="online"
        isSelected={selectedNode === "m2"}
        isHovered={hoveredNode === "m2"}
        onClick={(e) => { e.stopPropagation(); setSelectedNode(selectedNode === "m2" ? null : "m2"); }}
        onPointerOver={() => setHoveredNode("m2")}
        onPointerOut={() => setHoveredNode(null)}
      />
      <CalloutPanel
        anchorPos={[m2Pos[0], m2Pos[1] + 1.5, m2Pos[2]]}
        panelOffset={[3.5, 2.2, 0]}
        title={"⚡ M2 Node"}
        lines={nodeInfoLines}
        color="#58a6ff"
        visible={selectedNode === "m2"}
        onClose={() => setSelectedNode(null)}
      />

      {/* GPU Node */}
      <HardwareNode
        modelUrl="/models/gpu_node.glb"
        modelScale={0.09}
        modelRotation={[0, Math.PI * 0.2, 0]}
        position={gpuPos}
        label={"GPU Node · " + gpuNode.ip}
        sublabel={gpuNode.gpu}
        color="#d29922"
        status="planned"
        isSelected={selectedNode === "gpu"}
        isHovered={hoveredNode === "gpu"}
        onClick={(e) => { e.stopPropagation(); setSelectedNode(selectedNode === "gpu" ? null : "gpu"); }}
        onPointerOver={() => setHoveredNode("gpu")}
        onPointerOut={() => setHoveredNode(null)}
      />
      <CalloutPanel
        anchorPos={[gpuPos[0], gpuPos[1] + 1.5, gpuPos[2]]}
        panelOffset={[2.8, 2.0, 0]}
        title={"🎮 GPU Node"}
        lines={gpuInfoLines}
        color="#d29922"
        visible={selectedNode === "gpu"}
        onClose={() => setSelectedNode(null)}
      />

      {/* Floating infra objects */}
      <ArgoCDObject position={[4.5, 4.5, -1]} />
      <CiliumObject position={[-4.5, 4, -1]} />
      <LonghornObject position={[0, 5.5, -2]} />

      {/* Services display (above M2 when selected or toggled) */}
      <ServicesDisplay
        nodePos={m2Pos}
        visible={showServices}
        selectedSvc={selectedIdx}
        hoveredSvc={hoveredSvc}
        onSelectSvc={(i) => { onSelect(i); }}
        onHoverSvc={(i) => setHoveredSvc(i)}
        onUnhoverSvc={() => setHoveredSvc(null)}
      />

      {/* Service callout panel */}
      {selectedIdx !== null && services[selectedIdx] && (function() {
        const svcPos = getSvcPos(selectedIdx) as [number, number, number];
        return (
          <CalloutPanel
            anchorPos={svcPos}
            panelOffset={[1.8, 0.5, 0]}
            title={services[selectedIdx].icon + " " + services[selectedIdx].name}
            lines={[
              { label: "IP", value: services[selectedIdx].ip },
              { label: "Port", value: String(services[selectedIdx].port) },
              { label: "NS", value: services[selectedIdx].namespace },
              { label: "Status", value: services[selectedIdx].status },
            ]}
            color={services[selectedIdx].color}
            visible
            onClose={() => onSelect(null)}
          />
        );
      })()}

      {/* Services toggle button */}
      <Html fullscreen>
        <div style={{ position: "absolute", top: 14, right: 14, zIndex: 50 }}>
          <button
            onClick={() => setShowAllServices((v) => !v)}
            style={{
              background: showAllServices ? "rgba(88,166,255,0.18)" : "rgba(10,10,20,0.75)",
              border: `1px solid ${showAllServices ? "#58a6ff" : "#333"}`,
              borderRadius: 8,
              color: showAllServices ? "#58a6ff" : "#777",
              padding: "7px 14px",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
              backdropFilter: "blur(8px)",
              letterSpacing: 1,
            }}
          >
            {showAllServices ? "◉ SERVICES ON" : "○ SERVICES OFF"}
          </button>
        </div>
      </Html>

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        minDistance={4}
        maxDistance={24}
        target={[0, 1.5, 0]}
        makeDefault
      />

      <EffectComposer>
        <Bloom luminanceThreshold={0.35} luminanceSmoothing={0.85} intensity={0.5} />
        <Vignette eskil={false} offset={0.1} darkness={0.7} />
      </EffectComposer>
    </Canvas>
  );
}

// Preload GLB models
useGLTF.preload("/models/minisforum_m2.glb");
useGLTF.preload("/models/att_bgw320.glb");
useGLTF.preload("/models/gpu_node.glb");
