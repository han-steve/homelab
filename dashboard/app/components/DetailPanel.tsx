"use client";

import { useState, useEffect } from "react";
import { services, node, type Service } from "../data";

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function relTime(iso: string | undefined, now: number): string {
  if (!iso) return "";
  const ms = now - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

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
  selectedIdx, onClose, onSelectService, nodeMetrics, nsPodCounts, recentEvents, metricsHistory, longhornStorage, unhealthyPods, certificates, apps, nsCpuRequestsM, nsMemRequestsMi, topCpuPods, podMetrics, recentPods, totalCpuRequestsM, totalMemRequestsMi, nsImages, longhornVolumes, nodePressures, kubeletVersion, nodeUptime, k8sServices, nsIngress, nsDeployments, nsCronJobs, nsHelmReleases, nsPvcs, podStatusCounts, nsStatefulSets, totalDaemonSets,
}: {
  selectedIdx: number | null;
  onClose: () => void;
  onSelectService?: (idx: number) => void;
  nodeMetrics?: { cpuCores: string; memoryi: string; cpuPct: string; memPct: string } | null;
  nsPodCounts?: Record<string, number>;
  recentEvents?: { namespace: string; name: string; reason: string; message: string; count: number; age: string; lastTimestamp?: string }[];
  metricsHistory?: { cpu: number; ram: number; pods: number; ts: number }[];
  longhornStorage?: { totalGiB: number; usedGiB: number; freeGiB: number; pct: number } | null;
  unhealthyPods?: { namespace: string; name: string; status: string; restarts: number }[];
  certificates?: { name: string; namespace: string; daysLeft: number; ready: boolean }[];
  apps?: { name: string; sync: string; health: string; syncedAt?: string | null }[];
  nsCpuRequestsM?: Record<string, number>;
  nsMemRequestsMi?: Record<string, number>;
  topCpuPods?: { namespace: string; name: string; cpu: string; memory: string; cpuM: number }[];
  podMetrics?: { namespace: string; name: string; cpu: string; memory: string; cpuM: number; memMi: number; startTime?: string }[];
  recentPods?: { namespace: string; name: string; startTime: string }[];
  totalCpuRequestsM?: number;
  totalMemRequestsMi?: number;
  nsImages?: Record<string, string[]>;
  longhornVolumes?: { name: string; state: string; robustness: string; sizeGiB: number; pvc?: string }[];
  nodePressures?: string[];
  kubeletVersion?: string;
  nodeUptime?: string | null;
  k8sServices?: { namespace: string; name: string; type: string; clusterIP: string; externalIP?: string; ports: string }[];
  nsIngress?: Record<string, string[]>;
  nsDeployments?: Record<string, { name: string; desired: number; available: number; ready: number }[]>;
  nsCronJobs?: Record<string, { name: string; schedule: string; lastSchedule?: string; active: number }[]>;
  nsHelmReleases?: Record<string, { name: string; chart: string; appVersion: string; status: string; updated: string }[]>;
  nsPvcs?: Record<string, { name: string; status: string; capacity: string; storageClass: string }[]>;
  podStatusCounts?: { running: number; pending: number; failed: number; unknown: number };
  nsStatefulSets?: Record<string, { name: string; desired: number; ready: number }[]>;
  totalDaemonSets?: number;
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showUnhealthyOnly, setShowUnhealthyOnly] = useState(false);
  const now = useNow();

  // Map namespace → max restart count from unhealthy pods
  const nsMaxRestarts: Record<string, number> = {};
  if (unhealthyPods) {
    for (const pod of unhealthyPods) {
      if (pod.restarts > 0) {
        nsMaxRestarts[pod.namespace] = Math.max(nsMaxRestarts[pod.namespace] || 0, pod.restarts);
      }
    }
  }
  const unhealthyNsSet = new Set((unhealthyPods ?? []).map(p => p.namespace));

  if (selectedIdx === null) {
    const categories = ["all", "app", "infra", "monitoring", "storage"];
    const filteredServices = services.filter(s => {
      const matchCat = categoryFilter === "all" || s.category === categoryFilter;
      const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.category.includes(search.toLowerCase());
      const matchHealth = !showUnhealthyOnly || unhealthyNsSet.has(s.namespace) || nsMaxRestarts[s.namespace] > 0;
      return matchCat && matchSearch && matchHealth;
    });

    return (
      <div className="w-80 bg-gray-950/90 backdrop-blur-xl border-l border-gray-800/50 p-6 overflow-y-auto">
        {/* Critical pod alert */}
        {unhealthyPods && unhealthyPods.some(p => p.status === "CrashLoopBackOff" || p.status === "Error" || (p.restarts && p.restarts > 50)) && (() => {
          const critPods = unhealthyPods.filter(p => p.status === "CrashLoopBackOff" || p.status === "Error" || (p.restarts && p.restarts > 50));
          return (
            <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/8 px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-semibold font-mono text-red-400 uppercase tracking-wider">Critical Alert</span>
              </div>
              {critPods.slice(0, 2).map((p, i) => (
                <div key={i} className="text-xs font-mono text-red-300/80">
                  {p.name.split("-").slice(0, 3).join("-")}: <span className="text-red-400">{p.status}</span>
                  {p.restarts > 0 && <span className="text-red-500/70"> ↺{p.restarts}</span>}
                </div>
              ))}
            </div>
          );
        })()}
        {/* Quick access links */}
        <div className="mb-4 grid grid-cols-4 gap-1">
          {[
            { icon: "🔄", label: "ArgoCD", url: "https://argocd.homelab", ns: "argocd" },
            { icon: "📊", label: "Grafana", url: "https://grafana.homelab", ns: "monitoring" },
            { icon: "💾", label: "Longhorn", url: "https://longhorn.homelab", ns: "longhorn-system" },
            { icon: "🏠", label: "HA", url: "https://ha.homelab", ns: "home-assistant" },
            { icon: "🎬", label: "Jellyfin", url: "https://jellyfin.homelab", ns: "media" },
            { icon: "💰", label: "Budget", url: "https://budget.homelab", ns: "actual-budget" },
            { icon: "☁️", label: "oCIS", url: "https://ocis.homelab", ns: "ocis" },
            { icon: "🗄️", label: "MinIO", url: "https://minio.homelab", ns: "backup" },
          ].map(({ icon, label, url, ns }) => {
            const hasIssue = (unhealthyPods ?? []).some(p => p.namespace === ns && (p.status === "CrashLoopBackOff" || p.restarts > 20));
            const hasPods = nsPodCounts?.[ns] !== undefined && (nsPodCounts[ns] ?? 0) > 0;
            const dotColor = hasIssue ? "#ef4444" : hasPods ? "#22c55e" : "#374151";
            return (
            <a key={label} href={url} target="_blank" rel="noopener noreferrer"
              className="relative flex flex-col items-center gap-0.5 px-1 py-1.5 rounded bg-gray-900/60 border border-gray-800/40 hover:border-gray-600/50 hover:bg-gray-800/60 transition-colors text-center"
              title={url}
            >
              <span className="text-sm">{icon}</span>
              <span className="text-[9px] font-mono text-gray-600 truncate w-full text-center">{label}</span>
              <span className="absolute top-1 right-1 w-1 h-1 rounded-full" style={{ backgroundColor: dotColor, boxShadow: hasPods && !hasIssue ? `0 0 3px ${dotColor}` : "none" }} />
            </a>
            );
          })}
        </div>
        {/* Quick status ribbon */}
        {(apps || unhealthyPods || longhornStorage || certificates) && (() => {
          const hasCriticalPod = unhealthyPods?.some(p => p.status === "CrashLoopBackOff" || p.status === "Error" || (p.restarts && p.restarts > 50));
          const podStatus = unhealthyPods ? (unhealthyPods.length === 0 ? "ok" : hasCriticalPod ? "err" : "warn") : "unknown";
          const argoStatus = apps ? (apps.every(a => a.sync === "Synced") ? "ok" : "warn") : "unknown";
          const storageStatus = longhornStorage ? (longhornStorage.pct > 80 ? "err" : longhornStorage.pct > 60 ? "warn" : "ok") : "unknown";
          const certStatus = certificates ? (certificates.some(c => c.daysLeft >= 0 && c.daysLeft < 14) ? "err" : certificates.some(c => c.daysLeft >= 0 && c.daysLeft < 30) ? "warn" : "ok") : "unknown";
          // Compute panel health score
          const syncScore = apps && apps.length > 0 ? (apps.filter(a => a.sync === "Synced").length / apps.length) * 35 : 35;
          const podScore = unhealthyPods ? (unhealthyPods.length === 0 ? 35 : hasCriticalPod ? Math.max(0, 35 - unhealthyPods.length * 7) : Math.max(5, 35 - unhealthyPods.length * 3)) : 35;
          const storageScore = longhornStorage ? (longhornStorage.pct > 80 ? 0 : longhornStorage.pct > 60 ? 8 : 15) : 15;
          const cpuReqPctForScore = (totalCpuRequestsM && totalCpuRequestsM > 0) ? (totalCpuRequestsM / 15950) * 100 : 0;
          const cpuScore = nodeMetrics ? (parseInt(nodeMetrics.cpuPct, 10) > 85 ? 0 : parseInt(nodeMetrics.cpuPct, 10) > 70 ? 7 : 15)
            : cpuReqPctForScore > 90 ? 5 : cpuReqPctForScore > 70 ? 10 : 15;
          const healthScore = Math.round(syncScore + podScore + storageScore + cpuScore);
          const scoreColor = healthScore >= 90 ? "#22c55e" : healthScore >= 70 ? "#eab308" : "#ef4444";
          const STATUS: Record<string, { label: string; color: string; bg: string }> = {
            ok: { label: "OK", color: "#22c55e", bg: "#052e16" },
            warn: { label: "WARN", color: "#eab308", bg: "#1c1400" },
            err: { label: "ERR", color: "#ef4444", bg: "#1c0505" },
            unknown: { label: "--", color: "#6b7280", bg: "#111827" },
          };
          const items: { label: string; status: string; value?: string }[] = [
            {
              label: "Pods",
              status: podStatus,
              value: unhealthyPods ? (hasCriticalPod ? `${unhealthyPods.length} issues` : unhealthyPods.length === 0 ? "all ok" : `${unhealthyPods.length} warn`) : undefined,
            },
            {
              label: "ArgoCD",
              status: argoStatus,
              value: apps ? `${apps.filter(a => a.sync === "Synced").length}/${apps.length}` : undefined,
            },
            {
              label: "Storage",
              status: storageStatus,
              value: longhornStorage ? `${longhornStorage.pct.toFixed(0)}%` : undefined,
            },
            {
              label: "Certs",
              status: certStatus,
              value: certificates ? `${certificates.length} certs` : undefined,
            },
          ];
          return (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-mono text-gray-700 uppercase tracking-wider">Cluster Health</span>
                <span className="text-lg font-bold font-mono" style={{ color: scoreColor }}>{healthScore}%</span>
              </div>
              <div className="flex gap-1.5 mb-0">
                {items.map(({ label, status, value }) => {
                  const s = STATUS[status];
                  return (
                    <div key={label} className="flex-1 rounded px-1 py-1 text-center" style={{ backgroundColor: s.bg, border: `1px solid ${s.color}20` }}>
                      <div className="text-gray-600 font-mono" style={{ fontSize: 9 }}>{label}</div>
                      <div className="font-mono font-semibold" style={{ fontSize: 9, color: s.color }}>{s.label}</div>
                      {value && <div className="font-mono truncate" style={{ fontSize: 8, color: s.color, opacity: 0.7 }}>{value}</div>}
                    </div>
                  );
                })}
              </div>
              {podStatusCounts && (podStatusCounts.pending > 0 || podStatusCounts.failed > 0) && (
                <div className="flex items-center gap-1.5 mt-1.5 text-[10px] font-mono">
                  <span className="text-green-500/70">{podStatusCounts.running} run</span>
                  {podStatusCounts.pending > 0 && <span className="text-yellow-400/80">{podStatusCounts.pending} pend</span>}
                  {podStatusCounts.failed > 0 && <span className="text-red-400/80">{podStatusCounts.failed} fail</span>}
                  {podStatusCounts.unknown > 0 && <span className="text-gray-500/70">{podStatusCounts.unknown} unk</span>}
                  <div className="flex-1 h-1 rounded-full overflow-hidden bg-gray-800/60 ml-1">
                    {(() => {
                      const total = podStatusCounts.running + podStatusCounts.pending + podStatusCounts.failed + podStatusCounts.unknown;
                      return total > 0 ? (
                        <div className="h-full flex">
                          <div className="bg-green-500/60" style={{ width: `${(podStatusCounts.running/total)*100}%` }} />
                          <div className="bg-yellow-400/70" style={{ width: `${(podStatusCounts.pending/total)*100}%` }} />
                          <div className="bg-red-500/70" style={{ width: `${(podStatusCounts.failed/total)*100}%` }} />
                        </div>
                      ) : null;
                    })()}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-xl">{"\u26A1"}</div>
          <div>
            <h2 className="text-lg font-semibold text-gray-100 font-mono">M2 Node</h2>
            <p className="text-xs text-green-400 font-mono">{"\u25CF"} ONLINE{nodeUptime && (<span className="text-gray-500 ml-1.5 font-mono text-[10px]">· {nodeUptime}</span>)}</p>
          </div>
        </div>

        <div className="space-y-2.5 text-sm mb-6">
          <InfoRow label="IP" value={node.ip} accent />
          <InfoRow label="OS" value={node.os} />
          <InfoRow label="CPU" value={node.cpu} />
          <InfoRow label="RAM" value={node.ram} />
          <InfoRow label="Storage" value={node.storage} />
          <InfoRow label="K8s" value={kubeletVersion || node.k8sVersion} />
          {/* Node pressure conditions */}
          {nodePressures && nodePressures.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {nodePressures.map((p, i) => (
                <span key={i} className="text-xs font-mono px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20">{p}</span>
              ))}
            </div>
          )}
          {(nodeMetrics || (totalCpuRequestsM && totalCpuRequestsM > 0)) && (
            <>
              <div className="h-px bg-gray-800/60 mt-1" />
              {(() => {
                const allocCpuM = 15950;
                const allocMemMi = Math.round(31753032 / 1024);
                const cpuPct = nodeMetrics ? (parseInt(nodeMetrics.cpuPct, 10) || 0) : 0;
                const ramPct = nodeMetrics ? (parseInt(nodeMetrics.memPct, 10) || 0) : 0;
                const cpuReqPct = totalCpuRequestsM ? Math.min(100, (totalCpuRequestsM / allocCpuM) * 100) : 0;
                const memReqPct = totalMemRequestsMi ? Math.min(100, (totalMemRequestsMi / allocMemMi) * 100) : 0;
                // Trend: compare last 3 points to first 3 points of metricsHistory
                let cpuTrend = "→", ramTrend = "→";
                let cpuTrendColor = "#6b7280", ramTrendColor = "#6b7280";
                if (metricsHistory && metricsHistory.length >= 6) {
                  const recent = metricsHistory.slice(-3);
                  const older = metricsHistory.slice(0, 3);
                  const cpuDiff = recent.reduce((s, m) => s + m.cpu, 0) / 3 - older.reduce((s, m) => s + m.cpu, 0) / 3;
                  const ramDiff = recent.reduce((s, m) => s + m.ram, 0) / 3 - older.reduce((s, m) => s + m.ram, 0) / 3;
                  cpuTrend = cpuDiff > 3 ? "↑" : cpuDiff < -3 ? "↓" : "→";
                  ramTrend = ramDiff > 3 ? "↑" : ramDiff < -3 ? "↓" : "→";
                  cpuTrendColor = cpuDiff > 3 ? "#ef4444" : cpuDiff < -3 ? "#22c55e" : "#6b7280";
                  ramTrendColor = ramDiff > 3 ? "#ef4444" : ramDiff < -3 ? "#22c55e" : "#6b7280";
                }
                return (
                  <>
                    {nodeMetrics ? (
                      <>
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-gray-600">CPU use</span>
                          <span className="flex items-center gap-1">
                            <span style={{ color: cpuTrendColor }}>{cpuTrend}</span>
                            <span className="text-blue-400">{nodeMetrics.cpuCores}</span>
                            <span className="text-gray-600">({nodeMetrics.cpuPct})</span>
                          </span>
                        </div>
                        <div className="h-1 bg-gray-800 rounded-full overflow-hidden mt-0.5 mb-1.5">
                          <div className="h-full rounded-full bg-blue-500/60" style={{ width: `${cpuPct}%` }} />
                        </div>
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-gray-600">RAM use</span>
                          <span className="flex items-center gap-1">
                            <span style={{ color: ramTrendColor }}>{ramTrend}</span>
                            <span className="text-cyan-400">{nodeMetrics.memoryi}</span>
                            <span className="text-gray-600">({nodeMetrics.memPct})</span>
                          </span>
                        </div>
                        <div className="h-1 bg-gray-800 rounded-full overflow-hidden mt-0.5" style={{ marginBottom: metricsHistory && metricsHistory.length >= 2 ? 0 : undefined }}>
                          <div className="h-full rounded-full bg-cyan-500/60" style={{ width: `${ramPct}%` }} />
                        </div>
                      </>
                    ) : totalCpuRequestsM && totalCpuRequestsM > 0 ? (
                      <div className="flex items-center justify-between text-xs font-mono text-gray-600">
                        <span>requests</span>
                        <span className="flex items-center gap-3">
                          <span><span className="text-blue-400">{(totalCpuRequestsM/1000).toFixed(1)}c</span> cpu ({cpuReqPct.toFixed(0)}%)</span>
                          <span><span className="text-cyan-400">{totalMemRequestsMi ? (totalMemRequestsMi/1024).toFixed(0) : "0"}G</span> ram ({memReqPct.toFixed(0)}%)</span>
                        </span>
                      </div>
                    ) : null}
                  </>
                );
              })()}
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
                  {metricsHistory.some(m => m.pods > 0) && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-gray-700 font-mono">Pod count history</span>
                        <span className="text-xs font-mono text-gray-600">
                          min {Math.min(...metricsHistory.map(m => m.pods))} · max {Math.max(...metricsHistory.map(m => m.pods))}
                        </span>
                      </div>
                      <Sparkline data={metricsHistory.map(m => m.pods)} color="#a78bfa" height={14} />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent mb-4" />

        {/* Cluster capacity gauge: requests vs allocatable */}
        {totalCpuRequestsM !== undefined && totalCpuRequestsM > 0 && (() => {
          // Use real allocatable values from data or fall back to known M2 values
          const allocCpuM = 15950; // M2: 16 cores = 15950m allocatable
          const allocMemMi = Math.round(31753032 / 1024); // ~31003 MiB
          const cpuReqPct = Math.min(100, (totalCpuRequestsM / allocCpuM) * 100);
          const memReqMi = totalMemRequestsMi ?? 0;
          const memReqPct = Math.min(100, (memReqMi / allocMemMi) * 100);
          const cpuUsePct = nodeMetrics ? (parseInt(nodeMetrics.cpuPct, 10) || 0) : 0;
          const memUsePct = nodeMetrics ? (parseInt(nodeMetrics.memPct, 10) || 0) : 0;
          const cpuReqColor = cpuReqPct > 80 ? "#ef4444" : cpuReqPct > 60 ? "#eab308" : "#58a6ff";
          const memReqColor = memReqPct > 80 ? "#ef4444" : memReqPct > 60 ? "#eab308" : "#06b6d4";
          return (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider font-mono">Cluster Capacity</h3>
                <span className="text-xs font-mono text-gray-700">{cpuReqPct.toFixed(0)}% · {memReqPct.toFixed(0)}% req'd</span>
              </div>
              <div className="space-y-1.5">
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-gray-700 mb-0.5">
                    <span>CPU</span>
                    <span>{totalCpuRequestsM >= 1000 ? `${(totalCpuRequestsM/1000).toFixed(1)}c` : `${totalCpuRequestsM}m`} / {(allocCpuM/1000).toFixed(1)}c{cpuUsePct > 0 ? ` · ${cpuUsePct}% use` : ""}</span>
                  </div>
                  <div className="relative h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${cpuReqPct}%`, backgroundColor: cpuReqColor, opacity: 0.4 }} />
                    {cpuUsePct > 0 && <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${cpuUsePct}%`, backgroundColor: cpuReqColor, opacity: 0.7 }} />}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-gray-700 mb-0.5">
                    <span>RAM</span>
                    <span>{memReqMi >= 1024 ? `${(memReqMi/1024).toFixed(1)}G` : `${Math.round(memReqMi)}M`} / {(allocMemMi/1024).toFixed(0)}G{memUsePct > 0 ? ` · ${memUsePct}% use` : ""}</span>
                  </div>
                  <div className="relative h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${memReqPct}%`, backgroundColor: memReqColor, opacity: 0.4 }} />
                    {memUsePct > 0 && <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${memUsePct}%`, backgroundColor: memReqColor, opacity: 0.7 }} />}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

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

        {/* Workload summary row */}
        {(nsDeployments || nsStatefulSets || nsCronJobs) && (() => {
          const allDeps = nsDeployments ? Object.values(nsDeployments).flat() : [];
          const allSS = nsStatefulSets ? Object.values(nsStatefulSets).flat() : [];
          const totalDeploys = allDeps.length;
          const totalSS = allSS.length;
          const totalCJ = nsCronJobs ? Object.values(nsCronJobs).flat().length : 0;
          const totalDS = totalDaemonSets ?? 0;
          const depAvail = allDeps.filter(d => (d as {available?: number}).available === (d as {desired?: number}).desired).length;
          const ssAvail = allSS.filter(s => (s as {available?: number}).available === (s as {desired?: number}).desired).length;
          if (totalDeploys + totalSS + totalCJ + totalDS === 0) return null;
          return (
            <div className="mb-3 flex gap-2">
              {totalDeploys > 0 && (
                <div className="flex-1 rounded px-2 py-1.5 bg-green-500/5 border border-green-500/15 text-center">
                  <div className="text-lg font-bold font-mono text-green-500/80">{totalDeploys}</div>
                  <div className="text-[9px] font-mono text-gray-600">Deploys</div>
                  {depAvail < totalDeploys && <div className="text-[8px] font-mono text-yellow-500/70">{depAvail}/{totalDeploys}</div>}
                </div>
              )}
              {totalSS > 0 && (
                <div className="flex-1 rounded px-2 py-1.5 bg-cyan-500/5 border border-cyan-500/15 text-center">
                  <div className="text-lg font-bold font-mono text-cyan-500/80">{totalSS}</div>
                  <div className="text-[9px] font-mono text-gray-600">StatefulSets</div>
                  {ssAvail < totalSS && <div className="text-[8px] font-mono text-yellow-500/70">{ssAvail}/{totalSS}</div>}
                </div>
              )}
              {totalCJ > 0 && (
                <div className="flex-1 rounded px-2 py-1.5 bg-purple-500/5 border border-purple-500/15 text-center">
                  <div className="text-lg font-bold font-mono text-purple-500/80">{totalCJ}</div>
                  <div className="text-[9px] font-mono text-gray-600">CronJobs</div>
                </div>
              )}
              {totalDS > 0 && (
                <div className="flex-1 rounded px-2 py-1.5 bg-orange-500/5 border border-orange-500/15 text-center">
                  <div className="text-lg font-bold font-mono text-orange-500/80">{totalDS}</div>
                  <div className="text-[9px] font-mono text-gray-600">DaemonSets</div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Cluster scope stats strip */}
        {(nsDeployments || nsHelmReleases || k8sServices) && (() => {
          const nsAll = new Set<string>();
          for (const src of [nsDeployments, nsStatefulSets, nsCronJobs, nsIngress, nsPvcs]) {
            if (src) Object.keys(src).forEach(k => nsAll.add(k));
          }
          const nsCount = nsAll.size;
          const helmCount = nsHelmReleases ? Object.values(nsHelmReleases).flat().length : 0;
          const svcCount = k8sServices ? k8sServices.filter(s => s.type === "LoadBalancer" || s.type === "NodePort").length : 0;
          const imageCount = nsImages ? Object.values(nsImages).reduce((a, b) => a + (b?.length ?? 0), 0) : 0;
          const ingressCount = nsIngress ? Object.values(nsIngress).reduce((a, b) => a + b.length, 0) : 0;
          if (nsCount + helmCount + svcCount === 0) return null;
          return (
            <div className="mb-3 flex gap-1.5 text-center">
              {nsCount > 0 && <div className="flex-1 rounded px-1.5 py-1 bg-gray-900/60 border border-gray-800/40">
                <div className="text-sm font-bold font-mono text-gray-400">{nsCount}</div>
                <div className="text-[8px] font-mono text-gray-700">Namespaces</div>
              </div>}
              {helmCount > 0 && <div className="flex-1 rounded px-1.5 py-1 bg-gray-900/60 border border-gray-800/40">
                <div className="text-sm font-bold font-mono text-blue-400/60">{helmCount}</div>
                <div className="text-[8px] font-mono text-gray-700">Helm Releases</div>
              </div>}
              {ingressCount > 0 && <div className="flex-1 rounded px-1.5 py-1 bg-gray-900/60 border border-gray-800/40">
                <div className="text-sm font-bold font-mono text-cyan-400/60">{ingressCount}</div>
                <div className="text-[8px] font-mono text-gray-700">Ingresses</div>
              </div>}
              {imageCount > 0 && <div className="flex-1 rounded px-1.5 py-1 bg-gray-900/60 border border-gray-800/40">
                <div className="text-sm font-bold font-mono text-emerald-400/60">{imageCount}</div>
                <div className="text-[8px] font-mono text-gray-700">Images</div>
              </div>}
              {svcCount > 0 && <div className="flex-1 rounded px-1.5 py-1 bg-gray-900/60 border border-gray-800/40">
                <div className="text-sm font-bold font-mono text-purple-400/60">{svcCount}</div>
                <div className="text-[8px] font-mono text-gray-700">LB/NodePort</div>
              </div>}
            </div>
          );
        })()}

        {/* PVC Storage allocation per namespace */}
        {nsPvcs && Object.keys(nsPvcs).length > 0 && (() => {
          const parseGiB = (cap: string): number => {
            const m = cap.match(/^(\d+(?:\.\d+)?)(Gi|Mi|Ti|G|M|T)i?$/);
            if (!m) return 0;
            const v = parseFloat(m[1]);
            const u = m[2];
            if (u.startsWith("T")) return v * 1024;
            if (u.startsWith("G")) return v;
            if (u.startsWith("M")) return v / 1024;
            return v;
          };
          const nsTotals: Record<string, number> = {};
          for (const [ns, pvcs] of Object.entries(nsPvcs)) {
            nsTotals[ns] = pvcs.reduce((sum, pvc) => sum + parseGiB((pvc as {capacity?: string}).capacity ?? "0"), 0);
          }
          const entries = Object.entries(nsTotals).sort((a, b) => b[1] - a[1]);
          const totalGiB = entries.reduce((a, b) => a + b[1], 0);
          const maxGiB = entries[0]?.[1] ?? 1;
          return (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider font-mono">Storage Alloc</h3>
                <span className="text-xs font-mono text-gray-700">{totalGiB >= 1024 ? `${(totalGiB/1024).toFixed(1)}Ti` : `${totalGiB}Gi`} total</span>
              </div>
              <div className="space-y-1">
                {entries.map(([ns, gib]) => (
                  <div key={ns} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-700 w-24 shrink-0 truncate">{ns}</span>
                    <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-violet-400/40" style={{ width: `${(gib / maxGiB) * 100}%` }} />
                    </div>
                    <span className="text-xs font-mono text-violet-400/70 w-12 text-right shrink-0">{gib >= 1000 ? `${(gib/1024).toFixed(1)}Ti` : `${gib}Gi`}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Namespace resource allocation mini-charts (CPU + Memory) */}
        {(nsCpuRequestsM && Object.keys(nsCpuRequestsM).length > 0) && (() => {
          const allocCpuM = 15950;
          const allocMemMi = Math.round(31753032 / 1024);
          const cpuEntries = Object.entries(nsCpuRequestsM)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 7);
          const nsSet = new Set(cpuEntries.map(e => e[0]));
          const allNs = Array.from(nsSet);
          // Compute actual CPU per namespace from live podMetrics
          const nsCpuActual: Record<string, number> = {};
          if (podMetrics) {
            for (const pm of podMetrics) {
              nsCpuActual[pm.namespace] = (nsCpuActual[pm.namespace] || 0) + pm.cpuM;
            }
          }
          return (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider font-mono">Resource Requests</h3>
                <div className="flex items-center gap-2 text-xs font-mono text-gray-700">
                  <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-blue-500/60 rounded inline-block" />cpu</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-violet-500/60 rounded inline-block" />ram</span>
                </div>
              </div>
              <div className="space-y-1.5">
                {allNs.map(ns => {
                  const cpuM = nsCpuRequestsM[ns] || 0;
                  const memMi = (nsMemRequestsMi?.[ns]) || 0;
                  // Use absolute % of allocatable
                  const cpuPct = Math.min(100, (cpuM / allocCpuM) * 100);
                  const memPct = Math.min(100, (memMi / allocMemMi) * 100);
                  const cpuLabel = cpuM >= 1000 ? `${(cpuM/1000).toFixed(1)}c` : `${cpuM}m`;
                  const memLabel = memMi >= 1024 ? `${(memMi/1024).toFixed(1)}G` : `${Math.round(memMi)}M`;
                  const pods = nsPodCounts?.[ns] ?? 0;
                  // Efficiency: actual / requested
                  const actualM = nsCpuActual[ns] || 0;
                  const effPct = podMetrics && cpuM > 0 ? Math.round((actualM / cpuM) * 100) : 0;
                  const effColor = effPct > 120 ? "#ef4444" : effPct > 70 ? "#22c55e" : effPct > 30 ? "#eab308" : "#6b7280";
                  return (
                    <div key={ns}>
                      <div className="flex items-center justify-between text-xs font-mono text-gray-700 mb-0.5">
                        <span className="truncate flex-1">{ns}</span>
                        <span className="shrink-0 ml-2 flex items-center gap-2">
                          {pods > 0 && <span className="text-gray-700">{pods}p</span>}
                          {podMetrics && podMetrics.length > 0 && cpuM > 0 && <span style={{ color: effColor }} title={`${actualM}m actual vs ${cpuM}m req`}>{effPct}%</span>}
                          <span className="text-blue-400">{cpuLabel}</span>
                          <span className="text-violet-400">{memLabel}</span>
                        </span>
                      </div>
                      <div className="flex gap-1 h-1">
                        <div className="flex-1 h-full bg-gray-800 rounded-full overflow-hidden relative">
                          <div className="h-full rounded-full bg-blue-500/60 absolute inset-y-0 left-0" style={{ width: `${cpuPct}%` }} />
                          {actualM > 0 && <div className="h-full rounded-full bg-green-400/50 absolute inset-y-0 left-0" style={{ width: `${Math.min(100, (actualM / allocCpuM) * 100)}%`, mixBlendMode: "screen" }} />}
                        </div>
                        <div className="flex-1 h-full bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-violet-500/60" style={{ width: `${memPct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Top Pods by CPU + Memory */}
        {(topCpuPods && topCpuPods.length > 0) && (() => {
          const topMem = podMetrics ? [...podMetrics].sort((a, b) => b.memMi - a.memMi).slice(0, 5) : [];
          const maxCpuM = topCpuPods[0].cpuM || 1;
          const maxMemMi = topMem[0]?.memMi || 1;
          return (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider font-mono">Top Pods (live)</h3>
                <div className="flex items-center gap-3 text-xs font-mono text-gray-700">
                  <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-green-500/60 rounded inline-block" />CPU</span>
                  {topMem.length > 0 && <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-cyan-500/60 rounded inline-block" />RAM</span>}
                </div>
              </div>
              <div className="space-y-1">
                {topCpuPods.slice(0, 5).map((pod, i) => {
                  const pct = (pod.cpuM / maxCpuM) * 100;
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
              {topMem.length > 0 && (
                <div className="space-y-1 mt-2">
                  {topMem.map((pod, i) => {
                    const pct = (pod.memMi / maxMemMi) * 100;
                    const label = pod.memMi >= 1024 ? `${(pod.memMi/1024).toFixed(1)}G` : `${Math.round(pod.memMi)}M`;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-700 w-24 shrink-0 truncate" title={pod.namespace + "/" + pod.name}>{pod.name.split("-").slice(0, 2).join("-")}</span>
                        <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-cyan-500/60 transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-mono text-cyan-400 w-10 text-right shrink-0">{label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Namespace pod distribution (when no live CPU metrics) */}
        {(!topCpuPods || topCpuPods.length === 0) && nsPodCounts && Object.keys(nsPodCounts).length > 0 && (() => {
          const maxPods = Math.max(...Object.values(nsPodCounts));
          const entries = Object.entries(nsPodCounts).sort((a, b) => b[1] - a[1]).slice(0, 7);
          return (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider font-mono">Pod Distribution</h3>
                <span className="text-xs font-mono text-gray-700">{Object.values(nsPodCounts).reduce((a,b)=>a+b,0)} total</span>
              </div>
              <div className="space-y-1">
                {entries.map(([ns, count]) => {
                  const pct = (count / maxPods) * 100;
                  const issues = (unhealthyPods ?? []).filter(p => p.namespace === ns);
                  const hasCrit = issues.some(p => p.status === "CrashLoopBackOff");
                  const barColor = hasCrit ? "#ef4444" : issues.length > 0 ? "#f97316" : "#22c55e";
                  return (
                    <div key={ns} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-700 w-24 shrink-0 truncate" title={ns}>
                        {ns.startsWith("vc-") ? <span className="text-purple-700/70">⊕ </span> : null}{ns}
                      </span>
                      <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor, opacity: 0.6 }} />
                      </div>
                      <span className="text-xs font-mono w-8 text-right shrink-0 text-gray-700">{count}p</span>
                      {hasCrit && <span className="text-xs text-red-500/70 shrink-0">⚠</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Search filter */}
        <div className="relative mb-2 flex gap-1.5">
          <div className="relative flex-1">
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
          <button
            onClick={() => setShowUnhealthyOnly(v => !v)}
            title="Show unhealthy/restarting only"
            className={"px-2 py-1 rounded-md text-xs font-mono border transition-colors shrink-0 " + (
              showUnhealthyOnly
                ? "bg-red-500/15 border-red-700/50 text-red-400"
                : "border-gray-800 text-gray-600 hover:text-gray-400 hover:border-gray-600"
            )}
          >⚠</button>
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
                      {nsPodCounts?.[ns] !== undefined && (() => {
                        const total = nsPodCounts![ns];
                        const bad = (unhealthyPods ?? []).filter(p => p.namespace === ns).length;
                        const good = Math.max(0, total - bad);
                        if (bad > 0) {
                          return <span className="flex items-center gap-1">
                            <span className="text-green-700">{good}✓</span>
                            <span className="text-red-600">{bad}✗</span>
                          </span>;
                        }
                        return <span className="text-green-800">{total}p</span>;
                      })()}
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
              {longhornVolumes && longhornVolumes.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {longhornVolumes.slice(0, 6).map((vol, i) => {
                    const robColor = vol.robustness === "healthy" ? "#22c55e" : vol.robustness === "degraded" ? "#eab308" : "#ef4444";
                    const shortName = vol.pvc ?? vol.name.slice(0, 24);
                    return (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: robColor }} />
                        <span className="truncate flex-1 text-gray-700" title={vol.name}>{shortName}</span>
                        <span className="shrink-0 text-gray-700/60">{vol.sizeGiB}G</span>
                      </div>
                    );
                  })}
                  {longhornVolumes.length > 6 && <div className="text-gray-700/50">+{longhornVolumes.length - 6} more</div>}
                </div>
              )}
            </div>
          ) : (
            <p>Storage: Longhorn</p>
          )}
          {apps && apps.length > 0 ? (() => {
            const synced = apps.filter(a => a.sync === "Synced").length;
            const healthy = apps.filter(a => a.health === "Healthy").length;
            const outOfSync = apps.length - synced;
            const degraded = apps.filter(a => a.health === "Degraded").length;
            // Find most recently synced app
            const withTimestamp = apps.filter(a => a.syncedAt).sort((x, y) => new Date(y.syncedAt!).getTime() - new Date(x.syncedAt!).getTime());
            const lastSynced = withTimestamp[0];
            let lastSyncAgo = "";
            if (lastSynced?.syncedAt) {
              const ms = Date.now() - new Date(lastSynced.syncedAt).getTime();
              const mins = Math.floor(ms / 60000);
              const hrs = Math.floor(ms / 3600000);
              const days = Math.floor(ms / 86400000);
              lastSyncAgo = days > 0 ? `${days}d ago` : hrs > 0 ? `${hrs}h ago` : `${mins}m ago`;
            }
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
                {lastSyncAgo && (
                  <div className="text-xs mt-0.5 text-gray-700">last sync {lastSyncAgo} · {lastSynced.name}</div>
                )}
              </div>
            );
          })() : (
            <p>GitOps: ArgoCD v3.4.2</p>
          )}
          <p>LB: 192.168.1.11-30</p>
        </div>

        {/* Helm releases overview */}
        {nsHelmReleases && Object.keys(nsHelmReleases).length > 0 && (() => {
          const allReleases = Object.values(nsHelmReleases).flat();
          if (allReleases.length === 0) return null;
          const deployed = allReleases.filter(r => r.status === "deployed").length;
          return (
            <>
              <div className="h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent my-4" />
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider font-mono">Helm Releases</h3>
                <span className="text-xs font-mono text-gray-700">{deployed}/{allReleases.length} deployed</span>
              </div>
              <div className="space-y-0.5">
                {allReleases.map((rel, i) => {
                  let updatedAgo = "";
                  if (rel.updated) {
                    try {
                      const ms = Date.now() - new Date(rel.updated).getTime();
                      const days = Math.floor(ms / 86400000);
                      updatedAgo = days > 0 ? `${days}d` : `${Math.floor(ms/3600000)}h`;
                    } catch {/* ignore */}
                  }
                  return (
                  <div key={i} className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-1.5 truncate flex-1">
                      <span className={rel.status === "deployed" ? "text-green-500/60" : "text-yellow-400/70"}>⎈</span>
                      <span className="text-gray-600 truncate">{rel.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-gray-700 text-[10px]">{rel.chart.replace(/^[^-]+-/, "")}</span>
                      {updatedAgo && <span className="text-gray-800 text-[10px]">{updatedAgo}</span>}
                    </div>
                  </div>
                  );
                })}
              </div>
            </>
          );
        })()}

        {/* Certificate expiry section */}
        {certificates && certificates.length > 0 && (
          <>
            <div className="h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent my-4" />
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider font-mono">TLS Certs</h3>
              <span className="text-xs font-mono text-gray-700">{certificates.filter(c => c.ready).length}/{certificates.length}</span>
            </div>
            <div className="space-y-1.5">
              {[...certificates].sort((a, b) => a.daysLeft - b.daysLeft).map((cert, i) => {
                const isExpiring = cert.daysLeft < 30;
                const isExpired = cert.daysLeft <= 0;
                const isUrgent = cert.daysLeft < 14;
                const color = isExpired ? "#ef4444" : isUrgent ? "#ef4444" : isExpiring ? "#eab308" : "#22c55e";
                const bgColor = isExpired ? "#1c0505" : isUrgent ? "#1c0505" : isExpiring ? "#1c1400" : "#052e16";
                const label = isExpired ? "expired" : cert.daysLeft < 9999 ? `${cert.daysLeft}d` : "—";
                const expiryDate = cert.daysLeft < 9999 ? (() => {
                  const d = new Date(Date.now() + cert.daysLeft * 86400000);
                  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                })() : "";
                const maxDays = 90;
                const pct = Math.min(100, Math.max(0, (cert.daysLeft / maxDays) * 100));
                return (
                  <div key={i} className="rounded px-2 py-1.5" style={{ backgroundColor: bgColor, border: `1px solid ${color}18` }}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-mono text-gray-400 truncate flex-1 mr-2" title={cert.namespace + "/" + cert.name}>{cert.name}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {expiryDate && <span className="text-[9px] font-mono text-gray-700">{expiryDate}</span>}
                        <span className="text-[10px] font-mono font-bold" style={{ color }}>{label}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-0.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.7 }} />
                      </div>
                      <span className="text-[9px] font-mono text-gray-700 shrink-0">{cert.namespace.slice(0, 8)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {(recentEvents?.length || unhealthyPods?.some(p => p.restarts > 0) || recentPods?.length) && (
          <>
            <div className="h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent my-4" />
            {/* Top restarting pods */}
            {unhealthyPods && unhealthyPods.filter(p => p.restarts > 0).length > 0 && (() => {
              const restarting = [...unhealthyPods].filter(p => p.restarts > 0).sort((a, b) => b.restarts - a.restarts).slice(0, 5);
              const maxRestarts = restarting[0].restarts;
              return (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider font-mono">Restart Leaders</h3>
                    <span className="text-xs font-mono text-orange-500/70">{unhealthyPods.filter(p => p.restarts > 0).length} restarting</span>
                  </div>
                  <div className="space-y-1">
                    {restarting.map((pod, i) => {
                      const pct = (pod.restarts / maxRestarts) * 100;
                      const color = pod.restarts > 10 ? "#ef4444" : pod.restarts > 3 ? "#f97316" : "#eab308";
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs font-mono text-gray-700 w-28 shrink-0 truncate" title={pod.namespace + "/" + pod.name}>{pod.name.split("-")[0]}</span>
                          <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                          </div>
                          <span className="text-xs font-mono w-6 text-right shrink-0" style={{ color }}>↺{pod.restarts}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            {recentPods && recentPods.length > 0 && (() => {
              const fresh = recentPods.filter(p => (Date.now() - new Date(p.startTime).getTime()) < 7 * 24 * 3600000);
              if (fresh.length === 0) return null;
              const recentFresh = fresh.filter(p => (Date.now() - new Date(p.startTime).getTime()) < 3600000).length;
              return (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider font-mono">Recent Starts</h3>
                    <span className="text-xs font-mono text-green-500/50">{fresh.length} in 7d{recentFresh > 0 ? ` · ${recentFresh} &lt;1h` : ""}</span>
                  </div>
                  <div className="space-y-1">
                    {fresh.slice(0, 6).map((pod, i) => (
                      <div key={i} className="flex items-center justify-between text-xs font-mono">
                        <span className="text-green-400/50 shrink-0 mr-1 text-[9px]">↑</span>
                        <span className="text-gray-600 truncate flex-1" title={pod.namespace + "/" + pod.name}>{pod.name.replace(/-[a-z0-9]{5,}$/, "").slice(0, 22)}</span>
                        <span className="text-gray-500 shrink-0 ml-1 text-[10px]">{pod.namespace.slice(0, 10)}</span>
                        <span className="text-gray-700 shrink-0 ml-1">{relTime(pod.startTime, now)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            {recentEvents && recentEvents.length > 0 && (<>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider font-mono">Warning Events</h3>
              <span className="text-xs font-mono text-orange-500/70">{recentEvents.length}</span>
            </div>
            {/* Compact timeline */}
            <div className="relative pl-4 space-y-2 border-l border-gray-800/60 ml-1">
              {recentEvents.slice(0, 5).map((ev, i) => (
                <div key={i} className="relative text-xs font-mono">
                  {/* Timeline dot */}
                  <div className="absolute -left-[1.2rem] top-1 w-1.5 h-1.5 rounded-full bg-orange-500/60 border border-orange-500/30" />
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-orange-400/80 truncate flex-1">{ev.reason}</span>
                    <span className="text-gray-700 shrink-0 text-[10px]">{relTime(ev.lastTimestamp, now) || ev.age}</span>
                  </div>
                  <div className="text-gray-600 truncate">{ev.name}<span className="text-gray-800 mx-1">·</span>{ev.namespace}</div>
                  <div className="text-gray-700/80 truncate mt-0.5 text-[10px]">{ev.message}</div>
                </div>
              ))}
            </div>
            </>)}
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
        {/* Live K8s LoadBalancer/NodePort service endpoints */}
        {k8sServices && (() => {
          const nsEndpoints = k8sServices.filter(s => s.namespace === svc.namespace && s.externalIP);
          if (nsEndpoints.length === 0) return null;
          return (
            <div className="space-y-0.5">
              {nsEndpoints.slice(0, 3).map((ep, i) => (
                <div key={i} className="flex items-center justify-between text-xs font-mono text-gray-700">
                  <span className="text-gray-600 truncate">{ep.name}</span>
                  <span className="shrink-0 ml-1 text-green-600/80">{ep.externalIP}:{ep.ports.split(",")[0]}</span>
                </div>
              ))}
            </div>
          );
        })()}
        {/* Traefik IngressRoute hostnames */}
        {nsIngress?.[svc.namespace] && nsIngress[svc.namespace].length > 0 && (
          <div className="space-y-0.5">
            {nsIngress[svc.namespace].map((host, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs font-mono">
                <span className="text-indigo-500/60">↗</span>
                <a href={`https://${host}`} target="_blank" rel="noopener noreferrer"
                  className="text-indigo-400/80 hover:text-indigo-300 truncate transition-colors"
                  title={`Open https://${host}`}
                >{host}</a>
              </div>
            ))}
          </div>
        )}
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
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-gray-500">{nsPodCounts[svc.namespace]} running</span>
              {nsCpuRequestsM?.[svc.namespace] !== undefined && <span className="text-blue-500/60">{nsCpuRequestsM[svc.namespace] >= 1000 ? `${(nsCpuRequestsM[svc.namespace]/1000).toFixed(1)}c` : `${nsCpuRequestsM[svc.namespace]}m`}</span>}
              {nsMemRequestsMi?.[svc.namespace] !== undefined && <span className="text-violet-500/60">{nsMemRequestsMi[svc.namespace] >= 1024 ? `${(nsMemRequestsMi[svc.namespace]/1024).toFixed(1)}G` : `${Math.round(nsMemRequestsMi[svc.namespace])}M`}</span>}
            </div>
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
      {podMetrics && (() => {
        const nsPods = podMetrics.filter(p => p.namespace === svc.namespace);
        if (nsPods.length === 0) return null;
        const maxM = Math.max(...nsPods.map(p => p.cpuM), 1);
        const maxMem = Math.max(...nsPods.map(p => p.memMi), 1);
        return (
          <>
            <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent mt-4 mb-3" />
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-mono text-gray-600 uppercase tracking-wider">Pod Usage (live)</span>
              <span className="text-xs font-mono text-gray-700">{nsPods.length} pod{nsPods.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="space-y-1.5">
              {nsPods.map((pod, i) => {
                const cpuPct = (pod.cpuM / maxM) * 100;
                const memPct = (pod.memMi / maxMem) * 100;
                const cpuLabel = pod.cpuM >= 1000 ? `${(pod.cpuM/1000).toFixed(1)}c` : `${pod.cpuM}m`;
                const memLabel = pod.memMi >= 1024 ? `${(pod.memMi/1024).toFixed(1)}G` : `${Math.round(pod.memMi)}M`;
                const cpuColor = pod.cpuM > 500 ? "#ef4444" : pod.cpuM > 200 ? "#eab308" : "#22c55e";
                const shortName = pod.name.replace(/-[a-z0-9]{5}$/, "").replace(/-[a-z0-9]{10}$/, "");
                let uptimeStr = "";
                let isFresh = false;
                if (pod.startTime) {
                  const ms = Date.now() - new Date(pod.startTime).getTime();
                  isFresh = ms < 30 * 60 * 1000; // started in last 30 min
                  const days = Math.floor(ms / 86400000);
                  const hrs = Math.floor((ms % 86400000) / 3600000);
                  const mins = Math.floor((ms % 3600000) / 60000);
                  uptimeStr = days > 0 ? `${days}d${hrs}h` : hrs > 0 ? `${hrs}h${mins}m` : `${mins}m`;
                }
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-xs font-mono text-gray-700 mb-0.5">
                      <span className="truncate flex-1 flex items-center gap-1" title={pod.name}>
                        {isFresh && <span className="text-green-400/70 text-[9px] shrink-0">NEW</span>}
                        {shortName}
                      </span>
                      <span className="shrink-0 ml-1 flex items-center gap-2">
                        {uptimeStr && <span className="text-gray-700/60">↑{uptimeStr}</span>}
                        <span style={{ color: cpuColor }}>{cpuLabel}</span>
                        <span className="text-cyan-600">{memLabel}</span>
                      </span>
                    </div>
                    <div className="flex gap-1 h-1">
                      <div className="flex-1 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${cpuPct}%`, backgroundColor: cpuColor }} />
                      </div>
                      <div className="flex-1 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-cyan-600/60" style={{ width: `${memPct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* Deployment replicas for this namespace */}
      {nsDeployments && nsDeployments[svc.namespace] && nsDeployments[svc.namespace].length > 0 && (
        <>
          <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent mt-4 mb-3" />
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-mono text-gray-600 uppercase tracking-wider">Deployments</span>
            <span className="text-xs font-mono text-gray-700">{nsDeployments[svc.namespace].length}</span>
          </div>
          <div className="space-y-1">
            {nsDeployments[svc.namespace].map((dep, i) => {
              const healthy = dep.available >= dep.desired;
              return (
                <div key={i} className="flex items-center gap-2 text-xs font-mono">
                  <span className={healthy ? "text-green-500/70" : "text-red-400/80"}>●</span>
                  <span className="text-gray-500 truncate flex-1" title={dep.name}>{dep.name}</span>
                  <span className={`shrink-0 ${healthy ? "text-green-500/60" : "text-red-400/70"}`}>
                    {dep.available}/{dep.desired}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* StatefulSets for this namespace */}
      {nsStatefulSets && nsStatefulSets[svc.namespace] && nsStatefulSets[svc.namespace].length > 0 && (
        <>
          <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent mt-4 mb-3" />
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-mono text-gray-600 uppercase tracking-wider">StatefulSets</span>
            <span className="text-xs font-mono text-gray-700">{nsStatefulSets[svc.namespace].length}</span>
          </div>
          <div className="space-y-1">
            {nsStatefulSets[svc.namespace].map((ss, i) => {
              const healthy = ss.ready >= ss.desired;
              return (
                <div key={i} className="flex items-center gap-2 text-xs font-mono">
                  <span className={healthy ? "text-cyan-500/70" : "text-red-400/80"}>◈</span>
                  <span className="text-gray-500 truncate flex-1" title={ss.name}>{ss.name}</span>
                  <span className={`shrink-0 ${healthy ? "text-cyan-500/60" : "text-red-400/70"}`}>
                    {ss.ready}/{ss.desired}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Container images for this namespace */}
      {nsImages && nsImages[svc.namespace] && nsImages[svc.namespace].length > 0 && (
        <>
          <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent mt-4 mb-3" />
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-mono text-gray-600 uppercase tracking-wider">Images</span>
            <span className="text-xs font-mono text-gray-700">{nsImages[svc.namespace].length}</span>
          </div>
          <div className="space-y-1">
            {nsImages[svc.namespace].map((img, i) => {
              const parts = img.includes(":") ? img.split(":") : [img, "latest"];
              const tag = parts[parts.length - 1];
              const repo = parts[0];
              const name = repo.split("/").pop() ?? repo;
              const isLatest = tag === "latest";
              const isSha = tag.startsWith("sha256:");
              const isSemver = /^v?\d+\.\d+/.test(tag);
              const tagColor = isLatest ? "#eab308" : isSha ? "#6b7280" : isSemver ? "#22c55e" : "#60a5fa";
              return (
                <div key={i} className="flex items-center gap-1.5 rounded px-2 py-1 bg-gray-900/50 border border-gray-800/40">
                  <span className="text-gray-600 shrink-0">⬡</span>
                  <span className="text-gray-400 font-mono text-[10px] truncate flex-1" title={img}>{name}</span>
                  <span className="shrink-0 font-mono text-[9px] px-1 rounded" style={{ color: tagColor, background: tagColor + "15" }}>{isSha ? "sha" : tag.slice(0, 14)}{(!isSha && tag.length > 14) ? "…" : ""}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* CronJobs for this namespace */}
      {nsCronJobs && nsCronJobs[svc.namespace] && nsCronJobs[svc.namespace].length > 0 && (
        <>
          <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent mt-4 mb-3" />
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-mono text-gray-600 uppercase tracking-wider">CronJobs</span>
            <span className="text-xs font-mono text-gray-700">{nsCronJobs[svc.namespace].length}</span>
          </div>
          <div className="space-y-1">
            {nsCronJobs[svc.namespace].map((cj, i) => (
              <div key={i} className="text-xs font-mono bg-gray-900/50 border border-gray-800/50 rounded px-2 py-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`shrink-0 ${cj.active > 0 ? "text-cyan-400/70" : "text-gray-600"}`}>●</span>
                  <span className="text-gray-500 truncate flex-1" title={cj.name}>{cj.name}</span>
                  <span className="shrink-0 text-gray-700 font-mono">{cj.schedule}</span>
                </div>
                {cj.lastSchedule && (
                  <div className="text-gray-700 mt-0.5 pl-4">last: {relTime(cj.lastSchedule, now)}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Helm releases for this namespace */}
      {nsHelmReleases && nsHelmReleases[svc.namespace] && nsHelmReleases[svc.namespace].length > 0 && (
        <>
          <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent mt-4 mb-3" />
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-mono text-gray-600 uppercase tracking-wider">Helm</span>
            <span className="text-xs font-mono text-gray-700">{nsHelmReleases[svc.namespace].length} release{nsHelmReleases[svc.namespace].length !== 1 ? "s" : ""}</span>
          </div>
          <div className="space-y-1">
            {nsHelmReleases[svc.namespace].map((rel, i) => (
              <div key={i} className="text-xs font-mono">
                <div className="flex items-center justify-between gap-2">
                  <span className={`shrink-0 ${rel.status === "deployed" ? "text-green-500/60" : "text-yellow-400/70"}`}>⎈</span>
                  <span className="text-gray-500 truncate flex-1" title={rel.name}>{rel.name}</span>
                  <span className="shrink-0 text-cyan-700/60 text-[10px]">{rel.chart.replace(/^[^-]+-/, "")}</span>
                </div>
                {rel.updated && (
                  <div className="text-gray-700/60 text-[10px] pl-4 mt-0.5">
                    upgraded {relTime(new Date(rel.updated).toISOString(), now)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* PVCs for this namespace */}
      {nsPvcs && nsPvcs[svc.namespace] && nsPvcs[svc.namespace].length > 0 && (
        <>
          <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent mt-4 mb-3" />
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-mono text-gray-600 uppercase tracking-wider">Storage</span>
            <span className="text-xs font-mono text-gray-700">{nsPvcs[svc.namespace].length} PVC{nsPvcs[svc.namespace].length !== 1 ? "s" : ""}</span>
          </div>
          <div className="space-y-1">
            {nsPvcs[svc.namespace].map((pvc, i) => (
              <div key={i} className="flex items-center gap-2 text-xs font-mono">
                <span className={pvc.status === "Bound" ? "text-blue-500/60" : "text-yellow-400/70"}>⬡</span>
                <span className="text-gray-500 truncate flex-1" title={pvc.name}>{pvc.name}</span>
                <span className="shrink-0 text-blue-400/60">{pvc.capacity}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Related warning events for this namespace */}
      {recentEvents && (() => {
        const nsEvents = recentEvents.filter(e => e.namespace === svc.namespace);
        if (nsEvents.length === 0) return null;
        return (
          <>
            <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent mt-4 mb-3" />
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-mono text-gray-600 uppercase tracking-wider">Events</span>
              <span className="text-xs font-mono text-orange-500/70">{nsEvents.length} warning{nsEvents.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="space-y-1.5">
              {nsEvents.slice(0, 4).map((ev, i) => (
                <div key={i} className="text-xs font-mono px-2 py-1 rounded bg-orange-500/5 border border-orange-500/15">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-orange-400 truncate">{ev.reason}</span>
                    <span className="text-gray-700 shrink-0">{relTime(ev.lastTimestamp, now) || `×${ev.count}`}</span>
                  </div>
                  <div className="text-gray-600 truncate">{ev.message.slice(0, 70)}{ev.message.length > 70 ? "…" : ""}</div>
                </div>
              ))}
            </div>
          </>
        );
      })()}

      {/* kubectl command hints */}
      <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent mt-5 mb-3" />
      {[
        `kubectl -n ${svc.namespace} get pods`,
        `kubectl -n ${svc.namespace} describe pods`,
        `kubectl -n ${svc.namespace} logs -f --tail=50`,
        `kubectl top pods -n ${svc.namespace}`,
        `kubectl -n ${svc.namespace} get events --sort-by=.lastTimestamp`,
      ].map(cmd => (
        <div key={cmd} className="group flex items-center justify-between text-xs font-mono text-gray-700 mb-1 px-2 py-1 rounded bg-gray-900/50 border border-gray-800/50 hover:border-gray-700/50 transition-colors">
          <span className="truncate select-all cursor-text">{cmd}</span>
          <button
            className="ml-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-gray-400 px-1"
            onClick={() => navigator.clipboard.writeText(cmd).catch(() => {})}
            title="Copy to clipboard"
          >⎘</button>
        </div>
      ))}
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
