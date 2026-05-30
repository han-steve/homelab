"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { topoNodes, topoLinks, services, type TopoNode } from "../data";

interface TooltipState {
  x: number;
  y: number;
  text: string;
  visible: boolean;
}

export default function TopologyView({
  onSelectService,
}: {
  onSelectService: (idx: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    x: 0,
    y: 0,
    text: "",
    visible: false,
  });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const update = () => {
      setDims({ w: window.innerWidth, h: window.innerHeight - 52 });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const nodePos = useCallback(
    (n: TopoNode) => ({
      x: 60 + n.x * (dims.w - 120),
      y: 40 + n.y * (dims.h - 80),
    }),
    [dims]
  );

  const nodeRadius = (type: TopoNode["type"]) => {
    switch (type) {
      case "node":
        return 42;
      case "node-planned":
        return 38;
      case "router":
        return 32;
      case "internet":
        return 28;
      case "infra":
        return 28;
      case "service":
        return 28;
      default:
        return 26;
    }
  };

  const handleNodeClick = (node: TopoNode) => {
    setSelectedNode(node.id);
    if (node.serviceIdx !== undefined) {
      onSelectService(node.serviceIdx);
    }
  };

  return (
    <div className="relative w-full h-full" style={{ background: "#0d1117" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        className="w-full h-full"
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glowStrong">
            <feGaussianBlur stdDeviation="8" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Animated gradient for links */}
          <linearGradient id="linkFlow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#58a6ff" stopOpacity={0.3}>
              <animate
                attributeName="stop-opacity"
                values="0.3;0.7;0.3"
                dur="3s"
                repeatCount="indefinite"
              />
            </stop>
            <stop offset="50%" stopColor="#58a6ff" stopOpacity={0.8}>
              <animate
                attributeName="stop-opacity"
                values="0.8;0.3;0.8"
                dur="3s"
                repeatCount="indefinite"
              />
            </stop>
            <stop offset="100%" stopColor="#58a6ff" stopOpacity={0.3}>
              <animate
                attributeName="stop-opacity"
                values="0.3;0.7;0.3"
                dur="3s"
                repeatCount="indefinite"
              />
            </stop>
          </linearGradient>
        </defs>

        {/* Background grid */}
        <g opacity={0.06}>
          {Array.from({ length: Math.ceil(dims.w / 40) }).map((_, i) => (
            <line
              key={`vg${i}`}
              x1={i * 40}
              y1={0}
              x2={i * 40}
              y2={dims.h}
              stroke="#58a6ff"
              strokeWidth={0.5}
            />
          ))}
          {Array.from({ length: Math.ceil(dims.h / 40) }).map((_, i) => (
            <line
              key={`hg${i}`}
              x1={0}
              y1={i * 40}
              x2={dims.w}
              y2={i * 40}
              stroke="#58a6ff"
              strokeWidth={0.5}
            />
          ))}
        </g>

        {/* Links */}
        {topoLinks.map((link, i) => {
          const sNode = topoNodes.find((n) => n.id === link.source);
          const tNode = topoNodes.find((n) => n.id === link.target);
          if (!sNode || !tNode) return null;
          const s = nodePos(sNode);
          const t = nodePos(tNode);
          const mx = (s.x + t.x) / 2;
          const my = (s.y + t.y) / 2;
          const dx = t.x - s.x;
          const dy = t.y - s.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const cx = mx + (-dy / len) * 30;
          const cy = my + (dx / len) * 30;
          const pathId = `link-path-${i}`;
          const dur = (2.5 + (i * 0.4) % 2.5).toFixed(1) + "s";
          const isActive = link.style === "solid";

          return (
            <g key={`link-${i}`}>
              <path
                id={pathId}
                d={`M${s.x},${s.y} Q${cx},${cy} ${t.x},${t.y}`}
                fill="none"
                stroke={link.color}
                strokeWidth={link.style === "solid" ? 1.5 : 1}
                strokeDasharray={link.style === "dashed" ? "6,4" : "none"}
                opacity={0.45}
              />
              {/* Animated data packet on active links */}
              {isActive && (
                <circle r={3} fill={link.color} opacity={0.85} filter="url(#glow)">
                  <animateMotion
                    dur={dur}
                    repeatCount="indefinite"
                    calcMode="linear"
                  >
                    <mpath href={`#${pathId}`} />
                  </animateMotion>
                </circle>
              )}
              {link.label && (
                <text
                  x={mx}
                  y={my - 10}
                  textAnchor="middle"
                  fill="#8b949e"
                  fontSize={10}
                  fontFamily="monospace"
                >
                  {link.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {topoNodes.map((node) => {
          const pos = nodePos(node);
          const r = nodeRadius(node.type);
          const isActive = node.type === "node";
          const isService = node.type === "service";
          const isSelected = selectedNode === node.id;

          return (
            <g
              key={node.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              style={{ cursor: "pointer" }}
              onClick={() => handleNodeClick(node)}
              onMouseMove={(e) =>
                setTooltip({
                  x: e.clientX + 14,
                  y: e.clientY - 10,
                  text: node.tooltip,
                  visible: true,
                })
              }
              onMouseLeave={() =>
                setTooltip((t) => ({ ...t, visible: false }))
              }
            >
              {/* Active node outer ring */}
              {isActive && (
                <circle
                  r={r + 8}
                  fill="none"
                  stroke={node.color}
                  strokeWidth={1}
                  opacity={0.3}
                  filter="url(#glow)"
                >
                  <animate
                    attributeName="r"
                    values={`${r + 6};${r + 12};${r + 6}`}
                    dur="3s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.3;0.1;0.3"
                    dur="3s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}

              {/* Selection ring */}
              {isSelected && (
                <circle
                  r={r + 4}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={2}
                  opacity={0.5}
                  filter="url(#glowStrong)"
                />
              )}

              {/* Node circle */}
              <circle
                r={r}
                fill="#161b22"
                stroke={node.color}
                strokeWidth={isActive ? 2 : 1.5}
              />

              {/* Icon */}
              <text
                textAnchor="middle"
                dominantBaseline="middle"
                y={-4}
                fontSize={r * 0.65}
              >
                {node.icon}
              </text>

              {/* Label */}
              <text
                textAnchor="middle"
                dominantBaseline="middle"
                y={r * 0.42}
                fontSize={Math.max(9, r * 0.26)}
                fill="#c9d1d9"
                fontFamily="system-ui, sans-serif"
              >
                {node.label.length > 14
                  ? node.label.slice(0, 13) + "…"
                  : node.label}
              </text>

              {/* Service status dot */}
              {isService && (
                <circle
                  cx={r * 0.65}
                  cy={-r * 0.65}
                  r={5}
                  fill={node.color}
                  filter="url(#glow)"
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip.visible && (
        <div
          className="fixed z-50 pointer-events-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 shadow-xl"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            backdropFilter: "blur(8px)",
          }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-5 left-5 bg-gray-900/90 border border-gray-800 rounded-xl p-3 text-xs backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{
              background: "#58a6ff",
              boxShadow: "0 0 6px #58a6ff",
            }}
          />
          <span className="text-gray-400">K8s node (active)</span>
        </div>
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: "#d29922" }}
          />
          <span className="text-gray-400">Node (planned)</span>
        </div>
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: "#3fb950" }}
          />
          <span className="text-gray-400">Service (healthy)</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-0.5"
            style={{ background: "#58a6ff" }}
          />
          <span className="text-gray-400">Network link</span>
        </div>
      </div>
    </div>
  );
}
