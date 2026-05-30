"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef, Suspense } from "react";
import DetailPanel from "./components/DetailPanel";
import { services } from "./data";

interface ClusterStatus {
  timestamp: string;
  apps: { name: string; sync: string; health: string; syncedAt?: string | null }[];
  unhealthyPods: { namespace: string; name: string; status: string; restarts: number }[];
  totalPods?: number;
  nsPodCounts?: Record<string, number>;
  nsCpuRequestsM?: Record<string, number>;
  nsMemRequestsMi?: Record<string, number>;
  totalCpuRequestsM?: number;
  totalMemRequestsMi?: number;
  nsImages?: Record<string, string[]>;
  topCpuPods?: { namespace: string; name: string; cpu: string; memory: string; cpuM: number }[];
  podMetrics?: { namespace: string; name: string; cpu: string; memory: string; cpuM: number; memMi: number; startTime?: string }[];
  node: { name: string; ready: boolean; kubeletVersion?: string; cpu?: string; memory?: string; allocatableCpu?: string; allocatableMemory?: string; uptime?: string | null; pressures?: string[] } | null;
  nodeMetrics?: { cpuCores: string; memoryi: string; cpuPct: string; memPct: string } | null;
  recentEvents?: { namespace: string; name: string; reason: string; message: string; count: number; age: string; lastTimestamp?: string }[];
  longhornStorage?: { totalGiB: number; usedGiB: number; freeGiB: number; pct: number } | null;
  longhornVolumes?: { name: string; state: string; robustness: string; sizeGiB: number; pvc?: string }[];
  k8sServices?: { namespace: string; name: string; type: string; clusterIP: string; externalIP?: string; ports: string }[];
  nsIngress?: Record<string, string[]>;
  nsDeployments?: Record<string, { name: string; desired: number; available: number; ready: number }[]>;
  nsCronJobs?: Record<string, { name: string; schedule: string; lastSchedule?: string; active: number }[]>;
  nsHelmReleases?: Record<string, { name: string; chart: string; appVersion: string; status: string; updated: string }[]>;
  nsPvcs?: Record<string, { name: string; status: string; capacity: string; storageClass: string }[]>;
  certificates?: { name: string; namespace: string; daysLeft: number; ready: boolean }[];
}

const Scene3D = dynamic(() => import("./components/Scene3D"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-gray-600 animate-pulse font-mono text-sm">
        Initializing 3D renderer...
      </div>
    </div>
  ),
});

const TopologyView = dynamic(() => import("./components/TopologyView"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-gray-600 animate-pulse font-mono text-sm">
        Loading topology...
      </div>
    </div>
  ),
});

type ViewMode = "rack" | "topology";

export default function Home() {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [view, setView] = useState<ViewMode>("rack");
  const [cluster, setCluster] = useState<ClusterStatus | null>(null);
  const [showApps, setShowApps] = useState(false);
  const [showPods, setShowPods] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [nextRefreshIn, setNextRefreshIn] = useState(30);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const metricsHistory = useRef<{ cpu: number; ram: number; pods: number; ts: number }[]>([]);

  const fetchStatus = useRef(() => {});
  fetchStatus.current = () => {
    setIsLoading(true);
    setNextRefreshIn(30);
    fetch("/api/cluster-status")
      .then((r) => r.json())
      .then((data: ClusterStatus) => {
        setCluster(data);
        if (data.nodeMetrics) {
          const cpu = parseInt(data.nodeMetrics.cpuPct, 10) || 0;
          const ram = parseInt(data.nodeMetrics.memPct, 10) || 0;
          const pods = data.totalPods ?? 0;
          metricsHistory.current = [...metricsHistory.current.slice(-19), { cpu, ram, pods, ts: Date.now() }];
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchStatus.current();
    const id = setInterval(() => fetchStatus.current(), 30000);
    // Countdown timer
    const countdown = setInterval(() => {
      setNextRefreshIn(v => Math.max(0, v - 1));
      setCurrentTime(new Date());
    }, 1000);
    return () => { clearInterval(id); clearInterval(countdown); };
  }, []);

  useEffect(() => {
    if (!showApps && !showPods) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-apps-dropdown]")) setShowApps(false);
      if (!target.closest("[data-pods-dropdown]")) setShowPods(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showApps, showPods]);

  // Global keyboard shortcuts: 3 = 3D rack, T = topology, R = manual refresh
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "3") setView("rack");
      if (e.key === "t" || e.key === "T") setView("topology");
      if (e.key === "r" || e.key === "R") fetchStatus.current();
      if (e.key === "p" || e.key === "P") setPanelCollapsed(v => !v);
      if (e.key === "?" || e.key === "/") { e.preventDefault(); setShowHelp(v => !v); }
      if (e.key === "f" || e.key === "F") { e.preventDefault(); setShowSearch(true); setSearchQuery(""); }
      if (e.key === "Escape") { setShowHelp(false); setShowSearch(false); setSearchQuery(""); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Dynamic document.title reflecting cluster health
  useEffect(() => {
    if (!cluster) { document.title = "homelab — loading..."; return; }
    const crashPods = cluster.unhealthyPods.filter(p => p.status === "CrashLoopBackOff" || p.status === "OOMKilled");
    const outOfSync = cluster.apps.filter(a => a.sync !== "Synced");
    if (crashPods.length > 0) {
      document.title = `🔴 ${crashPods.length} crashing — homelab`;
    } else if (outOfSync.length > 0) {
      document.title = `🟡 ${outOfSync.length} OutOfSync — homelab`;
    } else {
      document.title = "🟢 homelab — all healthy";
    }
  }, [cluster]);

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* Loading progress bar — thin line at top */}
      <div className={`fixed top-0 left-0 right-0 h-0.5 z-50 transition-opacity duration-300 ${isLoading ? "opacity-100" : "opacity-0"}`}>
        <div className="h-full bg-blue-500/70 animate-pulse" style={{ boxShadow: "0 0 8px #3b82f6" }} />
      </div>
      {/* Critical alert banner */}
      {cluster && (() => {
        const crashPods = cluster.unhealthyPods.filter(p => p.status === "CrashLoopBackOff" || p.status === "OOMKilled");
        const outOfSync = cluster.apps.filter(a => a.sync !== "Synced");
        if (crashPods.length === 0 && outOfSync.length === 0) return null;
        return (
          <div className={`fixed top-0.5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-1.5 rounded-b-lg text-xs font-mono pointer-events-none ${crashPods.length > 0 ? "bg-red-950/90 border-x border-b border-red-700/50 text-red-300" : "bg-yellow-950/90 border-x border-b border-yellow-700/50 text-yellow-300"}`}>
            {crashPods.length > 0 && <span>⚠ {crashPods.length} pod{crashPods.length !== 1 ? "s" : ""} crashing: {crashPods.slice(0, 2).map(p => p.name.split("-")[0]).join(", ")}{crashPods.length > 2 ? "…" : ""}</span>}
            {outOfSync.length > 0 && <span className="text-yellow-400">⚡ {outOfSync.length} app{outOfSync.length !== 1 ? "s" : ""} OutOfSync: {outOfSync.slice(0, 2).map(a => a.name).join(", ")}{outOfSync.length > 2 ? "…" : ""}</span>}
          </div>
        );
      })()}
      {/* Keyboard shortcut help overlay */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
          <div className="bg-gray-900/95 border border-gray-700/60 rounded-xl shadow-2xl p-6 min-w-80 max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-300 font-mono uppercase tracking-wider">Keyboard Shortcuts</h2>
              <button onClick={() => setShowHelp(false)} className="text-gray-600 hover:text-gray-400 text-xs font-mono">ESC</button>
            </div>
            <div className="space-y-2">
              {[
                ["3", "Switch to 3D rack view"],
                ["T", "Switch to topology view"],
                ["F", "Quick service search"],
                ["R", "Manual refresh"],
                ["P", "Toggle detail panel"],
                ["?", "Toggle this help"],
                ["ESC", "Close overlays"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center gap-3">
                  <kbd className="min-w-[2rem] text-center px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-xs font-mono text-gray-300">{key}</kbd>
                  <span className="text-xs font-mono text-gray-500">{desc}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-800 text-xs font-mono text-gray-700 text-center">Click anywhere to close</div>
          </div>
        </div>
      )}
      {/* Service quick-search overlay [F] */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/50 backdrop-blur-sm" onClick={() => { setShowSearch(false); setSearchQuery(""); }}>
          <div className="bg-gray-900/98 border border-gray-700/60 rounded-xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
              <span className="text-gray-600 text-sm">🔍</span>
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Escape") { setShowSearch(false); setSearchQuery(""); }
                  if (e.key === "Enter") {
                    const matches = services.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.namespace.toLowerCase().includes(searchQuery.toLowerCase()));
                    if (matches.length > 0) { setSelectedIdx(services.indexOf(matches[0])); setPanelCollapsed(false); setShowSearch(false); setSearchQuery(""); }
                  }
                }}
                placeholder="Search services... (Enter to select)"
                className="flex-1 bg-transparent text-gray-200 text-sm font-mono placeholder-gray-700 focus:outline-none"
              />
              <span className="text-gray-700 text-xs font-mono">ESC</span>
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              {services
                .filter(s => !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.namespace.toLowerCase().includes(searchQuery.toLowerCase()))
                .slice(0, 10)
                .map((svc, _, filtered) => {
                  const idx = services.indexOf(svc);
                  return (
                    <div
                      key={svc.name}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800/60 cursor-pointer transition-colors"
                      onClick={() => { setSelectedIdx(idx); setPanelCollapsed(false); setShowSearch(false); setSearchQuery(""); }}
                    >
                      <span className="text-lg">{svc.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-200 font-mono truncate">{svc.name}</div>
                        <div className="text-xs text-gray-600 font-mono">{svc.namespace} · {svc.category}</div>
                      </div>
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: svc.status === "running" ? "#22c55e" : "#ef4444" }} />
                    </div>
                  );
                })}
              {services.filter(s => !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.namespace.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                <div className="text-center text-gray-700 font-mono text-xs py-6">no matching services</div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Main view */}
      <div className="flex-1 relative min-w-0">
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center">
              <div className="text-gray-600 font-mono text-sm">Loading...</div>
            </div>
          }
        >
          {view === "rack" ? (
            <Scene3D
              onSelect={setSelectedIdx}
              selectedIdx={selectedIdx}
              nodeMetrics={cluster?.nodeMetrics}
              appsSynced={cluster?.apps.filter(a => a.sync === "Synced").length}
              appsTotal={cluster?.apps.length}
              unhealthyNamespaces={cluster ? new Set(cluster.unhealthyPods.map(p => p.namespace)) : undefined}
              refreshProgress={(30 - nextRefreshIn) / 30}
              longhornStorage={cluster?.longhornStorage}
              totalPods={cluster?.totalPods}
              recentEvents={cluster?.recentEvents}
              nsPodCounts={cluster?.nsPodCounts}
              nsCpuRequestsM={cluster?.nsCpuRequestsM}
            />
          ) : (
            <TopologyView
              onSelectService={setSelectedIdx}
              nodeMetrics={cluster?.nodeMetrics}
              nsPodCounts={cluster?.nsPodCounts}
              nsCpuRequestsM={cluster?.nsCpuRequestsM}
              unhealthyNamespaces={cluster ? new Set(cluster.unhealthyPods.map(p => p.namespace)) : undefined}
              apps={cluster?.apps}
              longhornStorage={cluster?.longhornStorage}
              recentEvents={cluster?.recentEvents}
            />
          )}
        </Suspense>

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 h-[52px] bg-gray-950/80 backdrop-blur-md border-b border-gray-800/50 flex items-center px-3 sm:px-5 z-10">
          {/* Logo */}
          <div className="flex items-center gap-2 mr-3 sm:mr-6">
            <span className="text-lg">🏠</span>
            <span className="text-sm font-bold text-white tracking-tight hidden sm:inline">
              homelab
            </span>
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1" />
          </div>

          {/* View switcher */}
          <div className="flex items-center bg-gray-900 rounded-lg border border-gray-800/50 p-0.5">
            <button
              onClick={() => setView("rack")}
              className={
                "px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer " +
                (view === "rack"
                  ? "bg-gray-800 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-300")
              }
            >
              🖥️ <span className="hidden sm:inline">3D Rack</span>
            </button>
            <button
              onClick={() => setView("topology")}
              className={
                "px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer " +
                (view === "topology"
                  ? "bg-gray-800 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-300")
              }
            >
              🔗 <span className="hidden sm:inline">Topology</span>
            </button>
            <a
              href="http://localhost:3001"
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer text-gray-500 hover:text-gray-300"
            >
              📚 <span className="hidden sm:inline">Docs</span>
            </a>
          </div>

          {/* Stack info */}
          <div className="ml-auto flex items-center gap-2 sm:gap-3 text-xs text-gray-600 font-mono">
            {cluster && (
              <>
                <span className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${cluster.node?.ready ? "bg-green-500 shadow-[0_0_4px_#22c55e]" : "bg-red-500"}`} />
                  <span className="hidden md:inline text-gray-500">node</span>
                </span>
                {/* Warning events indicator */}
                {cluster.recentEvents && cluster.recentEvents.length > 0 && (
                  <div className="relative hidden sm:flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400 max-w-[220px] overflow-hidden">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse shrink-0" />
                    <span className="text-xs shrink-0">{cluster.recentEvents.length}×</span>
                    <span className="text-xs text-orange-300/70 truncate">{cluster.recentEvents[cluster.recentEvents.length - 1]?.reason}: {cluster.recentEvents[cluster.recentEvents.length - 1]?.message.slice(0, 40)}</span>
                  </div>
                )}
                {/* Cert expiry warning */}
                {cluster.certificates && cluster.certificates.some(c => c.daysLeft < 30 && c.daysLeft >= 0) && (
                  <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                    <span className="text-xs">cert exp</span>
                  </div>
                )}
                <span className="hidden sm:inline text-gray-800">|</span>
                <div className="relative" data-apps-dropdown="1">
                  <button
                    onClick={() => setShowApps(v => !v)}
                    className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer transition-colors ${cluster.apps.every(a => a.sync === "Synced") ? "hover:bg-gray-800/50" : "bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${cluster.apps.every(a => a.sync === "Synced") ? "bg-green-500" : "bg-yellow-500"}`} />
                    <span className="hidden sm:inline">{cluster.apps.filter(a => a.sync === "Synced").length}/{cluster.apps.length} synced</span>
                  </button>
                  {showApps && (
                    <div className="absolute top-full right-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-50 min-w-52 max-h-80 overflow-y-auto">
                      <div className="px-3 py-2 text-xs font-mono text-gray-500 border-b border-gray-800">ArgoCD Apps</div>
                      {cluster.apps.map(app => (
                        <div key={app.name} className="flex items-center justify-between px-3 py-1.5 text-xs font-mono hover:bg-gray-800/50">
                          <span className="text-gray-300">{app.name}</span>
                          <div className="flex items-center gap-1.5">
                            <span className={app.sync === "Synced" ? "text-green-400" : "text-yellow-400"}>{app.sync}</span>
                            <span className={`w-1.5 h-1.5 rounded-full ${app.health === "Healthy" ? "bg-green-500" : app.health === "Degraded" ? "bg-red-500" : "bg-yellow-500"}`} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <span className="hidden sm:inline text-gray-800">|</span>
                <div className="relative" data-pods-dropdown="1">
                  <button
                    onClick={() => setShowPods(v => !v)}
                    className="flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer transition-colors hover:bg-gray-800/50"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${cluster.unhealthyPods.length === 0 ? "bg-green-500 shadow-[0_0_4px_#22c55e]" : "bg-orange-500"}`} />
                    <span className="hidden sm:inline text-gray-500">
                      {cluster.unhealthyPods.length > 0 ? `${cluster.unhealthyPods.length} issues` : "healthy"}
                      {cluster.totalPods ? ` · ${cluster.totalPods} pods` : ""}
                    </span>
                  </button>
                  {showPods && (
                    <div className="absolute top-full right-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-50 min-w-64 max-h-72 overflow-y-auto">
                      <div className="px-3 py-2 text-xs font-mono text-gray-500 border-b border-gray-800">Pod Status</div>
                      {cluster.unhealthyPods.length === 0 ? (
                        <div className="px-3 py-2 text-xs font-mono text-green-400">● All pods healthy</div>
                      ) : (
                        cluster.unhealthyPods.map((pod, i) => (
                          <div key={i} className="px-3 py-1.5 text-xs font-mono hover:bg-gray-800/50 border-b border-gray-800/30">
                            <div className="text-orange-400">{pod.name}</div>
                            <div className="flex items-center gap-2 text-gray-600 mt-0.5">
                              <span>{pod.namespace}</span>
                              <span>·</span>
                              <span className="text-red-400">{pod.status}</span>
                              {pod.restarts > 0 && <span className="text-yellow-600">↺{pod.restarts}</span>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <span className="hidden md:inline text-gray-800">|</span>
              </>
            )}
            {cluster && (() => {
              const syncScore = cluster.apps.length > 0 ? (cluster.apps.filter(a => a.sync === "Synced").length / cluster.apps.length) * 40 : 40;
              const podScore = cluster.unhealthyPods.length === 0 ? 40 : Math.max(0, 40 - cluster.unhealthyPods.length * 5);
              const eventScore = !cluster.recentEvents || cluster.recentEvents.length === 0 ? 20 : Math.max(0, 20 - cluster.recentEvents.length * 2);
              const score = Math.round(syncScore + podScore + eventScore);
              const color = score >= 90 ? "#22c55e" : score >= 70 ? "#eab308" : "#ef4444";
              return (
                <>
                  <span className="hidden md:inline font-semibold tabular-nums" style={{ color }} title="Cluster health score">
                    {score}%
                  </span>
                  <span className="hidden md:inline text-gray-800">|</span>
                </>
              );
            })()}
            <span className="hidden md:inline text-gray-600">Talos v1.13.2</span>
            <span className="hidden md:inline text-gray-800">|</span>
            <span className="hidden md:inline text-gray-600">K8s v1.36</span>
            {cluster?.node?.uptime && (
              <>
                <span className="hidden md:inline text-gray-800">|</span>
                <span className="hidden md:inline text-gray-600" title="Node uptime">↑ {cluster.node.uptime}</span>
              </>
            )}
            {/* Stale data indicator */}
            {cluster && (() => {
              const ageMs = currentTime.getTime() - new Date(cluster.timestamp).getTime();
              if (ageMs < 65000) return null;
              const ageSec = Math.round(ageMs / 1000);
              return (
                <><span className="hidden md:inline text-gray-800">|</span>
                <span className="hidden md:inline text-orange-500/80 animate-pulse" title={`Data is ${ageSec}s old`}>⏳{ageSec}s</span></>
              );
            })()}
            <span className="hidden md:inline text-gray-800">|</span>
            <span className="hidden md:inline text-gray-500 tabular-nums" title="Local time">{currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
          </div>
        </div>

        {/* Footer hints */}
        {view === "rack" && (
          <div className="absolute bottom-5 left-5 text-xs text-gray-700 pointer-events-none font-mono">
            click node/service · drag to rotate · scroll to zoom · [S] services · [←/→] navigate · [Esc] deselect · [T] topology · [R] refresh · [P] panel
          </div>
        )}
        {view === "topology" && (
          <div className="absolute bottom-5 left-5 text-xs text-gray-700 pointer-events-none font-mono hidden md:block">
            scroll to zoom · drag to pan · click to select · [3] 3D rack · [R] refresh · [P] panel
          </div>
        )}
        {cluster && (
          <div className="absolute bottom-5 right-5 text-xs text-gray-700 font-mono hidden sm:flex items-center gap-2">
            {isLoading ? (
              <span className="text-blue-500/60 animate-pulse">syncing...</span>
            ) : (
              <span className="pointer-events-none">last sync: {new Date(cluster.timestamp).toLocaleTimeString()} · refresh in {nextRefreshIn}s</span>
            )}
            <button
              onClick={() => fetchStatus.current()}
              disabled={isLoading}
              className="px-1.5 py-0.5 rounded border border-gray-800 hover:border-gray-600 text-gray-600 hover:text-gray-400 transition-colors disabled:opacity-40"
              title="Manual refresh"
            >↺</button>
            <button
              onClick={() => setShowHelp(v => !v)}
              className="px-1.5 py-0.5 rounded border border-gray-800 hover:border-gray-600 text-gray-600 hover:text-gray-400 transition-colors"
              title="Keyboard shortcuts (?)"
            >?</button>
          </div>
        )}
      </div>

      {/* Detail Panel — hidden on mobile, collapsible on tablet+ */}
      <div className={`hidden sm:block transition-all duration-300 ${panelCollapsed ? "w-0 overflow-hidden" : ""}`}>
        {!panelCollapsed && (
          <DetailPanel
            selectedIdx={selectedIdx}
            onClose={() => setSelectedIdx(null)}
            onSelectService={setSelectedIdx}
            nodeMetrics={cluster?.nodeMetrics}
            nsPodCounts={cluster?.nsPodCounts}
            recentEvents={cluster?.recentEvents}
            metricsHistory={metricsHistory.current}
            longhornStorage={cluster?.longhornStorage}
            unhealthyPods={cluster?.unhealthyPods}
            certificates={cluster?.certificates}
            apps={cluster?.apps}
            nsCpuRequestsM={cluster?.nsCpuRequestsM}
            nsMemRequestsMi={cluster?.nsMemRequestsMi}
            topCpuPods={cluster?.topCpuPods}
            podMetrics={cluster?.podMetrics}
            totalCpuRequestsM={cluster?.totalCpuRequestsM}
            totalMemRequestsMi={cluster?.totalMemRequestsMi}
            nsImages={cluster?.nsImages}
            longhornVolumes={cluster?.longhornVolumes}
            nodePressures={cluster?.node?.pressures}
            kubeletVersion={cluster?.node?.kubeletVersion}
            k8sServices={cluster?.k8sServices}
            nsIngress={cluster?.nsIngress}
            nsDeployments={cluster?.nsDeployments}
            nsCronJobs={cluster?.nsCronJobs}
            nsHelmReleases={cluster?.nsHelmReleases}
            nsPvcs={cluster?.nsPvcs}
          />
        )}
      </div>
      {/* Panel collapse toggle button */}
      <button
        onClick={() => setPanelCollapsed(v => !v)}
        className="hidden sm:flex absolute right-0 bottom-1/2 translate-y-1/2 z-20 items-center justify-center w-5 h-12 bg-gray-900/80 border border-gray-700/50 rounded-l text-gray-600 hover:text-gray-300 hover:bg-gray-800/80 transition-all"
        style={{ right: panelCollapsed ? 0 : 320 }}
        title={panelCollapsed ? "Show panel" : "Hide panel"}
      >
        <span className="text-xs">{panelCollapsed ? "◂" : "▸"}</span>
      </button>
    </div>
  );
}
