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
  nsCpuRequestsM,
  unhealthyNamespaces,
  apps,
  longhornStorage,
  recentEvents,
  nsMaxRestarts,
}: {
  onSelectService: (idx: number) => void;
  nodeMetrics?: { cpuCores: string; memoryi: string; cpuPct: string; memPct: string } | null;
  nsPodCounts?: Record<string, number>;
  nsCpuRequestsM?: Record<string, number>;
  unhealthyNamespaces?: Set<string>;
  apps?: { name: string; sync: string; health: string }[];
  longhornStorage?: { totalGiB: number; usedGiB: number; freeGiB: number; pct: number } | null;
  recentEvents?: { namespace: string; name: string; reason: string; message: string; count: number; age: string }[];
  nsMaxRestarts?: Record<string, number>;
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
  const [nsFilter, setNsFilter] = useState<string | null>(null);

  // Unique namespaces from service nodes
  const uniqueNamespaces = Array.from(new Set(
    topoNodes
      .filter(n => n.serviceIdx !== undefined)
      .map(n => services[n.serviceIdx!]?.namespace)
      .filter(Boolean)
  )).sort() as string[];

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

  const nodeRadius = (type: TopoNode["type"], node?: TopoNode) => {
    const base = (() => {
      switch (type) {
        case "node": return 42;
        case "node-planned": return 38;
        case "router": return 32;
        case "internet": return 28;
        case "infra": return 28;
        case "service": return 28;
        default: return 26;
      }
    })();
    // Scale service nodes by pod count (max +6px)
    if (type === "service" && node?.serviceIdx !== undefined && nsPodCounts) {
      const svc = services[node.serviceIdx];
      const pods = svc ? (nsPodCounts[svc.namespace] ?? 0) : 0;
      return base + Math.min(6, pods * 1.5);
    }
    return base;
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
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-10">
        <div className="flex items-center gap-4 text-xs font-mono text-gray-600 pointer-events-none">
          <span className="text-blue-500/60">{topoNodes.filter(n => n.type === "node").length} k8s nodes</span>
          <span className="text-gray-700">·</span>
          <span className="text-green-500/60">{services.filter(s => s.status === "running").length}/{services.length} services running</span>
          <span className="text-gray-700">·</span>
          {nsPodCounts ? (
            <span className="text-cyan-500/60">{Object.values(nsPodCounts).reduce((a, b) => a + b, 0)} pods</span>
          ) : (
            <span className="text-gray-500/60">{topoLinks.filter(l => l.style === "solid").length} active links</span>
          )}
          {apps && apps.length > 0 && (() => {
            const synced = apps.filter(a => a.sync === "Synced").length;
            const ok = synced === apps.length;
            return (
              <>
                <span className="text-gray-700">·</span>
                <span style={{ color: ok ? "#22c55e99" : "#eab30899" }}>{synced}/{apps.length} synced</span>
              </>
            );
          })()}
          {longhornStorage && (
            <>
              <span className="text-gray-700">·</span>
              <span style={{ color: longhornStorage.pct > 80 ? "#ef444499" : "#8b5cf699" }}>
                {longhornStorage.pct.toFixed(0)}% storage
              </span>
            </>
          )}
        </div>
        {/* Namespace health dots */}
        {uniqueNamespaces.length > 0 && (
          <div className="flex items-center gap-0.5 pointer-events-none">
            {uniqueNamespaces.map(ns => {
              const isUnhealthy = unhealthyNamespaces?.has(ns);
              const hasEvent = recentEvents?.some(e => e.namespace === ns);
              const dotColor = isUnhealthy ? "#ef444480" : hasEvent ? "#f9731650" : "#22c55e30";
              return (
                <div key={ns} title={ns} className="w-1 h-1 rounded-full" style={{ backgroundColor: dotColor }} />
              );
            })}
          </div>
        )}
      </div>
      {/* Search bar */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
        <div className="flex items-center gap-1">
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
        {/* Namespace filter chips */}
        <div className="flex flex-wrap gap-1 items-center">
          {uniqueNamespaces.length > 6 ? (
            // Dropdown for large namespace lists
            <select
              value={nsFilter ?? ""}
              onChange={e => setNsFilter(e.target.value || null)}
              className="bg-gray-900/90 border border-gray-700 rounded px-2 py-0.5 text-[10px] font-mono text-gray-400 focus:outline-none focus:border-gray-500 transition-colors"
              style={{ backdropFilter: "blur(8px)" }}
            >
              <option value="">all namespaces</option>
              {uniqueNamespaces.map(ns => (
                <option key={ns} value={ns}>{ns}</option>
              ))}
            </select>
          ) : (
            <>
              {nsFilter && (
                <button
                  onClick={() => setNsFilter(null)}
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-gray-700/80 text-gray-300 border border-gray-600"
                >all</button>
              )}
              {uniqueNamespaces.map(ns => (
                <button
                  key={ns}
                  onClick={() => setNsFilter(nsFilter === ns ? null : ns)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${nsFilter === ns ? "bg-blue-500/20 text-blue-300 border-blue-500/40" : "bg-gray-900/70 text-gray-600 border-gray-700/50 hover:text-gray-400"}`}
                  style={{ backdropFilter: "blur(4px)" }}
                >{ns}</button>
              ))}
            </>
          )}
          {nsFilter && uniqueNamespaces.length > 6 && (
            <button onClick={() => setNsFilter(null)} className="text-gray-600 hover:text-gray-400 text-[10px] font-mono px-1">✕ clear</button>
          )}
        </div>
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
              {/* Animated data packets on active links — two staggered particles */}
              {isActive && (
                <>
                  <circle r={2.5} fill={link.color} opacity={isHighlighted ? 0.9 : 0.3} filter="url(#glow)">
                    <animateMotion dur={dur} repeatCount="indefinite" calcMode="linear">
                      <mpath href={`#${pathId}`} />
                    </animateMotion>
                  </circle>
                  <circle r={1.8} fill={link.color} opacity={isHighlighted ? 0.6 : 0.2} filter="url(#glow)">
                    <animateMotion dur={dur} begin={`-${(parseFloat(dur) / 2).toFixed(1)}s`} repeatCount="indefinite" calcMode="linear">
                      <mpath href={`#${pathId}`} />
                    </animateMotion>
                  </circle>
                </>
              )}
              {/* Slow ghost particle on dashed (inactive) links */}
              {!isActive && isHighlighted && (
                <circle r={1.5} fill={link.color} opacity={0.25}>
                  <animateMotion dur={`${(parseFloat(dur) * 2.5).toFixed(1)}s`} repeatCount="indefinite" calcMode="linear">
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

        {/* Namespace group backgrounds */}
        {(() => {
          const nsBounds: Record<string, { minX: number; minY: number; maxX: number; maxY: number; color: string }> = {};
          for (const node of topoNodes) {
            if (node.serviceIdx === undefined) continue;
            const svc = services[node.serviceIdx];
            if (!svc) continue;
            const ns = svc.namespace;
            const pos = nodePos(node);
            const r = nodeRadius(node.type, node);
            if (!nsBounds[ns]) {
              nsBounds[ns] = { minX: pos.x - r, minY: pos.y - r, maxX: pos.x + r, maxY: pos.y + r, color: svc.color || "#58a6ff" };
            } else {
              nsBounds[ns].minX = Math.min(nsBounds[ns].minX, pos.x - r);
              nsBounds[ns].minY = Math.min(nsBounds[ns].minY, pos.y - r);
              nsBounds[ns].maxX = Math.max(nsBounds[ns].maxX, pos.x + r);
              nsBounds[ns].maxY = Math.max(nsBounds[ns].maxY, pos.y + r);
            }
          }
          const pad = 18;
          return Object.entries(nsBounds).map(([ns, b]) => {
            const isUnhealthyNs = unhealthyNamespaces?.has(ns);
            const fillColor = isUnhealthyNs ? "#ef4444" : b.color;
            const isDimmedNs = nsFilter && ns !== nsFilter;
            if (isDimmedNs) return null;
            return (
              <g key={ns} opacity={selectedNode ? 0.3 : 0.7}>
                <rect
                  x={b.minX - pad} y={b.minY - pad}
                  width={b.maxX - b.minX + pad * 2} height={b.maxY - b.minY + pad * 2}
                  rx={14} ry={14}
                  fill={fillColor} fillOpacity={0.03}
                  stroke={fillColor} strokeWidth={0.8} strokeOpacity={isUnhealthyNs ? 0.4 : 0.15}
                  strokeDasharray={isUnhealthyNs ? "4 3" : undefined}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); setNsFilter(nsFilter === ns ? null : ns); }}
                />
                <text
                  x={b.minX - pad + 8} y={b.minY - pad - 4}
                  fontSize={9} fontFamily="monospace"
                  fill={fillColor} fillOpacity={nsFilter === ns ? 0.8 : 0.4}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); setNsFilter(nsFilter === ns ? null : ns); }}
                >{isUnhealthyNs ? "⚠ " : ""}{ns}{nsFilter === ns ? " ✕" : ""}{nsPodCounts?.[ns] !== undefined ? ` · ${nsPodCounts[ns]}p` : ""}</text>
              </g>
            );
          });
        })()}

        {/* Nodes */}
        {topoNodes.map((node) => {
          const pos = nodePos(node);
          const r = nodeRadius(node.type, node);
          const isActive = node.type === "node";
          const isService = node.type === "service";
          const nodeColor = getNodeColor(node);
          const isSelected = selectedNode === node.id;
          const isNeighbor = selectedNode && selectedNode !== node.id &&
            topoLinks.some(l => (l.source === selectedNode && l.target === node.id) || (l.target === selectedNode && l.source === node.id));
          const matchesSearch = !searchQuery || node.label.toLowerCase().includes(searchQuery.toLowerCase()) || node.id.toLowerCase().includes(searchQuery.toLowerCase());
          const matchesNs = !nsFilter || (node.serviceIdx !== undefined && services[node.serviceIdx]?.namespace === nsFilter);
          const isDimmed = (selectedNode && !isSelected && !isNeighbor) || (searchQuery && !matchesSearch) || (nsFilter && node.serviceIdx !== undefined && !matchesNs);

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

              {/* CPU usage arc for service nodes */}
              {isService && node.serviceIdx !== undefined && nsCpuRequestsM && (() => {
                const ns = services[node.serviceIdx]?.namespace;
                if (!ns) return null;
                const cpuM = nsCpuRequestsM[ns];
                if (!cpuM) return null;
                const cpuPct = Math.min(1, cpuM / 15950);
                if (cpuPct < 0.01) return null;
                const startAngle = -Math.PI / 2;
                const endAngle = startAngle + cpuPct * 2 * Math.PI;
                const x1 = Math.cos(startAngle) * r;
                const y1 = Math.sin(startAngle) * r;
                const x2 = Math.cos(endAngle) * r;
                const y2 = Math.sin(endAngle) * r;
                const largeArc = cpuPct > 0.5 ? 1 : 0;
                const arcColor = cpuPct > 0.3 ? "#ef4444" : cpuPct > 0.15 ? "#eab308" : "#58a6ff";
                return (
                  <path
                    d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
                    fill="none"
                    stroke={arcColor}
                    strokeWidth={2.5}
                    opacity={0.3}
                    strokeLinecap="round"
                  />
                );
              })()}

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

              {/* Namespace label below service nodes */}
              {isService && node.serviceIdx !== undefined && (() => {
                const svc = services[node.serviceIdx];
                if (!svc) return null;
                const ns = svc.namespace.length > 12 ? svc.namespace.slice(0, 11) + "…" : svc.namespace;
                return (
                  <text
                    textAnchor="middle"
                    y={r + 16}
                    fontSize={7}
                    fill="#4b5563"
                    fontFamily="monospace"
                    opacity={0.8}
                  >{ns}</text>
                );
              })()}

              {/* M2 node CPU + RAM inline bars */}
              {node.id === "m2" && (nodeMetrics || nsCpuRequestsM) && (() => {
                const cpu = nodeMetrics ? (parseInt(nodeMetrics.cpuPct, 10) || 0) : Math.round(Math.min(100, (Object.values(nsCpuRequestsM!).reduce((a,b)=>a+b,0) / 15950) * 100));
                const mem = nodeMetrics ? (parseInt(nodeMetrics.memPct, 10) || 0) : 0;
                const isReq = !nodeMetrics;
                const cpuColor = cpu > 80 ? "#ef4444" : cpu > 60 ? "#eab308" : "#22c55e";
                const memColor = mem > 80 ? "#f97316" : mem > 60 ? "#a855f7" : "#06b6d4";
                const bw = r * 1.4;
                const bh = 3;
                const bx = -bw / 2;
                const by = r * 0.72;
                return (
                  <g>
                    <rect x={bx} y={by} width={bw} height={bh} rx={1.5} fill="#1c2128" opacity={0.7} />
                    <rect x={bx} y={by} width={bw * cpu / 100} height={bh} rx={1.5} fill={cpuColor} opacity={0.9} />
                    {!isReq && <><rect x={bx} y={by + bh + 2} width={bw} height={bh} rx={1.5} fill="#1c2128" opacity={0.7} />
                    <rect x={bx} y={by + bh + 2} width={bw * mem / 100} height={bh} rx={1.5} fill={memColor} opacity={0.9} /></>}
                    {isReq && <text x={0} y={by + bh + 8} textAnchor="middle" fontSize={7} fill={cpuColor} fontFamily="monospace" opacity={0.8}>{cpu}%req</text>}
                  </g>
                );
              })()}

              {/* Longhorn storage fill bar */}
              {node.id === "longhorn" && longhornStorage && (() => {
                const pct = Math.min(100, longhornStorage.pct);
                const color = pct > 80 ? "#ef4444" : pct > 60 ? "#eab308" : "#3b82f6";
                const bw = r * 1.4; const bh = 4; const bx = -bw / 2; const by = r * 0.72;
                return (
                  <g>
                    <rect x={bx} y={by} width={bw} height={bh} rx={2} fill="#1c2128" opacity={0.7} />
                    <rect x={bx} y={by} width={bw * pct / 100} height={bh} rx={2} fill={color} opacity={0.9} />
                    <text x={0} y={by + bh + 8} textAnchor="middle" fontSize={7} fill={color} fontFamily="monospace">{pct}%</text>
                  </g>
                );
              })()}

              {/* ArgoCD sync progress bar */}
              {node.id === "argocd" && apps && (() => {
                const total = apps.length;
                const synced = apps.filter(a => a.sync === "Synced").length;
                const pct = total > 0 ? (synced / total) * 100 : 100;
                const color = pct < 100 ? "#eab308" : "#22c55e";
                const bw = r * 1.4; const bh = 4; const bx = -bw / 2; const by = r * 0.72;
                return (
                  <g>
                    <rect x={bx} y={by} width={bw} height={bh} rx={2} fill="#1c2128" opacity={0.7} />
                    <rect x={bx} y={by} width={bw * pct / 100} height={bh} rx={2} fill={color} opacity={0.9} />
                    <text x={0} y={by + bh + 8} textAnchor="middle" fontSize={7} fill={color} fontFamily="monospace">{synced}/{total}</text>
                  </g>
                );
              })()}

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

              {/* Warning events badge on service nodes */}
              {isService && node.serviceIdx !== undefined && recentEvents && (() => {
                const svc = services[node.serviceIdx];
                if (!svc) return null;
                const evtCount = recentEvents.filter(e => e.namespace === svc.namespace).length;
                if (evtCount === 0) return null;
                return (
                  <g transform={`translate(${r * 0.72}, ${r * 0.72})`}>
                    <circle r={8} fill="#1c2128" stroke="#eab308" strokeWidth={1} opacity={0.9} />
                    <text textAnchor="middle" dominantBaseline="middle" fontSize={7} fill="#eab308" fontFamily="monospace" fontWeight="bold">{evtCount}</text>
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
        const totalCpuReqM = nsCpuRequestsM ? Object.values(nsCpuRequestsM).reduce((a, b) => a + b, 0) : null;
        const tService = tNode && tNode.serviceIdx !== undefined ? services[tNode.serviceIdx] : null;
        const svcPods = tService && nsPodCounts ? nsPodCounts[tService.namespace] : null;
        const svcCpuM = tService && nsCpuRequestsM ? nsCpuRequestsM[tService.namespace] : null;
        const svcEvents = tService && recentEvents ? recentEvents.filter(e => e.namespace === tService.namespace).length : 0;
        const isUnhealthy = tService && unhealthyNamespaces?.has(tService.namespace);
        return (
          <div
            className="fixed z-50 pointer-events-none bg-gray-900/95 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 shadow-xl font-mono"
            style={{ left: tooltip.x, top: tooltip.y, backdropFilter: "blur(8px)", minWidth: 160 }}
          >
            {tNode && <div className="font-bold text-sm mb-1" style={{ color: tNode.id === "m2" && m2DynamicColor ? m2DynamicColor : tNode.color }}>{tNode.icon} {tNode.label}</div>}
            <div className="text-gray-400">{tooltip.text}</div>
            {tService && (
              <div className="mt-1.5 space-y-0.5">
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">ns</span>
                  <span className="text-gray-400">{tService.namespace}</span>
                </div>
                {svcPods !== null && <div className="flex justify-between gap-4">
                  <span className="text-gray-600">pods</span>
                  <span className="text-gray-400">{svcPods}</span>
                </div>}
                {svcCpuM !== null && svcCpuM !== undefined && <div className="flex justify-between gap-4">
                  <span className="text-gray-600">cpu req</span>
                  <span className="text-blue-400">{svcCpuM >= 1000 ? `${(svcCpuM/1000).toFixed(1)}c` : `${svcCpuM}m`}</span>
                </div>}
                {svcEvents > 0 && <div className="flex justify-between gap-4">
                  <span className="text-gray-600">events</span>
                  <span className="text-yellow-400">⚠ {svcEvents}</span>
                </div>}
                {svcRestarts !== undefined && svcRestarts > 0 && <div className="flex justify-between gap-4">
                  <span className="text-gray-600">restarts</span>
                  <span style={{ color: svcRestarts > 100 ? "#ef4444" : svcRestarts > 20 ? "#f97316" : "#eab308" }}>↺ {svcRestarts}</span>
                </div>}
                {isUnhealthy && <div className="text-red-400 mt-0.5">⚠ unhealthy pods detected</div>}
              </div>
            )}
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
            {isM2 && !nodeMetrics && totalCpuReqM !== null && (
              <div className="mt-1.5 space-y-0.5">
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">CPU req</span>
                  <span className="text-blue-400">{(totalCpuReqM/1000).toFixed(1)}c / 15.9c ({Math.round(totalCpuReqM/159)}%)</span>
                </div>
                {podTotal !== null && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600">pods</span>
                    <span className="text-gray-400">{podTotal}</span>
                  </div>
                )}
                {longhornStorage && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600">storage</span>
                    <span className="text-violet-400">{longhornStorage.usedGiB}G / {longhornStorage.totalGiB}G ({longhornStorage.pct.toFixed(0)}%)</span>
                  </div>
                )}
                {apps && apps.length > 0 && (() => {
                  const synced = apps.filter(a => a.sync === "Synced").length;
                  const ok = synced === apps.length;
                  return (
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600">argocd</span>
                      <span style={{ color: ok ? "#22c55e" : "#eab308" }}>{synced}/{apps.length} synced</span>
                    </div>
                  );
                })()}
                {unhealthyNamespaces && unhealthyNamespaces.size > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600">health</span>
                    <span className="text-red-400">⚠ {unhealthyNamespaces.size} ns degraded</span>
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
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#ef4444" }} />
          <span className="text-gray-400">Service (unhealthy)</span>
        </div>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-6 h-0.5" style={{ background: "#58a6ff" }} />
          <span className="text-gray-400">Network link</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <svg width="20" height="12" viewBox="0 0 20 12">
            <rect x="1" y="1" width="18" height="10" rx="3" fill="none" stroke="#58a6ff" strokeWidth="1" strokeDasharray="2,2" opacity="0.5" />
          </svg>
          <span className="text-gray-400">Namespace group</span>
        </div>
        <div className="border-t border-gray-800 pt-2 font-mono text-gray-600 space-y-0.5">
          <div>{topoNodes.length} nodes · {topoLinks.length} links</div>
          <div>{topoLinks.filter(l => l.style === "solid").length} active · {topoLinks.filter(l => l.style === "dashed").length} planned</div>
          <div>{uniqueNamespaces.length} namespaces shown</div>
          {unhealthyNamespaces && unhealthyNamespaces.size > 0 && (
            <div className="text-red-500/70">⚠ {unhealthyNamespaces.size} ns degraded</div>
          )}
          {recentEvents && recentEvents.length > 0 && (
            <div className="text-yellow-600/60">⚡ {recentEvents.length} warning event{recentEvents.length !== 1 ? "s" : ""}</div>
          )}
          {selectedNode ? <div className="text-blue-500/70">click bg to deselect</div> : <div>scroll to zoom · drag to pan</div>}
        </div>
      </div>

      {/* Mini-map (bottom right) */}
      <div className="absolute bottom-5 right-5 bg-gray-950/90 border border-gray-800/60 rounded-lg overflow-hidden" style={{ width: 126, height: 94 }}>
        <svg width={126} height={94} viewBox="0 0 126 94">
          <rect width={126} height={94} fill="#05050e" />
          {/* Links */}
          {topoLinks.map((link, li) => {
            const src = topoNodes.find(n => n.id === link.source);
            const tgt = topoNodes.find(n => n.id === link.target);
            if (!src || !tgt) return null;
            return (
              <line key={li}
                x1={src.x * 126} y1={src.y * 94}
                x2={tgt.x * 126} y2={tgt.y * 94}
                stroke={link.color}
                strokeWidth={0.6}
                opacity={link.style === "dashed" ? 0.15 : 0.3}
                strokeDasharray={link.style === "dashed" ? "2,1" : undefined}
              />
            );
          })}
          {/* Nodes */}
          {topoNodes.map((n, ni) => {
            const r = (n.type === "node" || n.type === "node-planned") ? 3 : n.type === "service" ? 2 : 1.8;
            const isFiltered = nsFilter && n.serviceIdx !== undefined && services[n.serviceIdx]?.namespace !== nsFilter;
            return (
              <circle key={ni}
                cx={n.x * 126} cy={n.y * 94}
                r={r}
                fill={n.color}
                opacity={isFiltered ? 0.12 : selectedNode === n.id ? 1 : 0.55}
              />
            );
          })}
          {/* Viewport rectangle */}
          {dims.w > 0 && (() => {
            const vpLeft = (-dims.w / 2 - pan.x) / zoom + dims.w / 2;
            const vpRight = (dims.w / 2 - pan.x) / zoom + dims.w / 2;
            const vpTop = (-dims.h / 2 - pan.y) / zoom + dims.h / 2;
            const vpBot = (dims.h / 2 - pan.y) / zoom + dims.h / 2;
            const mmX = (vpLeft / dims.w) * 126;
            const mmY = (vpTop / dims.h) * 94;
            const mmW = ((vpRight - vpLeft) / dims.w) * 126;
            const mmH = ((vpBot - vpTop) / dims.h) * 94;
            return (
              <rect x={mmX} y={mmY} width={mmW} height={mmH}
                fill="#58a6ff" fillOpacity={0.05}
                stroke="#58a6ff" strokeWidth={0.8} strokeOpacity={0.5} rx={1} />
            );
          })()}
        </svg>
        <div className="absolute bottom-0.5 right-1.5 text-[7px] font-mono text-gray-700 pointer-events-none">minimap</div>
      </div>
    </div>
  );
}
