"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { topoNodes, topoLinks, services, type TopoNode } from "../data";

interface TooltipState {
  x: number;
  y: number;
  text: string;
  nodeId: string | null;
  visible: boolean;
}

export default function TopologyView({
  onSelectService,
  nodeMetrics,
  nsPodCounts,
  unhealthyNamespaces,
  apps,
  longhornStorage,
}: {
  onSelectService: (idx: number) => void;
  nodeMetrics?: { cpuCores: string; memoryi: string; cpuPct: string; memPct: string } | null;
  nsPodCounts?: Record<string, number>;
  unhealthyNamespaces?: Set<string>;
  apps?: { name: string; sync: string; health: string }[];
  longhornStorage?: { totalGiB: number; usedGiB: number; freeGiB: number; pct: number } | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    x: 0,
    y: 0,
    text: "",
    nodeId: null,
    visible: false,
  });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const mouseMoved = useRef(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const update = () => {
      setDims({ w: window.innerWidth, h: window.innerHeight - 52 });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Wheel zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.9;
    setZoom(z => Math.max(0.4, Math.min(3.5, z * factor)));
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    mouseMoved.current = false;
    isPanning.current = true;
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning.current) {
      const newX = e.clientX - panStart.current.x;
      const newY = e.clientY - panStart.current.y;
      const dist = Math.abs(newX - pan.x) + Math.abs(newY - pan.y);
      if (dist > 4) mouseMoved.current = true;
      setPan({ x: newX, y: newY });
    }
  };

  const handleSvgMouseUp = () => { isPanning.current = false; };

  const handleSvgClick = () => {
    if (!mouseMoved.current) setSelectedNode(null);
  };

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

  // Compute dynamic M2 color based on CPU load
  const m2CpuPct = nodeMetrics ? parseInt(nodeMetrics.cpuPct, 10) || 0 : null;
  const m2DynamicColor = m2CpuPct !== null
    ? (m2CpuPct > 80 ? "#ef4444" : m2CpuPct > 50 ? "#eab308" : "#58a6ff")
    : null;

  const getNodeColor = (node: TopoNode) => {
    if (node.id === "m2" && m2DynamicColor) return m2DynamicColor;
    if (node.id === "argocd" && apps) {
      const outOfSync = apps.some(a => a.sync !== "Synced");
      if (outOfSync) return "#eab308";
    }
    if (node.id === "longhorn" && longhornStorage) {
      if (longhornStorage.pct > 80) return "#ef4444";
      if (longhornStorage.pct > 60) return "#eab308";
    }
    return node.color;
  };

  return (
    <div className="relative w-full h-full" style={{ background: "#0d1117" }}>
      {/* Quick stats bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-4 text-xs font-mono text-gray-600 pointer-events-none z-10">
        <span className="text-blue-500/60">{topoNodes.filter(n => n.type === "node").length} k8s nodes</span>
        <span className="text-gray-700">·</span>
        <span className="text-green-500/60">{services.filter(s => s.status === "running").length}/{services.length} services running</span>
        <span className="text-gray-700">·</span>
        <span className="text-gray-500/60">{topoLinks.filter(l => l.style === "solid").length} active links</span>
      </div>
      {/* Search bar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="search nodes..."
          className="bg-gray-900/90 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-400 placeholder-gray-700 focus:outline-none focus:border-gray-500 w-36 transition-colors"
          style={{ backdropFilter: "blur(8px)" }}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="text-gray-600 hover:text-gray-400 text-xs px-1">✕</button>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        className="w-full h-full"
        style={{ cursor: isPanning.current ? "grabbing" : "grab" }}
        onClick={handleSvgClick}
        onMouseDown={handleSvgMouseDown}
        onMouseMove={handleSvgMouseMove}
        onMouseUp={handleSvgMouseUp}
        onMouseLeave={handleSvgMouseUp}
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

        {/* Zoom/pan group */}
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>

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
          const isHighlighted = !selectedNode || link.source === selectedNode || link.target === selectedNode;

          return (
            <g key={`link-${i}`}>
              <path
                id={pathId}
                d={`M${s.x},${s.y} Q${cx},${cy} ${t.x},${t.y}`}
                fill="none"
                stroke={link.color}
                strokeWidth={isHighlighted ? 2.5 : (link.style === "solid" ? 1.5 : 1)}
                strokeDasharray={link.style === "dashed" ? "6,4" : "none"}
                opacity={selectedNode ? (isHighlighted ? 0.9 : 0.15) : 0.45}
                style={{ transition: "opacity 0.2s, stroke-width 0.2s" }}
              />
              {/* Animated data packet on active links */}
              {isActive && (
                <circle r={3} fill={link.color} opacity={isHighlighted ? 1.0 : 0.4} filter="url(#glow)">
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
          const nodeColor = getNodeColor(node);
          const isSelected = selectedNode === node.id;
          const isNeighbor = selectedNode && selectedNode !== node.id &&
            topoLinks.some(l => (l.source === selectedNode && l.target === node.id) || (l.target === selectedNode && l.source === node.id));
          const matchesSearch = !searchQuery || node.label.toLowerCase().includes(searchQuery.toLowerCase()) || node.id.toLowerCase().includes(searchQuery.toLowerCase());
          const isDimmed = (selectedNode && !isSelected && !isNeighbor) || (searchQuery && !matchesSearch);

          return (
            <g
              key={node.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              style={{ cursor: "pointer", transition: "opacity 0.2s", opacity: isDimmed ? 0.2 : 1 }}
              onClick={(e) => { e.stopPropagation(); handleNodeClick(node); }}
              onMouseMove={(e) =>
                setTooltip({
                  x: e.clientX + 14,
                  y: e.clientY - 10,
                  text: node.tooltip,
                  nodeId: node.id,
                  visible: true,
                })
              }
              onMouseLeave={() =>
                setTooltip((t) => ({ ...t, visible: false }))
              }
            >
              {/* Unhealthy node warning ring */}
              {isService && node.serviceIdx !== undefined && unhealthyNamespaces?.has(services[node.serviceIdx]?.namespace ?? "") && (
                <circle r={r + 5} fill="none" stroke="#ef4444" strokeWidth={1.5} opacity={0.6} filter="url(#glow)">
                  <animate attributeName="opacity" values="0.6;0.15;0.6" dur="1.2s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Neighbor highlight ring */}
              {isNeighbor && (
                <circle r={r + 4} fill="none" stroke="#ffffff" strokeWidth={1} opacity={0.25} />
              )}

              {/* Active node outer ring */}
              {isActive && (
                <circle
                  r={r + 8}
                  fill="none"
                  stroke={nodeColor}
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
                stroke={isService && node.serviceIdx !== undefined && unhealthyNamespaces?.has(services[node.serviceIdx]?.namespace ?? "") ? "#ef4444" : nodeColor}
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

              {/* Pod count badge on service nodes */}
              {isService && node.serviceIdx !== undefined && nsPodCounts && (() => {
                const svc = services[node.serviceIdx];
                const pods = svc ? nsPodCounts[svc.namespace] : undefined;
                if (pods === undefined) return null;
                return (
                  <g transform={`translate(${-r * 0.72}, ${-r * 0.72})`}>
                    <circle r={8} fill="#1c2128" stroke={node.color} strokeWidth={1} opacity={0.85} />
                    <text textAnchor="middle" dominantBaseline="middle" fontSize={7} fill={node.color} fontFamily="monospace" fontWeight="bold">{pods}</text>
                  </g>
                );
              })()}

              {/* Connection count badge on infrastructure nodes */}
              {(node.type === "node" || node.type === "router" || node.type === "infra") && (() => {
                const connCount = topoLinks.filter(l => l.source === node.id || l.target === node.id).length;
                if (connCount === 0) return null;
                return (
                  <g transform={`translate(${r * 0.7}, ${-r * 0.7})`}>
                    <circle r={8} fill="#1c2128" stroke={nodeColor} strokeWidth={1} opacity={0.9} />
                    <text textAnchor="middle" dominantBaseline="middle" fontSize={8} fill={nodeColor} fontFamily="monospace" fontWeight="bold">{connCount}</text>
                  </g>
                );
              })()}
            </g>
          );
        })}

        {/* Close zoom/pan group */}
        </g>
      </svg>

      {/* Tooltip */}
      {tooltip.visible && (() => {
        const tNode = tooltip.nodeId ? topoNodes.find(n => n.id === tooltip.nodeId) : null;
        const connCount = tooltip.nodeId ? topoLinks.filter(l => l.source === tooltip.nodeId || l.target === tooltip.nodeId).length : 0;
        const isM2 = tNode?.id === "m2";
        const podTotal = nsPodCounts ? Object.values(nsPodCounts).reduce((a, b) => a + b, 0) : null;
        return (
          <div
            className="fixed z-50 pointer-events-none bg-gray-900/95 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 shadow-xl font-mono"
            style={{ left: tooltip.x, top: tooltip.y, backdropFilter: "blur(8px)", minWidth: 160 }}
          >
            {tNode && <div className="font-bold text-sm mb-1" style={{ color: tNode.id === "m2" && m2DynamicColor ? m2DynamicColor : tNode.color }}>{tNode.icon} {tNode.label}</div>}
            <div className="text-gray-400">{tooltip.text}</div>
            {isM2 && nodeMetrics && (
              <div className="mt-1.5 space-y-0.5">
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">CPU</span>
                  <span className="text-blue-400">{nodeMetrics.cpuCores} ({nodeMetrics.cpuPct})</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">RAM</span>
                  <span className="text-cyan-400">{nodeMetrics.memoryi} ({nodeMetrics.memPct})</span>
                </div>
                {podTotal !== null && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600">pods</span>
                    <span className="text-gray-400">{podTotal}</span>
                  </div>
                )}
              </div>
            )}
            {connCount > 0 && <div className="text-gray-600 mt-1">{connCount} connection{connCount !== 1 ? "s" : ""}</div>}
          </div>
        );
      })()}

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="px-2 py-1 bg-gray-900/90 border border-gray-700 rounded text-xs font-mono text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors"
          title="Reset view"
        >⊕</button>
        <span className="text-xs font-mono text-gray-700 px-1">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(3.5, z * 1.2))} className="px-2 py-1 bg-gray-900/90 border border-gray-700 rounded text-xs font-mono text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors">+</button>
        <button onClick={() => setZoom(z => Math.max(0.4, z * 0.85))} className="px-2 py-1 bg-gray-900/90 border border-gray-700 rounded text-xs font-mono text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors">−</button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-5 left-5 bg-gray-900/90 border border-gray-800 rounded-xl p-3 text-xs backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#58a6ff", boxShadow: "0 0 6px #58a6ff" }} />
          <span className="text-gray-400">K8s node (active)</span>
        </div>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#d29922" }} />
          <span className="text-gray-400">Node (planned)</span>
        </div>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#3fb950" }} />
          <span className="text-gray-400">Service (healthy)</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-0.5" style={{ background: "#58a6ff" }} />
          <span className="text-gray-400">Network link</span>
        </div>
        <div className="border-t border-gray-800 pt-2 font-mono text-gray-600 space-y-0.5">
          <div>{topoNodes.length} nodes · {topoLinks.length} links</div>
          <div>{topoLinks.filter(l => l.style === "solid").length} active · {topoLinks.filter(l => l.style === "dashed").length} planned</div>
          {selectedNode ? <div className="text-blue-500/70">click bg to deselect</div> : <div>scroll to zoom · drag to pan</div>}
        </div>
      </div>
    </div>
  );
}
