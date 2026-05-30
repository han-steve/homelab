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
    cam.fov = size.width < 640 ? 72 : size.width < 1024 ? 62 : 55;
    cam.updateProjectionMatrix();
  }, [camera, size.width]);
  return null;
}

/* ── Camera fly-in on mount ────────────────────────── */
function CameraFlyIn() {
  const { camera } = useThree();
  const started = useRef(false);
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    if (!started.current) {
      camera.position.set(0, 22, 32);
      started.current = true;
    }
    const targetX = 0, targetY = 8, targetZ = 14;
    const spd = 0.035;
    camera.position.x += (targetX - camera.position.x) * spd;
    camera.position.y += (targetY - camera.position.y) * spd;
    camera.position.z += (targetZ - camera.position.z) * spd;
    // Stop animating when close enough
    const dist = Math.abs(camera.position.z - targetZ);
    if (dist < 0.05) done.current = true;
  });
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
            // Slow scan line moving across the grid
            float scanY = fract(vUv.y * 0.5 - uTime * 0.04);
            float scan = exp(-scanY * 18.0) * 0.35;
            // Secondary faster scan
            float scanX = fract(vUv.x * 0.5 - uTime * 0.025);
            float scanX2 = exp(-scanX * 22.0) * 0.15;
            float a = (line * 0.14 + scan + scanX2) * fade;
            gl_FragColor = vec4(0.18, 0.46, 1.0, a);
          }
        `}
      />
    </mesh>
  );
}

/* ── floating particles / starfield ────────────────────────────── */
function Particles() {
  const nearRef = useRef<THREE.Points>(null!);
  const farRef = useRef<THREE.Points>(null!);

  // Near particles — larger, visible dust
  const nearPositions = useMemo(() => {
    const p = new Float32Array(120 * 3);
    for (let i = 0; i < 120; i++) {
      p[i * 3] = (Math.random() - 0.5) * 22;
      p[i * 3 + 1] = Math.random() * 9 - 1.5;
      p[i * 3 + 2] = (Math.random() - 0.5) * 22;
    }
    return p;
  }, []);

  // Far starfield — tiny, wide spread
  const farPositions = useMemo(() => {
    const p = new Float32Array(400 * 3);
    for (let i = 0; i < 400; i++) {
      p[i * 3] = (Math.random() - 0.5) * 80;
      p[i * 3 + 1] = Math.random() * 40 - 5;
      p[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    return p;
  }, []);

  useFrame(({ clock }) => {
    if (nearRef.current) nearRef.current.rotation.y = clock.getElapsedTime() * 0.008;
    if (farRef.current) farRef.current.rotation.y = clock.getElapsedTime() * 0.003;
  });

  return (
    <>
      <points ref={nearRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[nearPositions, 3]} count={120} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.03} color="#5588ff" transparent opacity={0.45} sizeAttenuation />
      </points>
      <points ref={farRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[farPositions, 3]} count={400} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.018} color="#aaccff" transparent opacity={0.25} sizeAttenuation />
      </points>
    </>
  );
}

/* ── data packet travelling along a cable ─────────────────────── */
function DataPacket({ curve, color, speed = 0.2, reverse = false, offset = 0 }: {
  curve: THREE.QuadraticBezierCurve3;
  color: string;
  speed?: number;
  reverse?: boolean;
  offset?: number;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (ref.current) {
      const raw = (clock.getElapsedTime() * speed + offset) % 1;
      const t = reverse ? 1 - raw : raw;
      const pos = curve.getPoint(t);
      ref.current.position.copy(pos);
      ref.current.position.y = 0.1;
    }
  });
  return (
    <mesh ref={ref} raycast={() => {}}>
      <sphereGeometry args={[0.06, 8, 8]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

/* ── radar scan ring emanating from origin ───────────── */
/* ── Pulsing floor health aura under M2 ───────────────── */
function FloorHealthAura({ position, color = "#22d3ee" }: { position: [number, number, number]; color?: string }) {
  const innerRef = useRef<THREE.Mesh>(null!);
  const outerRef = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.2);
    if (innerRef.current) {
      (innerRef.current.material as THREE.MeshBasicMaterial).opacity = 0.10 + pulse * 0.08;
    }
    if (outerRef.current) {
      (outerRef.current.material as THREE.MeshBasicMaterial).opacity = 0.04 + pulse * 0.04;
    }
  });
  return (
    <group position={[position[0], 0.005, position[2]]}>
      {/* Inner bright core */}
      <mesh ref={innerRef} rotation-x={-Math.PI / 2} raycast={() => {}}>
        <circleGeometry args={[1.2, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} toneMapped={false} />
      </mesh>
      {/* Outer soft halo */}
      <mesh ref={outerRef} rotation-x={-Math.PI / 2} raycast={() => {}}>
        <circleGeometry args={[2.6, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.05} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ── CPU arc gauge floating above M2 ──────────────────── */
function CpuArcGauge({ position, cpuPct, ramPct }: { position: [number, number, number]; cpuPct: number; ramPct?: number }) {
  const arcRef = useRef<THREE.Mesh>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);
  const arcColor = cpuPct > 80 ? "#ef4444" : cpuPct > 50 ? "#eab308" : "#22c55e";
  // Build arc geometry from 0 to cpuPct%
  const arc = useMemo(() => {
    const start = -Math.PI * 0.75; // -135 degrees
    const range = Math.PI * 1.5;  // 270 degree sweep
    const end = start + range * (Math.max(0, Math.min(100, cpuPct)) / 100);
    const curve = new THREE.EllipseCurve(0, 0, 1.5, 1.5, start, end, false, 0);
    const pts = curve.getSpacedPoints(64);
    const geom = new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p.x, p.y, 0)));
    return geom;
  }, [cpuPct]);
  const bgArc = useMemo(() => {
    const start = -Math.PI * 0.75;
    const end = start + Math.PI * 1.5;
    const curve = new THREE.EllipseCurve(0, 0, 1.5, 1.5, start, end, false, 0);
    const pts = curve.getSpacedPoints(64);
    return new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p.x, p.y, 0)));
  }, []);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = 0.6 + 0.4 * Math.sin(t * 2);
    if (arcRef.current) (arcRef.current.material as THREE.LineBasicMaterial).opacity = 0.6 + pulse * 0.3;
    if (glowRef.current) (glowRef.current.material as THREE.LineBasicMaterial).opacity = 0.15 + pulse * 0.15;
  });
  return (
    <group position={[position[0], position[1] + 1.8, position[2]]} rotation-x={Math.PI / 8}>
      {/* BG arc track */}
      <lineSegments geometry={bgArc} renderOrder={1}>
        <lineBasicMaterial color="#1f2937" transparent opacity={0.5} linewidth={2} toneMapped={false} />
      </lineSegments>
      {/* Glow wider arc */}
      <lineSegments ref={glowRef} geometry={arc} renderOrder={2}>
        <lineBasicMaterial color={arcColor} transparent opacity={0.2} linewidth={4} toneMapped={false} />
      </lineSegments>
      {/* Main arc */}
      <lineSegments ref={arcRef} geometry={arc} renderOrder={3}>
        <lineBasicMaterial color={arcColor} transparent opacity={0.8} linewidth={2} toneMapped={false} />
      </lineSegments>
      {/* CPU % text label in center */}
      <Text position={[0, 0, 0]} fontSize={0.32} color={arcColor} anchorX="center" anchorY="middle" toneMapped={false}>
        {`${cpuPct}%`}
      </Text>
      <Text position={[0, -0.45, 0]} fontSize={0.14} color="#374151" anchorX="center" anchorY="middle" toneMapped={false}>
        CPU
      </Text>
    </group>
  );
}

/* ── RAM arc gauge ────────────────────────────────────── */
function RamArcGauge({ position, ramPct }: { position: [number, number, number]; ramPct: number }) {
  const arcRef = useRef<THREE.Line>(null!);
  const ramColor = ramPct > 80 ? "#ef4444" : ramPct > 60 ? "#f97316" : "#06b6d4";
  const arc = useMemo(() => {
    const start = -Math.PI * 0.75;
    const range = Math.PI * 1.5;
    const end = start + range * (Math.max(0, Math.min(100, ramPct)) / 100);
    const curve = new THREE.EllipseCurve(0, 0, 1.5, 1.5, start, end, false, 0);
    const pts = curve.getSpacedPoints(64);
    return new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p.x, p.y, 0)));
  }, [ramPct]);
  const bgArc = useMemo(() => {
    const start = -Math.PI * 0.75;
    const end = start + Math.PI * 1.5;
    const curve = new THREE.EllipseCurve(0, 0, 1.5, 1.5, start, end, false, 0);
    const pts = curve.getSpacedPoints(64);
    return new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p.x, p.y, 0)));
  }, []);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = 0.6 + 0.4 * Math.sin(t * 1.7 + 1.2);
    if (arcRef.current) (arcRef.current.material as THREE.LineBasicMaterial).opacity = 0.5 + pulse * 0.3;
  });
  return (
    <group position={[position[0] + 3.5, position[1] + 1.8, position[2]]} rotation-x={Math.PI / 8}>
      <lineSegments geometry={bgArc}>
        <lineBasicMaterial color="#1f2937" transparent opacity={0.5} linewidth={2} toneMapped={false} />
      </lineSegments>
      <lineSegments ref={arcRef} geometry={arc}>
        <lineBasicMaterial color={ramColor} transparent opacity={0.7} linewidth={2} toneMapped={false} />
      </lineSegments>
      <Text position={[0, 0, 0]} fontSize={0.32} color={ramColor} anchorX="center" anchorY="middle" toneMapped={false}>
        {`${ramPct}%`}
      </Text>
      <Text position={[0, -0.45, 0]} fontSize={0.14} color="#374151" anchorX="center" anchorY="middle" toneMapped={false}>
        RAM
      </Text>
    </group>
  );
}

function LightningArc({ from, to, intensity = 1 }: { from: THREE.Vector3; to: THREE.Vector3; intensity?: number }) {
  const lineRef = useRef<THREE.Line>(null!);
  const segCount = 8;
  const positions = useMemo(() => new Float32Array((segCount + 1) * 3), []);
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    // Flicker rapidly — show/hide based on sine
    const flicker = Math.sin(t * 18 + Math.random()) > (1 - intensity * 0.6);
    if (lineRef.current) lineRef.current.visible = flicker;
    if (!flicker) return;

    // Build jagged path from → to
    const spread = 0.6 * intensity;
    for (let i = 0; i <= segCount; i++) {
      const frac = i / segCount;
      const x = from.x + (to.x - from.x) * frac + (i > 0 && i < segCount ? (Math.random() - 0.5) * spread : 0);
      const y = from.y + (to.y - from.y) * frac + (i > 0 && i < segCount ? (Math.random() - 0.5) * spread * 0.6 : 0);
      const z = from.z + (to.z - from.z) * frac + (i > 0 && i < segCount ? (Math.random() - 0.5) * spread * 0.4 : 0);
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }
    geom.attributes.position.needsUpdate = true;
  });

  return (
    <line ref={lineRef} geometry={geom} renderOrder={10}>
      <lineBasicMaterial color="#facc15" transparent opacity={0.7 * intensity} linewidth={2} toneMapped={false} />
    </line>
  );
}

function ScanRing({ origin, color = "#22d3ee", period = 8 }: {
  origin: [number, number, number];
  color?: string;
  period?: number;
}) {
  const ringsRef = useRef<(THREE.Mesh | null)[]>([null, null, null]);
  const N = 3;
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    for (let i = 0; i < N; i++) {
      const mesh = ringsRef.current[i];
      if (!mesh) continue;
      const phase = ((t / period) + i / N) % 1;
      const radius = phase * 12;
      mesh.scale.set(radius, radius, radius);
      (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1 - phase) * 0.18);
    }
  });
  return (
    <group position={origin}>
      {Array.from({ length: N }).map((_, i) => (
        <mesh key={i} ref={el => { ringsRef.current[i] = el; }} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} raycast={() => {}}>
          <ringGeometry args={[0.9, 1, 64]} />
          <meshBasicMaterial color={color} transparent opacity={0} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}


/* ── floor-level glowing ethernet cable ─────────────── */
function FloorCable({
  from, to, color = "#58a6ff", active = true, speed = 0.18, bidir = false
}: {
  from: [number, number, number];
  to: [number, number, number];
  color?: string;
  active?: boolean;
  speed?: number;
  bidir?: boolean;
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
      {/* Data packet: a tiny glowing sphere that travels the cable */}
      {active && <DataPacket curve={curve} color={color} speed={speed} />}
      {active && bidir && <DataPacket curve={curve} color={color} speed={speed * 0.8} reverse offset={0.5} />}
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

/* ── Orbit ring for selected service sphere ────────── */
function SelectionOrbitRing({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.getElapsedTime() * 1.8;
      ref.current.rotation.z = Math.sin(clock.getElapsedTime() * 0.8) * 0.4;
    }
  });
  return (
    <mesh ref={ref}>
      <torusGeometry args={[0.52, 0.015, 8, 64]} />
      <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.8} />
    </mesh>
  );
}

/* ── Heartbeat pulse ring for online nodes ─────────── */
function PulseRing({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = (clock.getElapsedTime() * 0.55) % 1;
    ref.current.scale.setScalar(1 + t * 1.6);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.35;
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
      <torusGeometry args={[1.0, 0.02, 8, 64]} />
      <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.35} depthWrite={false} />
    </mesh>
  );
}

/* ── Callout panel: square marker → dashed line → floating dialog ── */
function CalloutPanel({
  anchorPos, panelOffset, title, lines, color, visible, onClose, link
}: {
  anchorPos: [number, number, number];
  panelOffset: [number, number, number];
  title: string;
  lines: { label: string; value: string }[];
  color: string;
  visible: boolean;
  onClose: () => void;
  link?: string;
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
            {lines.map((l, i) => {
              // Extract percentage for progress bar on CPU use / RAM use lines
              const pctMatch = l.value.match(/\((\d+)%\)/);
              const pct = pctMatch ? parseInt(pctMatch[1], 10) : null;
              const isMetric = pct !== null && (l.label.toLowerCase().includes("cpu") || l.label.toLowerCase().includes("ram"));
              return (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "2.5px 0", gap: 12 }}>
                    <span style={{ color: "#666", textTransform: "uppercase", letterSpacing: 1, flexShrink: 0, fontSize: 10 }}>{l.label}</span>
                    <span style={{ color: "#d4d4d8", textAlign: "right", fontSize: 11 }}>{l.value}</span>
                  </div>
                  {isMetric && (
                    <div style={{ height: 3, background: `${color}18`, borderRadius: 2, marginBottom: 3, overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${Math.min(pct!, 100)}%`,
                        background: pct! > 80 ? "#ef4444" : pct! > 60 ? "#eab308" : color,
                        borderRadius: 2,
                        transition: "width 0.5s ease",
                      }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                marginTop: 10,
                padding: "5px 10px",
                borderRadius: 5,
                background: `${color}18`,
                border: `1px solid ${color}30`,
                color,
                fontSize: 10,
                textAlign: "center",
                textDecoration: "none",
                fontFamily: "inherit",
                letterSpacing: 0.5,
              }}
            >
              Open →
            </a>
          )}
        </div>
      </Html>
    </group>
  );
}

/* ── CPU usage arc ring near M2 ─────────────────────── */
function CpuArcRing({ position, cpuPct, ramPct }: {
  position: [number, number, number];
  cpuPct: number;
  ramPct: number;
}) {
  const cpuRef = useRef<THREE.Mesh>(null!);
  const ramRef = useRef<THREE.Mesh>(null!);

  const buildArc = (pct: number, radius: number) => {
    const points: THREE.Vector3[] = [];
    const end = (pct / 100) * Math.PI * 2;
    const segments = Math.max(4, Math.floor(pct / 2));
    for (let i = 0; i <= segments; i++) {
      const a = -Math.PI / 2 + (i / segments) * end;
      points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    return new THREE.CatmullRomCurve3(points);
  };

  const cpuCurve = useMemo(() => buildArc(cpuPct, 1.45), [cpuPct]);
  const ramCurve = useMemo(() => buildArc(ramPct, 1.65), [ramPct]);

  const cpuGeo = useMemo(() => cpuPct > 0 ? new THREE.TubeGeometry(cpuCurve, Math.max(4, Math.floor(cpuPct / 2)), 0.015, 6, false) : null, [cpuCurve, cpuPct]);
  const ramGeo = useMemo(() => ramPct > 0 ? new THREE.TubeGeometry(ramCurve, Math.max(4, Math.floor(ramPct / 2)), 0.015, 6, false) : null, [ramCurve, ramPct]);

  if (!cpuGeo && !ramGeo) return null;

  const cpuColor = cpuPct > 80 ? "#ef4444" : cpuPct > 60 ? "#eab308" : "#58a6ff";
  const ramColor = ramPct > 80 ? "#ef4444" : ramPct > 60 ? "#eab308" : "#06b6d4";

  return (
    <group position={[position[0], 0.06, position[2]]}>
      {/* Background rings */}
      <mesh rotation-x={-Math.PI / 2}>
        <torusGeometry args={[1.45, 0.008, 4, 64]} />
        <meshBasicMaterial color="#1a2030" transparent opacity={0.5} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2}>
        <torusGeometry args={[1.65, 0.008, 4, 64]} />
        <meshBasicMaterial color="#1a2030" transparent opacity={0.5} />
      </mesh>
      {/* CPU arc */}
      {cpuGeo && (
        <mesh ref={cpuRef} geometry={cpuGeo} rotation-x={-Math.PI / 2}>
          <meshBasicMaterial color={cpuColor} toneMapped={false} transparent opacity={0.85} />
        </mesh>
      )}
      {/* RAM arc */}
      {ramGeo && (
        <mesh ref={ramRef} geometry={ramGeo} rotation-x={-Math.PI / 2}>
          <meshBasicMaterial color={ramColor} toneMapped={false} transparent opacity={0.85} />
        </mesh>
      )}
    </group>
  );
}

/* ── Refresh countdown sweep arc ────────────────────── */
function RefreshArc({ position, progress }: { position: [number, number, number]; progress: number }) {
  const geo = useMemo(() => {
    if (progress <= 0) return null;
    const pct = Math.min(progress, 1) * 100;
    const points: THREE.Vector3[] = [];
    const end = (pct / 100) * Math.PI * 2;
    const segments = Math.max(4, Math.floor(pct / 1.5));
    const r = 1.85;
    for (let i = 0; i <= segments; i++) {
      const a = -Math.PI / 2 + (i / segments) * end;
      points.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.TubeGeometry(curve, segments, 0.012, 6, false);
  }, [progress]);

  if (!geo) return null;
  // Color: starts cyan, turns amber as deadline approaches
  const color = progress > 0.75 ? "#eab308" : "#06b6d4";

  return (
    <group position={[position[0], 0.06, position[2]]}>
      {/* Background track ring */}
      <mesh rotation-x={-Math.PI / 2}>
        <torusGeometry args={[1.85, 0.007, 4, 64]} />
        <meshBasicMaterial color="#1a2030" transparent opacity={0.35} />
      </mesh>
      {/* Progress arc */}
      <mesh geometry={geo} rotation-x={-Math.PI / 2}>
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

/* ── GPU holographic scan line ──────────────────────── */
function GpuScanLine({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (ref.current) {
      const t = clock.getElapsedTime();
      // Sweep from -1.2 to +1.2 relative to center, bouncing
      ref.current.position.y = position[1] + 0.8 + Math.sin(t * 0.7) * 1.0;
    }
  });
  return (
    <mesh ref={ref} position={[position[0], position[1] + 0.8, position[2]]}>
      <planeGeometry args={[2.2, 0.025]} />
      <meshBasicMaterial color="#d29922" transparent opacity={0.18} depthWrite={false} />
    </mesh>
  );
}

/* ── Pulsing point light ────────────────────────────── */
function PulsingLight({ position, color }: { position: [number, number, number]; color: string }) {
  const ref = useRef<THREE.PointLight>(null!);
  useFrame(({ clock }) => {
    if (ref.current) {
      const t = clock.getElapsedTime();
      ref.current.intensity = 0.08 + Math.sin(t * 1.5) * 0.04;
    }
  });
  return <pointLight ref={ref} position={[position[0], 0.3, position[2]]} intensity={0.08} color={color} distance={4} />;
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

      {/* Wireframe overlay for offline/planned nodes */}
      {!isOnline && (
        <mesh>
          <boxGeometry args={[2.2, 2.8, 2.2]} />
          <meshBasicMaterial color={color} wireframe transparent opacity={status === "planned" ? 0.25 : 0.06} />
        </mesh>
      )}
      {/* Extra holographic scan for planned nodes */}
      {status === "planned" && (
        <>
          <mesh>
            <boxGeometry args={[2.22, 2.82, 2.22]} />
            <meshBasicMaterial color={color} transparent opacity={0.03} side={THREE.DoubleSide} />
          </mesh>
          <Text
            position={[0, 2.45, 0.5]}
            fontSize={0.10}
            color={color}
            anchorX="center"
            anchorY="middle"
          >
            {"[ COMING SOON ]"}
          </Text>
        </>
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
      {/* Heartbeat pulse for online nodes */}
      {isOnline && !isSelected && <PulseRing color={color} />}

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
        color={isOnline ? "#22c55e" : status === "planned" ? "#d29922" : "#554444"}
        anchorX="center"
        anchorY="middle"
      >
        {isOnline ? "● ONLINE" : status === "planned" ? "◈ PLANNED" : "○ OFFLINE"}
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
/* ── Pulsing red indicator for unhealthy pods ─────────── */
function UnhealthyDot() {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (ref.current) {
      const mat = ref.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.7 + Math.sin(clock.getElapsedTime() * 4) * 0.3;
    }
  });
  return (
    <mesh ref={ref} position={[0.28, 0.28, 0.2]} raycast={() => {}}>
      <sphereGeometry args={[0.07, 8, 8]} />
      <meshBasicMaterial color="#ef4444" transparent opacity={0.9} toneMapped={false} />
    </mesh>
  );
}

/* ── Expanding heartbeat ring for running services ────── */
function HeartbeatRing({ color, phaseOffset = 0 }: { color: string; phaseOffset?: number }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = (clock.getElapsedTime() * 0.6 + phaseOffset) % 1;
    // Expand ring from r=0.4 to r=0.9, fade out
    const r = 0.4 + t * 0.5;
    ref.current.scale.setScalar(r / 0.4);
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, 0.3 * (1 - t * 2));
  });
  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]} raycast={() => {}}>
      <torusGeometry args={[0.4, 0.007, 6, 48]} />
      <meshBasicMaterial color={color} transparent opacity={0.3} toneMapped={false} />
    </mesh>
  );
}

/* ── Fast warning pulse ring for services with events ──── */
function EventPulseRing() {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = (clock.getElapsedTime() * 1.8) % 1; // faster: 1.8 cycles/sec
    const r = 0.42 + t * 0.45;
    ref.current.scale.setScalar(r / 0.42);
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, 0.45 * (1 - t * 1.5));
  });
  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]} raycast={() => {}}>
      <torusGeometry args={[0.42, 0.01, 6, 48]} />
      <meshBasicMaterial color="#eab308" transparent opacity={0.45} toneMapped={false} />
    </mesh>
  );
}

function ServiceSphere({
  position, service, visible, delay = 0, idx = 0,
  isSelected, isHovered, isUnhealthy = false, hasEvents = false, nsPods, cpuM, onClick, onPointerOver, onPointerOut,
}: {
  position: [number, number, number];
  service: typeof services[0];
  visible: boolean;
  delay?: number;
  idx?: number;
  isSelected: boolean;
  isHovered: boolean;
  isUnhealthy?: boolean;
  hasEvents?: boolean;
  nsPods?: number;
  cpuM?: number;
  onClick: () => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
}) {
  // Single group: scale animation. Float wraps BOTH hit sphere + visual so they stay in sync.
  const outerRef = useRef<THREE.Group>(null!);
  const catColor = CATEGORY_COLORS[service.category] || "#666";
  const isRunning = service.status === "running";
  // Staggered float speed per sphere so each has a unique rhythm
  const floatSpeed = 0.8 + (idx % 7) * 0.18;
  // CPU load intensity: 0-1 based on namespace CPU requests
  const cpuIntensity = cpuM !== undefined ? Math.min(1, cpuM / 1000) : 0;
  const baseEmissive = isRunning ? (isUnhealthy ? 0.35 : 0.12 + cpuIntensity * 0.22) : 0.03;

  useFrame(() => {
    if (outerRef.current) {
      const targetScale = visible ? (isSelected ? 1.15 : isHovered ? 1.08 : 1.0) : 0;
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
      <Float speed={floatSpeed} floatIntensity={0.08} rotationIntensity={0}>
        {/* Invisible hit sphere — same position as visual */}
        <mesh>
          <sphereGeometry args={[0.48, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {/* Glass icosahedron orb */}
        <mesh>
          <icosahedronGeometry args={[0.36, 1]} />
          <meshPhysicalMaterial
            color={isUnhealthy ? "#ef4444" : catColor}
            metalness={0}
            roughness={0.08}
            transparent
            opacity={isRunning ? 0.65 : 0.22}
            clearcoat={1.0}
            clearcoatRoughness={0.05}
            emissive={isUnhealthy ? "#ef4444" : catColor}
            emissiveIntensity={isSelected ? 0.45 : isHovered ? 0.25 : baseEmissive}
          />
        </mesh>
        {/* Warning ring for unhealthy services */}
        {isUnhealthy && !isSelected && (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.5, 0.014, 8, 48]} />
            <meshBasicMaterial color="#ef4444" transparent opacity={0.5} toneMapped={false} />
          </mesh>
        )}
        {/* Fast amber pulse for services with warning events */}
        {hasEvents && !isUnhealthy && <EventPulseRing />}
        {/* Outer glow shell on hover/select */}
        {(isSelected || isHovered) && (
          <mesh>
            <icosahedronGeometry args={[0.44, 1]} />
            <meshBasicMaterial color={isUnhealthy ? "#ef4444" : catColor} transparent opacity={0.12} toneMapped={false} />
          </mesh>
        )}
        {/* Icon */}
        <Text position={[0, 0, 0.38]} fontSize={0.21} anchorX="center" anchorY="middle">
          {service.icon}
        </Text>
        {/* Orbit ring for selected service */}
        {isSelected && (
          <SelectionOrbitRing color={catColor} />
        )}
        {/* Thin category ring at equator */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.42, 0.008, 6, 48]} />
          <meshBasicMaterial color={catColor} transparent opacity={isRunning ? 0.35 : 0.08} toneMapped={false} />
        </mesh>
        {/* Heartbeat pulse ring for running services */}
        {isRunning && <HeartbeatRing color={catColor} phaseOffset={(idx * 0.618) % 1} />}
        {/* Name */}
        <Text position={[0, -0.54, 0]} fontSize={0.07} color={isRunning ? "#c4c4c8" : "#444"} anchorX="center" anchorY="top" maxWidth={1.1}>
          {service.name}
        </Text>
        {/* Namespace tag (tiny, below name) */}
        <Text position={[0, -0.66, 0]} fontSize={0.048} color="#3a3a4a" anchorX="center" anchorY="top" maxWidth={1.2}>
          {service.namespace}
        </Text>
        {/* Unhealthy pod indicator — pulsing red dot at top-right of sphere */}
        {isUnhealthy && <UnhealthyDot />}
        {/* Hover tooltip */}
        {isHovered && !isSelected && (
          <Html position={[0.55, 0.45, 0]} style={{ pointerEvents: "none" }} zIndexRange={[10, 20]}>
            <div style={{
              background: "rgba(8,8,18,0.88)",
              border: `1px solid ${catColor}44`,
              borderRadius: 6,
              padding: "4px 8px",
              fontFamily: "monospace",
              fontSize: 10,
              color: "#ccc",
              whiteSpace: "nowrap",
              boxShadow: `0 0 8px ${catColor}22`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: catColor }}>{service.name}</span>
                {isUnhealthy && <span style={{ color: "#ef4444" }}>⚠</span>}
              </div>
              {nsPods !== undefined && <div style={{ color: "#555", marginTop: 2 }}>{nsPods} pod{nsPods !== 1 ? "s" : ""}{cpuM !== undefined ? ` · ${cpuM >= 1000 ? (cpuM/1000).toFixed(1) + "c" : cpuM + "m"} CPU` : ""}</div>}
            </div>
          </Html>
        )}
      </Float>
    </group>
  );
}

/* ── Animated data particles along a beam ─────────────── */
function BeamParticles({ from, to, color, count = 4 }: { from: THREE.Vector3; to: THREE.Vector3; color: string; count?: number }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    for (let i = 0; i < count; i++) {
      const mesh = refs.current[i];
      if (!mesh) continue;
      const phase = ((t * 1.2 + i / count) % 1);
      mesh.position.lerpVectors(from, to, phase);
      (mesh.material as THREE.MeshBasicMaterial).opacity = Math.sin(phase * Math.PI) * 0.9;
    }
  });
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} ref={el => { refs.current[i] = el; }} raycast={() => {}}>
          <sphereGeometry args={[0.04, 4, 4]} />
          <meshBasicMaterial color={color} transparent opacity={0} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/* ── Services radial display ─────────────────────────── */
function ServicesDisplay({
  nodePos, visible, selectedSvc, hoveredSvc, onSelectSvc, onHoverSvc, onUnhoverSvc, unhealthyNamespaces, recentEvents, nsPodCounts, nsCpuUsage,
}: {
  nodePos: [number, number, number];
  visible: boolean;
  selectedSvc: number | null;
  hoveredSvc: number | null;
  onSelectSvc: (i: number | null) => void;
  onHoverSvc: (i: number) => void;
  onUnhoverSvc: () => void;
  unhealthyNamespaces?: Set<string>;
  recentEvents?: { namespace: string }[];
  nsPodCounts?: Record<string, number>;
  nsCpuUsage?: Record<string, number>;
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
      {services.map((svc, i) => {
        const catColor = CATEGORY_COLORS[svc.category] || "#666";
        const linePoints = [
          new THREE.Vector3(nodePos[0], nodePos[1] + 1.2, nodePos[2]),
          new THREE.Vector3(positions[i][0], positions[i][1] - 0.4, positions[i][2]),
        ];
        return (
          <group key={svc.name}>
            {/* Beam from M2 to service sphere */}
            {visible && (
              <Line
                points={linePoints}
                color={catColor}
                lineWidth={selectedSvc === i ? 1.2 : 0.5}
                transparent
                opacity={selectedSvc === i ? 0.35 : 0.08}
                dashed={false}
              />
            )}
            {/* Animated data particles along selected service beam */}
            {visible && selectedSvc === i && (
              <BeamParticles from={linePoints[0]} to={linePoints[1]} color={catColor} />
            )}
            <ServiceSphere
              position={positions[i]}
              service={svc}
              visible={visible}
              delay={i}
              idx={i}
              isSelected={selectedSvc === i}
              isHovered={hoveredSvc === i}
              isUnhealthy={!!unhealthyNamespaces?.has(svc.namespace)}
              hasEvents={!!recentEvents?.some(e => e.namespace === svc.namespace)}
              nsPods={nsPodCounts?.[svc.namespace]}
              cpuM={nsCpuUsage?.[svc.namespace]}
              onClick={() => onSelectSvc(selectedSvc === i ? null : i)}
              onPointerOver={() => onHoverSvc(i)}
              onPointerOut={onUnhoverSvc}
            />
          </group>
        );
      })}
    </>
  );
}

/* ── ArgoCD floating glass object ─────────────────── */
function ArgoCDObject({ position, isSelected, onClick, appsSynced, appsTotal }: {
  position: [number, number, number];
  isSelected?: boolean;
  onClick?: () => void;
  appsSynced?: number;
  appsTotal?: number;
}) {
  const innerRef = useRef<THREE.Mesh>(null!);
  const outerRef = useRef<THREE.Mesh>(null!);
  const ringRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (innerRef.current) innerRef.current.rotation.y = t * 0.45;
    if (outerRef.current) { outerRef.current.rotation.y = -t * 0.18; outerRef.current.rotation.x = t * 0.12; }
    if (ringRef.current) ringRef.current.rotation.z = t * 0.3;
  });

  const isOutOfSync = appsTotal !== undefined && appsSynced !== undefined && appsSynced < appsTotal;
  const argoColor = isOutOfSync ? "#eab308" : "#ef7b4d";

  return (
    <Float speed={2.5} rotationIntensity={0.2} floatIntensity={0.5}>
      <group position={position}
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = "default"; }}
      >
        <mesh ref={outerRef}>
          <icosahedronGeometry args={[0.55, 1]} />
          <meshPhysicalMaterial color={argoColor} metalness={0} roughness={0} transparent opacity={isSelected ? 0.25 : 0.15} clearcoat={1} clearcoatRoughness={0} emissive={argoColor} emissiveIntensity={isSelected ? 0.25 : 0.12} />
        </mesh>
        <mesh ref={innerRef}>
          <octahedronGeometry args={[0.28, 0]} />
          <meshPhysicalMaterial color={argoColor} metalness={0.2} roughness={0.15} clearcoat={0.9} emissive={argoColor} emissiveIntensity={isSelected ? 0.9 : 0.55} />
        </mesh>
        <mesh ref={ringRef} rotation-x={Math.PI / 4}>
          <torusGeometry args={[0.65, 0.013, 16, 64]} />
          <meshBasicMaterial color={argoColor} transparent opacity={isSelected ? 1.0 : 0.65} toneMapped={false} />
        </mesh>
        <Text position={[0, -0.85, 0]} fontSize={0.1} color={argoColor} anchorX="center">ArgoCD</Text>
        {appsTotal !== undefined && (
          <Text position={[0, 0.82, 0]} fontSize={0.11} color={isOutOfSync ? "#eab308" : "#22c55e"} anchorX="center" toneMapped={false}>
            {appsSynced}/{appsTotal}
          </Text>
        )}
        {isSelected && (
          <Html position={[0.9, 0.4, 0]} style={{ pointerEvents: "none" }}>
            <div style={{
              background: "rgba(8,8,18,0.92)",
              border: "1px solid #ef7b4d44",
              borderRadius: 8,
              padding: "8px 12px",
              fontFamily: "monospace",
              fontSize: 11,
              color: "#ccc",
              width: 180,
              whiteSpace: "nowrap",
            }}>
              <div style={{ color: "#ef7b4d", marginBottom: 5, fontWeight: 600 }}>ArgoCD v3.4.2</div>
              <div style={{ color: "#888", marginBottom: 3 }}>GitOps controller</div>
              <div>Apps: {appsTotal ?? 14} total · {appsSynced ?? 13}/{appsTotal ?? 14} synced</div>
              <div style={{ marginTop: 5 }}>
                <a href="https://argocd.homelab" target="_blank" rel="noreferrer"
                  style={{ color: "#ef7b4d", textDecoration: "none", fontSize: 10 }}
                  onClick={(e) => e.stopPropagation()}
                >↗ argocd.homelab</a>
              </div>
            </div>
          </Html>
        )}
      </group>
    </Float>
  );
}

/* ── Cilium CNI object ───────────────────────────────── */
function CiliumObject({ position, isSelected, onClick }: { position: [number, number, number]; isSelected?: boolean; onClick?: () => void }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.z = clock.getElapsedTime() * 0.55; });
  return (
    <Float speed={1.8} floatIntensity={0.4}>
      <group position={position}
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = "default"; }}
      >
        <mesh ref={ref}>
          <torusKnotGeometry args={[0.24, 0.07, 64, 8, 2, 3]} />
          <meshPhysicalMaterial color="#f7a800" metalness={0.3} roughness={0.2} clearcoat={0.8} emissive="#f7a800" emissiveIntensity={isSelected ? 0.8 : 0.45} />
        </mesh>
        <Text position={[0, -0.62, 0]} fontSize={0.09} color="#f7a800" anchorX="center">Cilium CNI</Text>
        {isSelected && (
          <Html position={[0.8, 0.3, 0]} style={{ pointerEvents: "none" }}>
            <div style={{
              background: "rgba(8,8,18,0.92)",
              border: "1px solid #f7a80044",
              borderRadius: 8,
              padding: "8px 12px",
              fontFamily: "monospace",
              fontSize: 11,
              color: "#ccc",
              width: 180,
            }}>
              <div style={{ color: "#f7a800", marginBottom: 5, fontWeight: 600 }}>Cilium v1.19.4</div>
              <div style={{ color: "#888", marginBottom: 3 }}>CNI + LB-IPAM</div>
              <div>LB pool: 192.168.1.11–30</div>
              <div>Mode: native routing</div>
            </div>
          </Html>
        )}
      </group>
    </Float>
  );
}

/* ── Longhorn storage object ─────────────────────────── */
function LonghornObject({ position, isSelected, onClick, storageData }: {
  position: [number, number, number];
  isSelected?: boolean;
  onClick?: () => void;
  storageData?: { totalGiB: number; usedGiB: number; freeGiB: number; pct: number } | null;
}) {
  const ref = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.35;
  });
  return (
    <Float speed={1.5} floatIntensity={0.35}>
      <group position={position}
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = "default"; }}
      >
        <group ref={ref}>
          {[0, 1, 2].map(i => (
            <mesh key={i} position={[0, (i - 1) * 0.25, 0]}>
              <cylinderGeometry args={[0.35 - i * 0.05, 0.35 - i * 0.05, 0.12, 32]} />
              <meshPhysicalMaterial color="#3b82f6" metalness={0.5} roughness={0.3} clearcoat={0.6} emissive="#3b82f6" emissiveIntensity={isSelected ? 0.6 : (0.3 - i * 0.08)} />
            </mesh>
          ))}
        </group>
        <Text position={[0, -0.75, 0]} fontSize={0.09} color="#3b82f6" anchorX="center">Longhorn</Text>
        {storageData && (
          <Text position={[0, 0.72, 0]} fontSize={0.11} color={storageData.pct > 80 ? "#ef4444" : storageData.pct > 60 ? "#eab308" : "#3b82f6"} anchorX="center" toneMapped={false}>
            {storageData.pct}%
          </Text>
        )}
        {isSelected && (
          <Html position={[0.8, 0.3, 0]} style={{ pointerEvents: "none" }}>
            <div style={{
              background: "rgba(8,8,18,0.92)",
              border: "1px solid #3b82f644",
              borderRadius: 8,
              padding: "8px 12px",
              fontFamily: "monospace",
              fontSize: 11,
              color: "#ccc",
              width: 180,
            }}>
              <div style={{ color: "#3b82f6", marginBottom: 5, fontWeight: 600 }}>Longhorn v1.11.2</div>
              <div style={{ color: "#888", marginBottom: 3 }}>Distributed block storage</div>
              {storageData ? (
                <>
                  <div>{storageData.usedGiB}G / {storageData.totalGiB}G used ({storageData.pct}%)</div>
                  <div>{storageData.freeGiB}G free</div>
                </>
              ) : (
                <div>Replicas: 1 (single node)</div>
              )}
              <div style={{ marginTop: 5 }}>
                <a href="https://longhorn.homelab" target="_blank" rel="noreferrer"
                  style={{ color: "#3b82f6", textDecoration: "none", fontSize: 10 }}
                  onClick={(e) => e.stopPropagation()}
                >↗ longhorn.homelab</a>
              </div>
            </div>
          </Html>
        )}
      </group>
    </Float>
  );
}

/* ── Orbiting pods around K8s object ─────────────────── */
function OrbitingPods({ count, radius = 0.65 }: { count: number; radius?: number }) {
  const groupRef = useRef<THREE.Group>(null!);
  const n = Math.min(count, 12);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.children.forEach((child, i) => {
        const phase = (i / n) * Math.PI * 2;
        // Use two orbital planes mixed together
        const angle = t * 0.5 + phase;
        const tilt = (i % 3 === 0) ? 0.4 : (i % 3 === 1) ? -0.3 : 0;
        child.position.x = Math.cos(angle) * radius;
        child.position.y = Math.sin(angle * 0.7 + tilt) * radius * 0.35;
        child.position.z = Math.sin(angle) * radius;
      });
    }
  });
  return (
    <group ref={groupRef}>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.028, 6, 6]} />
          <meshBasicMaterial color={i < 2 ? "#ef4444" : "#326ce5"} transparent opacity={0.85} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ── Kubernetes cluster object ───────────────────────── */
function KubernetesObject({ position, isSelected, onClick, totalPods, warningCount }: {
  position: [number, number, number];
  isSelected?: boolean;
  onClick?: () => void;
  totalPods?: number;
  warningCount?: number;
}) {
  const ringA = useRef<THREE.Mesh>(null!);
  const ringB = useRef<THREE.Mesh>(null!);
  const ringC = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ringA.current) ringA.current.rotation.y = t * 0.8;
    if (ringB.current) { ringB.current.rotation.x = t * 0.55; ringB.current.rotation.z = t * 0.3; }
    if (ringC.current) ringC.current.rotation.z = -t * 0.65;
  });
  const k8sColor = "#326ce5";
  return (
    <Float speed={1.9} floatIntensity={0.4}>
      <group position={position}
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = "default"; }}
      >
        {/* Core sphere */}
        <mesh>
          <sphereGeometry args={[0.22, 16, 16]} />
          <meshPhysicalMaterial color={k8sColor} metalness={0.3} roughness={0.2} clearcoat={0.9} emissive={k8sColor} emissiveIntensity={isSelected ? 0.9 : 0.5} />
        </mesh>
        {/* Orbiting pods */}
        {totalPods !== undefined && totalPods > 0 && <OrbitingPods count={Math.min(totalPods, 10)} />}
        {/* Three orbit rings at different angles */}
        <mesh ref={ringA}>
          <torusGeometry args={[0.42, 0.012, 12, 64]} />
          <meshBasicMaterial color={k8sColor} transparent opacity={isSelected ? 0.9 : 0.55} toneMapped={false} />
        </mesh>
        <mesh ref={ringB} rotation={[Math.PI / 3, 0, 0]}>
          <torusGeometry args={[0.42, 0.009, 12, 64]} />
          <meshBasicMaterial color={k8sColor} transparent opacity={isSelected ? 0.7 : 0.4} toneMapped={false} />
        </mesh>
        <mesh ref={ringC} rotation={[-Math.PI / 3, 0, 0]}>
          <torusGeometry args={[0.42, 0.009, 12, 64]} />
          <meshBasicMaterial color={k8sColor} transparent opacity={isSelected ? 0.7 : 0.35} toneMapped={false} />
        </mesh>
        <Text position={[0, -0.72, 0]} fontSize={0.09} color={k8sColor} anchorX="center">Kubernetes</Text>
        {totalPods !== undefined && (
          <Text position={[0, 0.62, 0]} fontSize={0.12} color="#22c55e" anchorX="center" toneMapped={false}>
            {totalPods}
          </Text>
        )}
        {warningCount !== undefined && warningCount > 0 && (
          <Text position={[0.5, 0.55, 0]} fontSize={0.1} color="#f59e0b" anchorX="center" toneMapped={false}>
            ⚠{warningCount}
          </Text>
        )}
        {isSelected && (
          <Html position={[0.8, 0.3, 0]} style={{ pointerEvents: "none" }}>
            <div style={{
              background: "rgba(8,8,18,0.92)",
              border: `1px solid ${k8sColor}44`,
              borderRadius: 8,
              padding: "8px 12px",
              fontFamily: "monospace",
              fontSize: 11,
              color: "#ccc",
              width: 180,
            }}>
              <div style={{ color: k8sColor, marginBottom: 5, fontWeight: 600 }}>Kubernetes v1.36</div>
              <div style={{ color: "#888", marginBottom: 3 }}>Talos Linux v1.13.2</div>
              {totalPods !== undefined && <div>Pods running: {totalPods}</div>}
              <div>Runtime: containerd</div>
              <div>CNI: Cilium v1.19.4</div>
            </div>
          </Html>
        )}
      </group>
    </Float>
  );
}

/* ── Main Scene ────────────────────────────────────── */
export default function Scene3D({
  onSelect,
  selectedIdx,
  nodeMetrics,
  appsSynced,
  appsTotal,
  unhealthyNamespaces,
  refreshProgress,
  longhornStorage,
  totalPods,
  recentEvents,
  nsPodCounts,
  nsCpuRequestsM,
  unhealthyPodCount,
}: {
  onSelect: (i: number | null) => void;
  selectedIdx: number | null;
  nodeMetrics?: { cpuCores: string; memoryi: string; cpuPct: string; memPct: string } | null;
  appsSynced?: number;
  appsTotal?: number;
  unhealthyNamespaces?: Set<string>;
  refreshProgress?: number; // 0 = just refreshed, 1 = about to refresh
  longhornStorage?: { totalGiB: number; usedGiB: number; freeGiB: number; pct: number } | null;
  totalPods?: number;
  recentEvents?: { namespace: string; name: string; reason: string; message: string; count: number; age: string }[];
  nsPodCounts?: Record<string, number>;
  nsCpuRequestsM?: Record<string, number>;
  unhealthyPodCount?: number;
}) {
  const [selectedNode, setSelectedNode] = useState<"router" | "m2" | "gpu" | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [showAllServices, setShowAllServices] = useState(false);
  const [hoveredSvc, setHoveredSvc] = useState<number | null>(null);
  const [selectedInfra, setSelectedInfra] = useState<"argocd" | "cilium" | "longhorn" | "k8s" | null>(null);

  // Keyboard shortcut: S = toggle services, Escape = deselect, ←/→ navigate services
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "s" || e.key === "S") setShowAllServices((v) => !v);
      if (e.key === "Escape") { setSelectedNode(null); setSelectedInfra(null); onSelect(null); }
      if (showAllServices && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const cur = selectedIdx === null ? (dir === 1 ? -1 : services.length) : selectedIdx;
        const next = (cur + dir + services.length) % services.length;
        onSelect(next);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSelect, showAllServices, selectedIdx]);

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
    ...(nodeMetrics ? [
      { label: "CPU use", value: `${nodeMetrics.cpuCores} (${nodeMetrics.cpuPct})` },
      { label: "RAM use", value: `${nodeMetrics.memoryi} (${nodeMetrics.memPct})` },
    ] : nsCpuRequestsM ? [
      { label: "CPU req", value: `${(Object.values(nsCpuRequestsM).reduce((a,b)=>a+b,0)/1000).toFixed(1)}c / 15.9c (${((Object.values(nsCpuRequestsM).reduce((a,b)=>a+b,0) / 15950)*100).toFixed(0)}%)` },
    ] : []),
    ...(appsTotal !== undefined ? [
      { label: "ArgoCD", value: `${appsSynced}/${appsTotal} synced` },
    ] : []),
    ...(longhornStorage ? [
      { label: "Volume", value: `${longhornStorage.usedGiB}G/${longhornStorage.totalGiB}G (${longhornStorage.pct}%)` },
    ] : []),
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
      camera={{ position: [0, 8, 14], fov: 55 }}
      style={{ position: "absolute", inset: 0, background: "#07070e" }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      onPointerMissed={() => { setSelectedNode(null); setSelectedInfra(null); onSelect(null); }}
    >
      <color attach="background" args={["#05050e"]} />
      <fog attach="fog" args={["#07070f", 18, 38]} />
      <ResponsiveCamera />
      <CameraFlyIn />

      {/* Lighting */}
      <ambientLight intensity={0.18} />
      <directionalLight position={[6, 10, 6]} intensity={0.6} color="#cce0ff" castShadow={false} />
      <pointLight position={[0, 6, 0]} intensity={0.3} color="#2244ff" />
      {/* Accent from below — subtle up-light */}
      <pointLight position={[0, -0.5, 0]} intensity={0.08} color="#0066cc" />
      {/* M2 node breathing glow */}
      {/* PulsingLight color reflects CPU load or cluster health */}
      <PulsingLight position={m2Pos} color={
        nodeMetrics ? (
          (parseInt(nodeMetrics.cpuPct, 10) || 0) > 80 ? "#ef4444" :
          (parseInt(nodeMetrics.cpuPct, 10) || 0) > 50 ? "#eab308" :
          "#58a6ff"
        ) : unhealthyNamespaces && unhealthyNamespaces.size > 0 ? "#ef4444" : "#58a6ff"
      } />
      {/* Router accent */}
      <pointLight position={[routerPos[0], 0.5, routerPos[2]]} intensity={0.06} color="#8b949e" />
      {/* CPU/RAM arc ring around M2 */}
      {(() => {
        const cpuReqPct = nsCpuRequestsM ? Math.min(100, (Object.values(nsCpuRequestsM).reduce((a,b)=>a+b,0) / 15950) * 100) : 0;
        const cpuToShow = nodeMetrics ? (parseInt(nodeMetrics.cpuPct, 10) || 0) : cpuReqPct;
        const ramToShow = nodeMetrics ? (parseInt(nodeMetrics.memPct, 10) || 0) : 0;
        return cpuToShow > 0 ? (
          <CpuArcRing position={m2Pos} cpuPct={cpuToShow} ramPct={ramToShow} />
        ) : null;
      })()}
      {/* Refresh countdown sweep arc — outermost ring */}
      {refreshProgress !== undefined && refreshProgress > 0 && (
        <RefreshArc position={m2Pos} progress={refreshProgress} />
      )}

      <HoloGrid />
      <Particles />
      <ScanRing origin={[m2Pos[0], 0, m2Pos[2]]} color={unhealthyNamespaces && unhealthyNamespaces.size > 0 ? "#ef4444" : (appsSynced !== undefined && appsTotal !== undefined && appsSynced < appsTotal) ? "#eab308" : "#22d3ee"} period={10} />
      <FloorHealthAura position={m2Pos} color={unhealthyNamespaces && unhealthyNamespaces.size > 0 ? "#ef4444" : (appsSynced !== undefined && appsTotal !== undefined && appsSynced < appsTotal) ? "#eab308" : "#22d3ee"} />
      {(() => {
        const cpuReqPct = nsCpuRequestsM ? Math.min(100, (Object.values(nsCpuRequestsM).reduce((a,b)=>a+b,0) / 15950) * 100) : 0;
        const cpuPct = nodeMetrics ? (parseInt(nodeMetrics.cpuPct, 10) || 0) : cpuReqPct;
        const ramPct = nodeMetrics ? (parseInt(nodeMetrics.memPct, 10) || 0) : 0;
        return cpuPct > 0 ? (
          <>
            <CpuArcGauge position={m2Pos} cpuPct={cpuPct} />
            {ramPct > 0 && <RamArcGauge position={m2Pos} ramPct={ramPct} />}
          </>
        ) : null;
      })()}
      {/* Lightning arcs when CPU > 60% */}
      {nodeMetrics && parseInt(nodeMetrics.cpuPct, 10) > 60 && (
        <LightningArc from={new THREE.Vector3(m2Pos[0], m2Pos[1] + 1.5, m2Pos[2])} to={new THREE.Vector3(-2.5, 5.2, -2)} intensity={Math.min(1, (parseInt(nodeMetrics.cpuPct, 10) - 60) / 40)} />
      )}

      {/* Floor cables (at ground level) */}
      <FloorCable from={routerPos} to={m2Pos} color="#58a6ff" active speed={0.18} bidir />
      <FloorCable from={routerPos} to={gpuPos} color="#d29922" active speed={0.13} />
      {/* Request path animation when service selected: WAN → Router → M2 (accelerated) */}
      {selectedIdx !== null && (() => {
        const svcPos = getSvcPos(selectedIdx) as [number, number, number];
        const catColor = CATEGORY_COLORS[services[selectedIdx]?.category] || "#58a6ff";
        return (
          <>
            <BeamParticles from={new THREE.Vector3(routerPos[0], 5.0, routerPos[2])} to={new THREE.Vector3(routerPos[0], 0.5, routerPos[2])} color="#58a6ff" count={3} />
            <BeamParticles from={new THREE.Vector3(routerPos[0], 0.5, routerPos[2])} to={new THREE.Vector3(m2Pos[0], 0.5, m2Pos[2])} color="#58a6ff" count={3} />
            <BeamParticles from={new THREE.Vector3(m2Pos[0], 1.0, m2Pos[2])} to={new THREE.Vector3(svcPos[0], svcPos[1] - 0.4, svcPos[2])} color={catColor} count={3} />
          </>
        );
      })()}

      {/* Internet cloud — dim floating sphere above router, with downlink particles */}
      <group position={[routerPos[0], 5.5, routerPos[2]]}>
        <Float speed={0.5} floatIntensity={0.15}>
          <mesh raycast={() => {}}>
            <sphereGeometry args={[0.45, 16, 16]} />
            <meshBasicMaterial color="#30363d" transparent opacity={0.18} toneMapped={false} />
          </mesh>
          <mesh raycast={() => {}}>
            <sphereGeometry args={[0.55, 16, 16]} />
            <meshBasicMaterial color="#58a6ff" transparent opacity={0.04} toneMapped={false} />
          </mesh>
          <Text position={[0, -0.65, 0]} fontSize={0.08} color="#444" anchorX="center">🌐 WAN</Text>
        </Float>
      </group>
      {/* Downlink particles: internet → router */}
      <BeamParticles
        from={new THREE.Vector3(routerPos[0], 5.2, routerPos[2])}
        to={new THREE.Vector3(routerPos[0], 0.4, routerPos[2])}
        color="#58a6ff"
        count={5}
      />

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
      {/* Holographic scan line on GPU (coming soon) */}
      <GpuScanLine position={gpuPos} />
      {/* Coming Soon floating tag above GPU */}
      <Billboard position={[gpuPos[0], gpuPos[1] + 3.2, gpuPos[2]]}>
        <mesh>
          <planeGeometry args={[1.4, 0.36]} />
          <meshBasicMaterial color="#d29922" transparent opacity={0.12} />
        </mesh>
        <Text position={[0, 0, 0.01]} fontSize={0.13} color="#d29922" anchorX="center" anchorY="middle" fontWeight={700}>
          COMING SOON
        </Text>
      </Billboard>
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
      <ArgoCDObject position={[4.5, 4.5, -1]} isSelected={selectedInfra === "argocd"} onClick={() => setSelectedInfra(v => v === "argocd" ? null : "argocd")} appsSynced={appsSynced} appsTotal={appsTotal} />
      <CiliumObject position={[-4.5, 4, -1]} isSelected={selectedInfra === "cilium"} onClick={() => setSelectedInfra(v => v === "cilium" ? null : "cilium")} />
      <LonghornObject position={[0, 5.5, -2]} isSelected={selectedInfra === "longhorn"} onClick={() => setSelectedInfra(v => v === "longhorn" ? null : "longhorn")} storageData={longhornStorage} />
      <KubernetesObject position={[-2.5, 5.5, -2]} isSelected={selectedInfra === "k8s"} onClick={() => setSelectedInfra(v => v === "k8s" ? null : "k8s")} totalPods={totalPods} warningCount={(recentEvents?.length ?? 0) + (unhealthyPodCount ?? 0)} />
      {/* Subtle upward data particles: M2 → infra objects */}
      <BeamParticles from={new THREE.Vector3(m2Pos[0], 1.2, m2Pos[2])} to={new THREE.Vector3(4.5, 4.2, -1)} color="#f0883e" count={2} />
      <BeamParticles from={new THREE.Vector3(m2Pos[0], 1.2, m2Pos[2])} to={new THREE.Vector3(-4.5, 3.7, -1)} color="#f0c020" count={2} />
      <BeamParticles from={new THREE.Vector3(m2Pos[0], 1.2, m2Pos[2])} to={new THREE.Vector3(0, 5.2, -2)} color="#3b82f6" count={2} />
      <BeamParticles from={new THREE.Vector3(m2Pos[0], 1.2, m2Pos[2])} to={new THREE.Vector3(-2.5, 5.2, -2)} color="#326ce5" count={2} />

      {/* Subtle infra→M2 connection beams */}
      <Line points={[new THREE.Vector3(...m2Pos as [number,number,number]).setY(1.2), new THREE.Vector3(4.5, 4.0, -1)]} color="#f0883e" lineWidth={0.6} transparent opacity={selectedInfra === "argocd" ? 0.4 : 0.06} />
      <Line points={[new THREE.Vector3(...m2Pos as [number,number,number]).setY(1.2), new THREE.Vector3(-4.5, 3.5, -1)]} color="#f0c020" lineWidth={0.6} transparent opacity={selectedInfra === "cilium" ? 0.4 : 0.06} />
      <Line points={[new THREE.Vector3(...m2Pos as [number,number,number]).setY(1.2), new THREE.Vector3(0, 5.0, -2)]} color="#3b82f6" lineWidth={0.6} transparent opacity={selectedInfra === "longhorn" ? 0.4 : 0.06} />
      <Line points={[new THREE.Vector3(...m2Pos as [number,number,number]).setY(1.2), new THREE.Vector3(-2.5, 5.0, -2)]} color="#326ce5" lineWidth={0.6} transparent opacity={selectedInfra === "k8s" ? 0.4 : 0.06} />

      {/* Services display (above M2 when selected or toggled) */}
      <ServicesDisplay
        nodePos={m2Pos}
        visible={showServices}
        selectedSvc={selectedIdx}
        hoveredSvc={hoveredSvc}
        onSelectSvc={(i) => { onSelect(i); }}
        onHoverSvc={(i) => setHoveredSvc(i)}
        onUnhoverSvc={() => setHoveredSvc(null)}
        unhealthyNamespaces={unhealthyNamespaces}
        recentEvents={recentEvents}
        nsPodCounts={nsPodCounts}
        nsCpuUsage={nsCpuRequestsM}
      />

      {/* Service callout panel */}
      {selectedIdx !== null && services[selectedIdx] && (function() {
        const svcPos = getSvcPos(selectedIdx) as [number, number, number];
        const svc = services[selectedIdx];
        const urlDisplay = svc.url ? svc.url.replace("https://", "") : (svc.ip !== "internal" ? svc.ip + ":" + svc.port : "cluster-internal");
        return (
          <CalloutPanel
            anchorPos={svcPos}
            panelOffset={[1.8, 0.5, 0]}
            title={svc.icon + " " + svc.name}
            lines={[
              { label: "Status", value: svc.status },
              { label: "NS", value: svc.namespace },
              { label: "Access", value: urlDisplay },
              { label: "Category", value: svc.category },
            ]}
            color={svc.color}
            visible
            link={svc.url}
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
              background: showAllServices ? "rgba(88,166,255,0.15)" : "rgba(10,10,20,0.82)",
              border: `1px solid ${showAllServices ? "#58a6ff55" : "#2a2a2a"}`,
              borderRadius: 6,
              color: showAllServices ? "#58a6ff" : "#555",
              padding: "6px 12px",
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
              backdropFilter: "blur(8px)",
              letterSpacing: 1,
              display: "flex",
              alignItems: "center",
              gap: 7,
              transition: "all 0.2s",
            }}
          >
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: showAllServices ? "#58a6ff" : "#333",
              boxShadow: showAllServices ? "0 0 8px #58a6ff" : "none",
              display: "inline-block",
              flexShrink: 0,
            }} />
            <span>{showAllServices ? `SERVICES  ${services.length}` : "SERVICES"}</span>
          </button>
        </div>
      </Html>

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        minDistance={4}
        maxDistance={28}
        target={[0, 2.0, -0.5]}
        makeDefault
        autoRotate={!selectedNode && !selectedInfra && selectedIdx === null}
        autoRotateSpeed={0.35}
      />

      <EffectComposer>
        <Bloom luminanceThreshold={0.30} luminanceSmoothing={0.9} intensity={0.65} mipmapBlur />
        <Vignette eskil={false} offset={0.08} darkness={0.75} />
      </EffectComposer>
    </Canvas>
  );
}

// Preload GLB models
useGLTF.preload("/models/minisforum_m2.glb");
useGLTF.preload("/models/att_bgw320.glb");
useGLTF.preload("/models/gpu_node.glb");
