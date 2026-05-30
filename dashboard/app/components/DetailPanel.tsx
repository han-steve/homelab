"use client";

import { useState } from "react";
import { services, node, type Service } from "../data";

const CATEGORY_COLORS: Record<string, string> = {
  app: "#7c3aed",
  infra: "#f0883e",
  monitoring: "#06b6d4",
  storage: "#3b82f6",
};

function Sparkline({ data, color, height = 20 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return null;
  const w = 120, h = height;
  const max = Math.max(...data, 1);
  const xs = data.map((_, i) => (i / (data.length - 1)) * w);
  const ys = data.map(v => h - (v / max) * (h - 2) - 1);
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} className="block">
      <polyline points={xs.map((x, i) => `${x},${ys[i]}`).join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={2} fill={color} opacity={0.9} />
    </svg>
  );
}

function StatusBadge({ status }: { status: Service["status"] }) {
  const styles = {
    running: "bg-green-500/20 text-green-400 border-green-500/30",
    degraded: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    stopped: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <span className={"px-2 py-0.5 rounded-full text-xs font-medium border " + styles[status]}>
      {status}
    </span>
  );
}

function CategoryBadge({ category }: { category: Service["category"] }) {
  const styles: Record<string, string> = {
    app: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    infra: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    monitoring: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    storage: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };
  return (
    <span className={"px-2 py-0.5 rounded-full text-xs font-medium border ml-2 " + styles[category]}>
      {category}
    </span>
  );
}

export default function DetailPanel({
  selectedIdx, onClose, onSelectService, nodeMetrics, nsPodCounts, recentEvents, metricsHistory, longhornStorage, unhealthyPods, certificates, apps, nsCpuRequestsM, nsMemRequestsMi, topCpuPods,
}: {
  selectedIdx: number | null;
  onClose: () => void;
  onSelectService?: (idx: number) => void;
  nodeMetrics?: { cpuCores: string; memoryi: string; cpuPct: string; memPct: string } | null;
  nsPodCounts?: Record<string, number>;
  recentEvents?: { namespace: string; name: string; reason: string; message: string; count: number; age: string }[];
  metricsHistory?: { cpu: number; ram: number; ts: number }[];
  longhornStorage?: { totalGiB: number; usedGiB: number; freeGiB: number; pct: number } | null;
  unhealthyPods?: { namespace: string; name: string; status: string; restarts: number }[];
  certificates?: { name: string; namespace: string; daysLeft: number; ready: boolean }[];
  apps?: { name: string; sync: string; health: string }[];
  nsCpuRequestsM?: Record<string, number>;
  nsMemRequestsMi?: Record<string, number>;
  topCpuPods?: { namespace: string; name: string; cpu: string; memory: string; cpuM: number }[];
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Map namespace → max restart count from unhealthy pods
  const nsMaxRestarts: Record<string, number> = {};
  if (unhealthyPods) {
    for (const pod of unhealthyPods) {
      if (pod.restarts > 0) {
        nsMaxRestarts[pod.namespace] = Math.max(nsMaxRestarts[pod.namespace] || 0, pod.restarts);
      }
    }
  }

  if (selectedIdx === null) {
    const categories = ["all", "app", "infra", "monitoring", "storage"];
    const filteredServices = services.filter(s => {
      const matchCat = categoryFilter === "all" || s.category === categoryFilter;
      const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.category.includes(search.toLowerCase());
      return matchCat && matchSearch;
    });

    return (
      <div className="w-80 bg-gray-950/90 backdrop-blur-xl border-l border-gray-800/50 p-6 overflow-y-auto">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-xl">{"\u26A1"}</div>
          <div>
            <h2 className="text-lg font-semibold text-gray-100 font-mono">M2 Node</h2>
            <p className="text-xs text-green-400 font-mono">{"\u25CF"} ONLINE</p>
          </div>
        </div>

        <div className="space-y-2.5 text-sm mb-6">
          <InfoRow label="IP" value={node.ip} accent />
          <InfoRow label="OS" value={node.os} />
          <InfoRow label="CPU" value={node.cpu} />
          <InfoRow label="RAM" value={node.ram} />
          <InfoRow label="Storage" value={node.storage} />
          <InfoRow label="K8s" value={node.k8sVersion} />
          {nodeMetrics && (
            <>
              <div className="h-px bg-gray-800/60 mt-1" />
              <InfoRow label="CPU use" value={nodeMetrics.cpuCores + " (" + nodeMetrics.cpuPct + ")"} accent bar />
              <InfoRow label="RAM use" value={nodeMetrics.memoryi + " (" + nodeMetrics.memPct + ")"} bar />
              {metricsHistory && metricsHistory.length >= 2 && (
                <div className="mt-2">
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-gray-700 font-mono">CPU history</span>
                        <span className="text-xs font-mono text-gray-600">
                          avg {Math.round(metricsHistory.reduce((s, m) => s + m.cpu, 0) / metricsHistory.length)}%
                          · peak {Math.max(...metricsHistory.map(m => m.cpu))}%
                        </span>
                      </div>
                      <Sparkline data={metricsHistory.map(m => m.cpu)} color="#58a6ff" height={18} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-gray-700 font-mono">RAM history</span>
                        <span className="text-xs font-mono text-gray-600">
                          avg {Math.round(metricsHistory.reduce((s, m) => s + m.ram, 0) / metricsHistory.length)}%
                          · peak {Math.max(...metricsHistory.map(m => m.ram))}%
                        </span>
                      </div>
                      <Sparkline data={metricsHistory.map(m => m.ram)} color="#06b6d4" height={18} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent mb-4" />

        {/* Quick service health grid */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider font-mono">Services</h3>
            <span className="text-xs font-mono text-green-400">
              {services.filter((s) => s.status === "running").length}/{services.length}
            </span>
          </div>
          <div className="grid grid-cols-8 gap-1">
            {services.map((svc, i) => (
              <button
                key={svc.name}
                title={svc.name}
                onClick={() => onSelectService?.(i)}
                className="group relative flex items-center justify-center rounded text-base transition-all hover:scale-110"
                style={{
                  width: 28, height: 28,
                  background: svc.status === "running" ? CATEGORY_COLORS[svc.category] + "20" : "#1a1a2e",
                  border: "1px solid " + (svc.status === "running" ? CATEGORY_COLORS[svc.category] + "40" : "#333"),
                }}
              >
                <span className="text-sm leading-none">{svc.icon}</span>
                <span
                  className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full"
                  style={{ background: svc.status === "running" ? "#22c55e" : svc.status === "degraded" ? "#eab308" : "#ef4444" }}
                />
              </button>
            ))}
          </div>
          {/* Category breakdown bar */}
          <div className="mt-2 flex h-1 rounded-full overflow-hidden">
            {(["app", "infra", "monitoring", "storage"] as const).map(cat => {
              const count = services.filter(s => s.category === cat).length;
              return (
                <div
                  key={cat}
                  style={{ flex: count, backgroundColor: CATEGORY_COLORS[cat], opacity: 0.5 }}
                  title={`${cat}: ${count}`}
                />
              );
            })}
          </div>
          <div className="mt-1 flex gap-2.5 flex-wrap">
            {(["app", "infra", "monitoring", "storage"] as const).map(cat => {
              const count = services.filter(s => s.category === cat).length;
              return (
                <span key={cat} className="text-xs font-mono" style={{ color: CATEGORY_COLORS[cat] + "aa" }}>
                  {count} {cat}
                </span>
              );
            })}
          </div>
        </div>

        {/* Namespace CPU allocation mini-chart */}
        {nsCpuRequestsM && Object.keys(nsCpuRequestsM).length > 0 && (() => {
          const entries = Object.entries(nsCpuRequestsM)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
          const maxVal = entries[0]?.[1] || 1;
          return (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider font-mono">Top CPU Requests</h3>
                <span className="text-xs font-mono text-gray-700">by namespace</span>
              </div>
              <div className="space-y-1">
                {entries.map(([ns, milli]) => {
                  const pct = (milli / maxVal) * 100;
                  const label = milli >= 1000 ? `${(milli/1000).toFixed(1)}c` : `${milli}m`;
                  return (
                    <div key={ns} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-700 w-24 shrink-0 truncate">{ns}</span>
                      <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-blue-500/60" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-mono text-gray-700 w-10 text-right shrink-0">{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Top Pods by CPU */}
        {topCpuPods && topCpuPods.length > 0 && (() => {
          const maxM = topCpuPods[0].cpuM || 1;
          return (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider font-mono">Top CPU Pods</h3>
                <span className="text-xs font-mono text-gray-700">live usage</span>
              </div>
              <div className="space-y-1">
                {topCpuPods.slice(0, 5).map((pod, i) => {
                  const pct = (pod.cpuM / maxM) * 100;
                  const label = pod.cpuM >= 1000 ? `${(pod.cpuM/1000).toFixed(1)}c` : `${pod.cpuM}m`;
                  const color = pod.cpuM > 500 ? "#ef4444" : pod.cpuM > 200 ? "#eab308" : "#22c55e";
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-700 w-24 shrink-0 truncate" title={pod.namespace + "/" + pod.name}>{pod.name.split("-").slice(0, 2).join("-")}</span>
                      <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                      <span className="text-xs font-mono w-10 text-right shrink-0" style={{ color }}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Search filter */}
        <div className="relative mb-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="filter services..."
            className="w-full bg-gray-900/80 border border-gray-800 rounded-md px-3 py-1.5 text-xs font-mono text-gray-400 placeholder-gray-700 focus:outline-none focus:border-gray-600 focus:text-gray-200 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 text-xs"
            >✕</button>
          )}
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 mb-3 flex-wrap">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={"px-2 py-0.5 rounded text-xs font-mono transition-all " + (
                categoryFilter === cat
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                  : "text-gray-600 hover:text-gray-400 border border-transparent"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          {categoryFilter === "all" && !search ? (
            // Namespace-grouped view
            (() => {
              const namespaceOrder = ["default", "media", "finance", "monitoring", "longhorn-system", "argocd", "kube-system"];
              const grouped: Record<string, typeof filteredServices> = {};
              filteredServices.forEach(svc => {
                const ns = svc.namespace || "default";
                if (!grouped[ns]) grouped[ns] = [];
                grouped[ns].push(svc);
              });
              const nsKeys = [...namespaceOrder.filter(ns => grouped[ns]), ...Object.keys(grouped).filter(ns => !namespaceOrder.includes(ns))];
              return nsKeys.map(ns => (
                <div key={ns}>
                  <div className="text-xs font-mono text-gray-700 px-2 pt-2 pb-0.5 uppercase tracking-wider border-b border-gray-800/50 mb-1 flex items-center justify-between">
                    <span>{ns}</span>
                    <span className="flex items-center gap-2 normal-case tracking-normal">
                      {nsCpuRequestsM?.[ns] && <span className="text-gray-700">{nsCpuRequestsM[ns] >= 1000 ? `${(nsCpuRequestsM[ns]/1000).toFixed(1)}c` : `${nsCpuRequestsM[ns]}m`}cpu</span>}
                      {nsPodCounts?.[ns] && <span className="text-gray-800">{nsPodCounts[ns]}p</span>}
                    </span>
                  </div>
                  {grouped[ns].map(svc => {
                    const i = services.indexOf(svc);
                    const restarts = nsMaxRestarts[svc.namespace] || 0;
                    return (
                      <div
                        key={svc.name}
                        className="flex items-center justify-between text-sm py-1.5 px-2 rounded-md hover:bg-gray-800/50 transition-colors cursor-pointer"
                        onClick={() => onSelectService?.(i)}
                      >
                        <span className="text-gray-300 flex items-center gap-2">
                          <span>{svc.icon}</span>
                          <span className="text-xs">{svc.name}</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          {restarts > 0 && (
                            <span className="text-xs font-mono text-yellow-600" title={`${restarts} restarts`}>↺{restarts}</span>
                          )}
                          <span className="text-gray-600 text-xs font-mono">
                            {svc.url ? svc.url.replace("https://", "").split(".")[0] : svc.ip.includes("homelab") ? svc.ip.split(".")[0] : svc.ip === "internal" ? "int" : svc.ip.split(".").pop()}
                          </span>
                          <div className="w-1.5 h-1.5 rounded-full" style={{
                            backgroundColor: svc.status === "running" ? "#22c55e" : svc.status === "degraded" ? "#eab308" : "#ef4444",
                            boxShadow: svc.status === "running" ? "0 0 4px #22c55e" : "none",
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ));
            })()
          ) : (
            filteredServices.map((svc) => {
              const i = services.indexOf(svc);
              const restarts = nsMaxRestarts[svc.namespace] || 0;
              return (
              <div
                key={svc.name}
                className="flex items-center justify-between text-sm py-1.5 px-2 rounded-md hover:bg-gray-800/50 transition-colors cursor-pointer"
                onClick={() => onSelectService?.(i)}
              >
                <span className="text-gray-300 flex items-center gap-2">
                  <span>{svc.icon}</span>
                  <span className="text-xs">{svc.name}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  {restarts > 0 && (
                    <span className="text-xs font-mono text-yellow-600" title={`${restarts} restarts`}>↺{restarts}</span>
                  )}
                  <span className="text-gray-600 text-xs font-mono">
                    {svc.url ? svc.url.replace("https://", "").split(".")[0] : svc.ip.includes("homelab") ? svc.ip.split(".")[0] : svc.ip === "internal" ? "int" : svc.ip.split(".").pop()}
                  </span>
                  <div className="w-1.5 h-1.5 rounded-full" style={{
                    backgroundColor: svc.status === "running" ? "#22c55e" : svc.status === "degraded" ? "#eab308" : "#ef4444",
                    boxShadow: svc.status === "running" ? "0 0 4px #22c55e" : "none",
                  }} />
                </div>
              </div>
              );
            })
          )}
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent my-4" />
        <div className="space-y-1 text-xs text-gray-600 font-mono">
          <p>CNI: Cilium v1.19.4</p>
          {longhornStorage ? (
            <div>
              <div className="flex items-center justify-between">
                <span>Storage: Longhorn</span>
                <span className="text-gray-500">{longhornStorage.usedGiB}G / {longhornStorage.totalGiB}G</span>
              </div>
              <div className="mt-0.5 h-1 rounded-full bg-gray-800 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${longhornStorage.pct}%`,
                    backgroundColor: longhornStorage.pct > 80 ? "#ef4444" : longhornStorage.pct > 60 ? "#eab308" : "#3b82f6",
                  }}
                />
              </div>
              <div className="text-gray-700 mt-0.5">{longhornStorage.freeGiB}G free · {longhornStorage.pct}% used</div>
            </div>
          ) : (
            <p>Storage: Longhorn</p>
          )}
          {apps && apps.length > 0 ? (() => {
            const synced = apps.filter(a => a.sync === "Synced").length;
            const healthy = apps.filter(a => a.health === "Healthy").length;
            const outOfSync = apps.length - synced;
            const degraded = apps.filter(a => a.health === "Degraded").length;
            return (
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span>GitOps: ArgoCD v3.4.2</span>
                  <span style={{ color: outOfSync > 0 ? "#eab308" : "#22c55e" }}>
                    {synced}/{apps.length} synced
                  </span>
                </div>
                <div className="flex h-1 rounded-full overflow-hidden gap-px mt-0.5">
                  {apps.map((a, i) => (
                    <div key={i} title={a.name}
                      className="flex-1 transition-all duration-300"
                      style={{
                        background: a.sync !== "Synced" ? "#eab308" : a.health === "Healthy" ? "#22c55e" : a.health === "Degraded" ? "#ef4444" : "#6b7280",
                      }}
                    />
                  ))}
                </div>
                {(outOfSync > 0 || degraded > 0) && (
                  <div className="text-xs mt-0.5" style={{ color: "#f87171" }}>
                    {outOfSync > 0 ? `${outOfSync} OutOfSync` : ""}{outOfSync > 0 && degraded > 0 ? " · " : ""}{degraded > 0 ? `${degraded} Degraded` : ""}
                  </div>
                )}
              </div>
            );
          })() : (
            <p>GitOps: ArgoCD v3.4.2</p>
          )}
          <p>LB: 192.168.1.11-30</p>
        </div>

        {/* Certificate expiry section */}
        {certificates && certificates.length > 0 && (
          <>
            <div className="h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent my-4" />
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider font-mono">TLS Certs</h3>
              <span className="text-xs font-mono text-gray-700">{certificates.filter(c => c.ready).length}/{certificates.length}</span>
            </div>
            <div className="space-y-1">
              {certificates.map((cert, i) => {
                const isExpiring = cert.daysLeft < 30;
                const isExpired = cert.daysLeft <= 0;
                const color = isExpired ? "#ef4444" : isExpiring ? "#eab308" : "#22c55e";
                const label = isExpired ? "expired" : cert.daysLeft < 9999 ? `${cert.daysLeft}d` : "—";
                return (
                  <div key={i} className="flex items-center justify-between text-xs font-mono">
                    <span className="text-gray-600 truncate flex-1" title={cert.namespace + "/" + cert.name}>{cert.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span style={{ color }} className="text-xs">{label}</span>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {recentEvents && recentEvents.length > 0 && (
          <>
            <div className="h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent my-4" />
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider font-mono">Warning Events</h3>
              <span className="text-xs font-mono text-orange-500/70">{recentEvents.length}</span>
            </div>
            <div className="space-y-1.5">
              {recentEvents.slice(0, 5).map((ev, i) => (
                <div key={i} className="text-xs font-mono bg-orange-500/5 border border-orange-500/15 rounded px-2 py-1.5">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-orange-400/80 truncate flex-1">{ev.reason}</span>
                    <span className="text-gray-700 shrink-0">{ev.age}</span>
                  </div>
                  <div className="text-gray-600 truncate">{ev.name}</div>
                  <div className="text-gray-700 truncate mt-0.5">{ev.message}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  const svc = services[selectedIdx];

  return (
    <div className="w-80 bg-gray-950/90 backdrop-blur-xl border-l border-gray-800/50 p-6 overflow-y-auto">
      <button onClick={onClose}
        className="flex items-center gap-2 text-xs mb-5 cursor-pointer font-mono transition-all px-3 py-1.5 rounded-md border border-gray-800 hover:border-gray-600 hover:bg-gray-800/60 text-gray-500 hover:text-gray-200"
      >
        <span className="text-base leading-none">{"\u2190"}</span>
        <span>back to overview</span>
      </button>

      {/* Prev/Next navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => onSelectService?.((selectedIdx - 1 + services.length) % services.length)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono border border-gray-800 hover:border-gray-600 text-gray-600 hover:text-gray-300 transition-all"
        >← prev</button>
        <span className="text-xs font-mono text-gray-700">{selectedIdx + 1} / {services.length}</span>
        <button
          onClick={() => onSelectService?.((selectedIdx + 1) % services.length)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono border border-gray-800 hover:border-gray-600 text-gray-600 hover:text-gray-300 transition-all"
        >next →</button>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
          style={{ backgroundColor: svc.color + "15", border: "1px solid " + svc.color + "30" }}
        >
          {svc.icon}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-100">{svc.name}</h2>
          <div className="flex items-center mt-1">
            <StatusBadge status={svc.status} />
            <CategoryBadge category={svc.category} />
          </div>
        </div>
      </div>

      <p className="text-gray-500 text-sm mt-3 mb-5 leading-relaxed">{svc.description}</p>

      <div className="h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent mb-4" />

      <div className="space-y-2.5 text-sm">
        <InfoRow label="Namespace" value={svc.namespace} />
        <InfoRow label="Endpoint" value={
          svc.url
            ? svc.url.replace("https://", "")
            : svc.ip === "internal" || svc.ip.includes(".")
              ? svc.ip.includes("homelab")
                ? svc.ip + ":" + svc.port
                : svc.name.toLowerCase() + "." + svc.namespace + ".svc:" + svc.port
              : svc.ip + ":" + svc.port
        } accent />
        <InfoRow label="Access" value={svc.url ? "LAN (" + svc.url.replace("https://", "") + ")" : "Cluster-only"} />
        <InfoRow label="Category" value={svc.category} />
      </div>

      {svc.url && (
        <a href={svc.url} target="_blank" rel="noopener noreferrer"
          className="mt-6 block w-full text-center py-2.5 px-4 rounded-lg text-sm font-medium transition-all hover:brightness-125"
          style={{
            backgroundColor: svc.color + "20",
            color: svc.color,
            border: "1px solid " + svc.color + "40",
            textShadow: "0 0 10px " + svc.color + "40",
          }}
        >
          Open {svc.name} {"\u2192"}
        </a>
      )}

      {/* Namespace pod status */}
      {nsPodCounts && nsPodCounts[svc.namespace] !== undefined && (
        <>
          <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent mt-5 mb-3" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-gray-600 uppercase tracking-wider">Namespace Pods</span>
            <span className="text-xs font-mono text-gray-500">{nsPodCounts[svc.namespace]} running</span>
          </div>
          {(() => {
            const nsIssues = unhealthyPods?.filter(p => p.namespace === svc.namespace) ?? [];
            if (nsIssues.length === 0) {
              return <div className="text-xs font-mono text-green-500/70">● All pods healthy</div>;
            }
            return (
              <div className="space-y-1">
                {nsIssues.map((pod, i) => (
                  <div key={i} className="flex items-center justify-between text-xs font-mono">
                    <span className="text-orange-400 truncate flex-1" title={pod.name}>{pod.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-1">
                      <span className="text-red-400">{pod.status}</span>
                      {pod.restarts > 0 && <span className="text-yellow-500">↺{pod.restarts}</span>}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </>
      )}

      {/* Live pod CPU for this namespace */}
      {topCpuPods && (() => {
        const nsPods = topCpuPods.filter(p => p.namespace === svc.namespace);
        if (nsPods.length === 0) return null;
        const maxM = Math.max(...nsPods.map(p => p.cpuM), 1);
        return (
          <>
            <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent mt-4 mb-3" />
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-mono text-gray-600 uppercase tracking-wider">Pod CPU (live)</span>
              <span className="text-xs font-mono text-gray-700">{nsPods.length} pod{nsPods.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="space-y-1">
              {nsPods.map((pod, i) => {
                const pct = (pod.cpuM / maxM) * 100;
                const label = pod.cpuM >= 1000 ? `${(pod.cpuM/1000).toFixed(1)}c` : `${pod.cpuM}m`;
                const color = pod.cpuM > 500 ? "#ef4444" : pod.cpuM > 200 ? "#eab308" : "#22c55e";
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-700 flex-1 truncate" title={pod.name}>{pod.name.split("-").slice(0, -2).join("-") || pod.name}</span>
                    <div className="w-20 h-1 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                    <span className="text-xs font-mono w-8 text-right shrink-0" style={{ color }}>{label}</span>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* kubectl command hint */}
      <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent mt-5 mb-3" />
      <div className="text-xs font-mono text-gray-700 break-all select-all cursor-text px-2 py-1.5 rounded bg-gray-900/50 border border-gray-800/50" title="Click to select all">
        kubectl -n {svc.namespace} get pods
      </div>
    </div>
  );
}

function InfoRow({ label, value, accent, bar }: { label: string; value: string; accent?: boolean; bar?: boolean }) {
  const pctMatch = bar ? value.match(/\((\d+)%\)/) : null;
  const pct = pctMatch ? parseInt(pctMatch[1], 10) : null;
  return (
    <div>
      <div className="flex justify-between items-center">
        <span className="text-gray-600 text-xs uppercase tracking-wider font-mono">{label}</span>
        <span className={"font-mono text-xs " + (accent ? "text-blue-400" : "text-gray-300")}>{value}</span>
      </div>
      {pct !== null && (
        <div className="h-0.5 bg-gray-800 rounded-full mt-0.5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(pct, 100)}%`,
              background: pct > 80 ? "#ef4444" : pct > 60 ? "#eab308" : "#58a6ff",
            }}
          />
        </div>
      )}
    </div>
  );
}
