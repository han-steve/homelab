"use client";

import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import {
  OrbitControls,
  Text,
  Html,
  RoundedBox,
  Float,
  useGLTF,
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
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, -2.05, 0]} raycast={() => {}}>
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
function Particles({ count = 200 }: { count?: number }) {
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

/* ── flowing network pipe ──────────────────────────── */
function NetworkPipe({
  start, end, color = "#3fb950", active = true, dashed = false
}: {
  start: [number, number, number];
  end: [number, number, number];
  color?: string;
  active?: boolean;
  dashed?: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  const tubeRef = useRef<THREE.TubeGeometry>(null!);

  const { curve, length } = useMemo(() => {
    const s = new THREE.Vector3(...start);
    const e = new THREE.Vector3(...end);
    const mid = new THREE.Vector3().addVectors(s, e).multiplyScalar(0.5);
    mid.y += 0.5;
    const c = new THREE.QuadraticBezierCurve3(s, mid, e);
    return { curve: c, length: c.getLength() };
  }, [start, end]);

  useFrame(({ clock }) => {
    if (ref.current && active) {
      const mat = ref.current.material as THREE.MeshBasicMaterial;
      if (mat.map) {
        mat.map.offset.x = -clock.getElapsedTime() * 0.3;
      }
    }
  });

  const flowTex = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 4;
    const ctx = canvas.getContext("2d")!;
    for (let x = 0; x < 256; x++) {
      const a = Math.pow(Math.sin((x / 256) * Math.PI * 4), 2) * 0.8;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(x, 0, 1, 4);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(3, 1);
    return tex;
  }, []);

  return (
    <mesh ref={ref} raycast={() => {}}>
      <tubeGeometry ref={tubeRef} args={[curve, 32, 0.02, 8, false]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={active ? 0.6 : 0.15}
        map={active ? flowTex : null}
        toneMapped={false}
      />
    </mesh>
  );
}

/* ── overlay tooltip (HTML in 3D) ──────────────────── */
function InfoOverlay({
  position, title, lines, color, visible, onClose
}: {
  position: [number, number, number];
  title: string;
  lines: { label: string; value: string }[];
  color: string;
  visible: boolean;
  onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <Html position={position} center distanceFactor={8} zIndexRange={[100, 0]}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "rgba(15,15,20,0.92)",
          border: `1px solid ${color}40`,
          borderRadius: 10,
          padding: "14px 18px",
          minWidth: 200,
          maxWidth: 280,
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
          fontSize: 11,
          color: "#e4e4e7",
          boxShadow: `0 0 20px ${color}20, 0 4px 20px rgba(0,0,0,0.5)`,
          backdropFilter: "blur(8px)",
          pointerEvents: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ color, fontWeight: 700, fontSize: 13 }}>{title}</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
        <div style={{ borderTop: `1px solid ${color}20`, paddingTop: 8 }}>
          {lines.map((l, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", gap: 12 }}>
              <span style={{ color: "#888", textTransform: "uppercase", letterSpacing: 1, flexShrink: 0, whiteSpace: "nowrap" }}>{l.label}</span>
              <span style={{ color: "#d4d4d8", textAlign: "right" }}>{l.value}</span>
            </div>
          ))}
        </div>
      </div>
    </Html>
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
    <primitive
      object={cloned}
      scale={scale}
      position={position}
      rotation={rotation}
    />
  );
}

/* ── 3D Node Box ───────────────────────────────────── */
function NodeBox({
  position, label, icon, color, status, isSelected, isHovered,
  onClick, onPointerOver, onPointerOut, children
}: {
  position: [number, number, number];
  label: string;
  icon: string;
  color: string;
  status: "online" | "planned" | "offline";
  isSelected: boolean;
  isHovered: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
  children?: React.ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      const target = isHovered ? 0.05 : 0;
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y, position[1] + target, 0.1
      );
      if (isSelected && glowRef.current) {
        const s = 1 + Math.sin(clock.getElapsedTime() * 2) * 0.03;
        glowRef.current.scale.set(s, s, s);
      }
    }
  });

  const isOnline = status === "online";
  const emissive = isOnline ? color : "#000000";
  const opacity = status === "planned" ? 0.4 : 1;

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      {/* Main box */}
      <RoundedBox args={[1.8, 1, 1.2]} radius={0.08} smoothness={4}>
        <meshPhysicalMaterial
          color={isOnline ? "#1a1a2e" : "#111118"}
          metalness={0.5}
          roughness={0.3}
          clearcoat={0.5}
          clearcoatRoughness={0.2}
          emissive={emissive}
          emissiveIntensity={isSelected ? 0.15 : isHovered ? 0.08 : 0.03}
          transparent={!isOnline}
          opacity={opacity}
        />
      </RoundedBox>

      {/* Selection glow ring */}
      {isSelected && (
        <mesh ref={glowRef}>
          <torusGeometry args={[1.1, 0.02, 16, 64]} />
          <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.6} />
        </mesh>
      )}

      {/* Icon */}
      <Text
        position={[0, 0.15, 0.61]}
        fontSize={0.35}
        anchorX="center"
        anchorY="middle"
      >
        {icon}
      </Text>

      {/* Label */}
      <Text
        position={[0, -0.25, 0.61]}
        fontSize={0.12}
        color={isOnline ? "#e4e4e7" : "#666"}
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>

      {/* Status dot */}
      <StatusDot position={[0.75, 0.35, 0.61]} status={isOnline ? "online" : status} />

      {/* Color accent strip */}
      <mesh position={[0, -0.49, 0]}>
        <boxGeometry args={[1.8, 0.03, 1.2]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={isOnline ? 0.8 : 0.2} />
      </mesh>

      {children}
    </group>
  );
}

/* ── Service App Object ────────────────────────────── */
function ServiceObject({
  position, service, index, isSelected, isHovered,
  onClick, onPointerOver, onPointerOut
}: {
  position: [number, number, number];
  service: typeof services[0];
  index: number;
  isSelected: boolean;
  isHovered: boolean;
  onClick: () => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
}) {
  const ref = useRef<THREE.Group>(null!);

  useFrame(({ clock }) => {
    if (ref.current) {
      const hover = isHovered ? 0.08 : 0;
      ref.current.position.y = THREE.MathUtils.lerp(ref.current.position.y, position[1] + hover, 0.1);
      if (isSelected) {
        ref.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.5) * 0.05;
      }
    }
  });

  const catColor = CATEGORY_COLORS[service.category] || "#666";
  const isRunning = service.status === "running";

  return (
    <group
      ref={ref}
      position={position}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={(e) => { e.stopPropagation(); onPointerOver(); }}
      onPointerOut={(e) => { e.stopPropagation(); onPointerOut(); }}
    >
      {/* Main body */}
      <RoundedBox args={[1.1, 0.7, 0.7]} radius={0.06} smoothness={4}>
        <meshPhysicalMaterial
          color="#141420"
          metalness={0.4}
          roughness={0.35}
          clearcoat={0.6}
          emissive={service.color}
          emissiveIntensity={isSelected ? 0.2 : isHovered ? 0.1 : 0.02}
        />
      </RoundedBox>

      {/* Selection ring */}
      {isSelected && (
        <mesh>
          <torusGeometry args={[0.65, 0.015, 16, 48]} />
          <meshBasicMaterial color={service.color} toneMapped={false} transparent opacity={0.7} />
        </mesh>
      )}

      {/* Category side strip */}
      <mesh position={[-0.54, 0, 0]}>
        <boxGeometry args={[0.03, 0.7, 0.7]} />
        <meshBasicMaterial color={catColor} toneMapped={false} transparent opacity={0.7} />
      </mesh>

      {/* Icon on top face */}
      <Text position={[0, 0.36, 0]} rotation-x={-Math.PI / 2} fontSize={0.22} anchorX="center" anchorY="middle">
        {service.icon}
      </Text>

      {/* Name below box */}
      <Text
        position={[0, -0.48, 0]}
        fontSize={0.08}
        color={isRunning ? "#d4d4d8" : "#666"}
        anchorX="center"
        anchorY="top"
      >
        {service.name}
      </Text>

      {/* Status dot */}
      <StatusDot position={[0.42, 0.25, 0.36]} status={service.status} />
    </group>
  );
}

/* ── ArgoCD Glassy Logo Object ─────────────────────── */
function ArgoCDObject({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.getElapsedTime() * 0.3;
    }
  });
  return (
    <Float speed={2} rotationIntensity={0.3} floatIntensity={0.4}>
      <group position={position}>
        <mesh ref={ref}>
          <octahedronGeometry args={[0.3, 0]} />
          <meshPhysicalMaterial
            color="#ef7b4d"
            metalness={0.1}
            roughness={0.1}
            transparent
            opacity={0.6}
            clearcoat={1.0}
            clearcoatRoughness={0.05}
            emissive="#ef7b4d"
            emissiveIntensity={0.3}
          />
        </mesh>
        <Text position={[0, -0.45, 0]} fontSize={0.07} color="#ef7b4d" anchorX="center">
          ArgoCD
        </Text>
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
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [overlayTarget, setOverlayTarget] = useState<string | null>(null);

  // Layout positions
  const m2Pos: [number, number, number] = [-1.5, 0.5, 0];
  const gpuPos: [number, number, number] = [1.5, 0.5, 0];
  const routerPos: [number, number, number] = [0, 2.5, 0];

  // Service positions — grid layout below nodes
  const cols = 6;
  const svcPositions: [number, number, number][] = services.map((_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const rowCount = Math.min(cols, services.length - row * cols);
    const offset = (cols - rowCount) * 0.65;
    return [(col - (cols - 1) / 2) * 1.3 + offset, -1.2 - row * 1.1, 0] as [number, number, number];
  });

  // Pipe connections
  const pipeConnections = useMemo(() => [
    { start: routerPos, end: m2Pos, color: "#58a6ff", active: true },
    { start: routerPos, end: gpuPos, color: "#d29922", active: false, dashed: true },
    { start: m2Pos, end: gpuPos, color: "#d29922", active: false, dashed: true },
    ...services.slice(0, Math.min(services.length, 12)).map((_, i) => ({
      start: m2Pos as [number, number, number],
      end: svcPositions[i],
      color: "#3fb950",
      active: true,
    })),
  ], []);

  const nodeInfoLines = [
    { label: "IP", value: node.ip },
    { label: "CPU", value: node.cpu },
    { label: "RAM", value: node.ram },
    { label: "OS", value: node.os },
    { label: "K8s", value: node.k8sVersion },
    { label: "Storage", value: node.storage },
    { label: "NICs", value: "2x 2.5 GbE" },
  ];

  const gpuInfoLines = [
    { label: "IP", value: gpuNode.ip },
    { label: "CPU", value: gpuNode.cpu },
    { label: "GPU", value: gpuNode.gpu },
    { label: "RAM", value: gpuNode.ram },
    { label: "NIC", value: gpuNode.nic },
    { label: "Status", value: gpuNode.status },
  ];

  const routerInfoLines = [
    { label: "Model", value: router.model },
    { label: "IP", value: router.ip },
    { label: "Ports", value: router.ports },
    { label: "ISP", value: router.isp },
  ];

  return (
    <Canvas
      camera={{ position: [0, 1, 10], fov: 50 }}
      style={{ background: "#08080f" }}
      gl={{ antialias: true }}
      onPointerMissed={() => { onSelect(null); setOverlayTarget(null); }}
    >
      <color attach="background" args={["#08080f"]} />
      <fog attach="fog" args={["#08080f", 14, 28]} />
      <ResponsiveCamera />
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 8, 5]} intensity={0.6} />
      <pointLight position={[-3, 3, 2]} intensity={0.4} color="#4488ff" />

      <HoloGrid />
      <Particles />

      {/* Router */}
      <NodeBox
        position={routerPos}
        label={router.name}
        icon=""
        color="#8b949e"
        status="online"
        isSelected={overlayTarget === "router"}
        isHovered={hoveredNode === "router"}
        onClick={(e) => { e.stopPropagation(); setOverlayTarget(overlayTarget === "router" ? null : "router"); }}
        onPointerOver={() => setHoveredNode("router")}
        onPointerOut={() => setHoveredNode(null)}
      >
        <HardwareModel url="/models/att_bgw320.glb" scale={0.065} position={[0, -0.3, 0]} rotation={[0, Math.PI * 0.25, 0]} />
      </NodeBox>
      <InfoOverlay
        position={[routerPos[0] + 1.5, routerPos[1] + 0.8, routerPos[2]]}
        title={"📡 " + router.name}
        lines={routerInfoLines}
        color="#8b949e"
        visible={overlayTarget === "router"}
        onClose={() => setOverlayTarget(null)}
      />

      {/* M2 Node */}
      <NodeBox
        position={m2Pos}
        label={"M2 · " + node.ip}
        icon=""
        color="#58a6ff"
        status="online"
        isSelected={overlayTarget === "m2"}
        isHovered={hoveredNode === "m2"}
        onClick={(e) => { e.stopPropagation(); setOverlayTarget(overlayTarget === "m2" ? null : "m2"); }}
        onPointerOver={() => setHoveredNode("m2")}
        onPointerOut={() => setHoveredNode(null)}
      >
        <HardwareModel url="/models/minisforum_m2.glb" scale={0.09} position={[0, -0.15, 0]} rotation={[0, Math.PI * 0.15, 0]} />
      </NodeBox>
      <InfoOverlay
        position={[m2Pos[0] - 1.5, m2Pos[1] + 0.8, m2Pos[2]]}
        title={"⚡ M2 Node"}
        lines={nodeInfoLines}
        color="#58a6ff"
        visible={overlayTarget === "m2"}
        onClose={() => setOverlayTarget(null)}
      />

      {/* GPU Node */}
      <NodeBox
        position={gpuPos}
        label={"GPU · " + gpuNode.ip}
        icon=""
        color="#d29922"
        status="planned"
        isSelected={overlayTarget === "gpu"}
        isHovered={hoveredNode === "gpu"}
        onClick={(e) => { e.stopPropagation(); setOverlayTarget(overlayTarget === "gpu" ? null : "gpu"); }}
        onPointerOver={() => setHoveredNode("gpu")}
        onPointerOut={() => setHoveredNode(null)}
      >
        <HardwareModel url="/models/gpu_node.glb" scale={0.055} position={[0, -0.3, 0]} rotation={[0, Math.PI * 0.2, 0]} opacity={0.6} />
      </NodeBox>
      <InfoOverlay
        position={[gpuPos[0] + 1.5, gpuPos[1] + 0.8, gpuPos[2]]}
        title={"🎮 GPU Node"}
        lines={gpuInfoLines}
        color="#d29922"
        visible={overlayTarget === "gpu"}
        onClose={() => setOverlayTarget(null)}
      />

      {/* ArgoCD floating logo */}
      <ArgoCDObject position={[3.5, 1.5, -1]} />

      {/* Network pipes */}
      {pipeConnections.map((pipe, i) => (
        <NetworkPipe key={i} {...pipe} />
      ))}

      {/* Services */}
      {services.map((svc, i) => (
        <ServiceObject
          key={svc.name}
          position={svcPositions[i]}
          service={svc}
          index={i}
          isSelected={selectedIdx === i}
          isHovered={hoveredNode === `svc-${i}`}
          onClick={() => { onSelect(selectedIdx === i ? null : i); setOverlayTarget(null); }}
          onPointerOver={() => setHoveredNode(`svc-${i}`)}
          onPointerOut={() => setHoveredNode(null)}
        />
      ))}

      {/* Service info overlays */}
      {selectedIdx !== null && services[selectedIdx] && (
        <InfoOverlay
          position={[
            svcPositions[selectedIdx][0],
            svcPositions[selectedIdx][1] + 0.7,
            svcPositions[selectedIdx][2],
          ]}
          title={services[selectedIdx].icon + " " + services[selectedIdx].name}
          lines={[
            { label: "IP", value: services[selectedIdx].ip },
            { label: "Port", value: String(services[selectedIdx].port) },
            { label: "NS", value: services[selectedIdx].namespace },
            { label: "Cat", value: services[selectedIdx].category },
            { label: "Status", value: services[selectedIdx].status },
          ]}
          color={services[selectedIdx].color}
          visible={true}
          onClose={() => onSelect(null)}
        />
      )}

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        minDistance={3}
        maxDistance={18}
        target={[0, 0.5, 0]}
        makeDefault
      />

      <EffectComposer>
        <Bloom luminanceThreshold={0.3} luminanceSmoothing={0.9} intensity={0.5} />
        <Vignette eskil={false} offset={0.1} darkness={0.8} />
      </EffectComposer>
    </Canvas>
  );
}

// Preload GLB models for instant display
useGLTF.preload("/models/minisforum_m2.glb");
useGLTF.preload("/models/att_bgw320.glb");
useGLTF.preload("/models/gpu_node.glb");
