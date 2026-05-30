"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef, Suspense } from "react";
import DetailPanel from "./components/DetailPanel";
import { services } from "./data";

interface ClusterStatus {
  timestamp: string;
  apps: { name: string; sync: string; health: string; syncedAt?: string | null }[];
  unhealthyPods: { namespace: string; name: string; status: string; restarts: number; lastRestartAt?: string }[];
  totalPods?: number;
  podStatusCounts?: { running: number; pending: number; failed: number; unknown: number };
  nsPodCounts?: Record<string, number>;
  nsCpuRequestsM?: Record<string, number>;
  nsMemRequestsMi?: Record<string, number>;
  totalCpuRequestsM?: number;
  totalMemRequestsMi?: number;
  nsImages?: Record<string, string[]>;
  topCpuPods?: { namespace: string; name: string; cpu: string; memory: string; cpuM: number }[];
  podMetrics?: { namespace: string; name: string; cpu: string; memory: string; cpuM: number; memMi: number; startTime?: string }[];
  recentPods?: { namespace: string; name: string; startTime: string }[];
  longRunningPods?: { namespace: string; name: string; startTime: string; ageDays: number }[];
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
  nsStatefulSets?: Record<string, { name: string; desired: number; ready: number }[]>;
  totalDaemonSets?: number;
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
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("hl_view");
      if (saved === "rack" || saved === "topology") return saved;
    }
    return "rack";
  });
  const [cluster, setCluster] = useState<ClusterStatus | null>(null);
  const [showApps, setShowApps] = useState(false);
  const [showPods, setShowPods] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("hl_panel_collapsed") === "1";
    }
    return false;
  });
  const [showHelp, setShowHelp] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCategory, setSearchCategory] = useState<string | null>(null);
  const [searchHighlight, setSearchHighlight] = useState(0);
  const [alertDismissed, setAlertDismissed] = useState<string | null>(null);
  const [nextRefreshIn, setNextRefreshIn] = useState(30);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const metricsHistory = useRef<{ cpu: number; ram: number; pods: number; unhealthy: number; appsHealthy: number; appsTotal: number; ts: number }[]>(
    (() => {
      try {
        if (typeof window !== "undefined") {
          const saved = localStorage.getItem("hl_metrics_history");
          if (saved) {
            const arr = JSON.parse(saved);
            // Only keep entries from last 24h to avoid stale data
            const cutoff = Date.now() - 86400000;
            return Array.isArray(arr) ? arr.filter((m: {ts?: number}) => (m.ts ?? 0) > cutoff).slice(-40) : [];
          }
        }
      } catch {/* ignore */}
      return [];
    })()
  );
  // Track per-pod restart counts over time to detect rolling restarts
  const restartHistory = useRef<{ ts: number; total: number }[]>(
    (() => {
      try {
        if (typeof window !== "undefined") {
          const saved = localStorage.getItem("hl_restart_history");
          if (saved) {
            const arr = JSON.parse(saved);
            const cutoff = Date.now() - 86400000;
            return Array.isArray(arr) ? arr.filter((m: {ts?: number}) => (m.ts ?? 0) > cutoff).slice(-20) : [];
          }
        }
      } catch {/* ignore */}
      return [];
    })()
  );

  const fetchStatus = useRef(() => {});
  fetchStatus.current = () => {
    setIsLoading(true);
    setNextRefreshIn(30);
    fetch("/api/cluster-status")
      .then((r) => r.json())
      .then((data: ClusterStatus) => {
        setCluster(data);
        {
          const cpu = data.nodeMetrics ? (parseInt(data.nodeMetrics.cpuPct, 10) || 0) : 0;
          const ram = data.nodeMetrics ? (parseInt(data.nodeMetrics.memPct, 10) || 0) : 0;
          const pods = data.totalPods ?? 0;
          const unhealthy = data.unhealthyPods?.length ?? 0;
          const appsHealthy = data.apps?.filter((a: {health: string}) => a.health === "Healthy").length ?? 0;
          const appsTotal = data.apps?.length ?? 0;
          metricsHistory.current = [...metricsHistory.current.slice(-39), { cpu, ram, pods, unhealthy, appsHealthy, appsTotal, ts: Date.now() }];          try { localStorage.setItem("hl_metrics_history", JSON.stringify(metricsHistory.current)); } catch {/* ignore */}          // Track total restarts for rolling restart detection
          const totalRestarts = data.unhealthyPods?.reduce((s: number, p: {restarts?: number}) => s + (p.restarts ?? 0), 0) ?? 0;
          restartHistory.current = [...restartHistory.current.slice(-19), { ts: Date.now(), total: totalRestarts }];
          try { localStorage.setItem("hl_restart_history", JSON.stringify(restartHistory.current)); } catch {/* ignore */}
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
      if (e.key === "3") { setView("rack"); localStorage.setItem("hl_view", "rack"); }
      if (e.key === "t" || e.key === "T") { setView("topology"); localStorage.setItem("hl_view", "topology"); }
      if (e.key === "r" || e.key === "R") fetchStatus.current();
      if (e.key === "p" || e.key === "P") setPanelCollapsed(v => { const next = !v; localStorage.setItem("hl_panel_collapsed", next ? "1" : "0"); return next; });
      if (e.key === "?" || e.key === "/") { e.preventDefault(); setShowHelp(v => !v); }
      if (e.key === "f" || e.key === "F") { e.preventDefault(); setShowSearch(true); setSearchQuery(""); }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setShowSearch(true); setSearchQuery(""); }
      if (e.key === "Escape") { setShowHelp(false); setShowSearch(false); setSearchQuery(""); }
      // Arrow left/right = navigate services when one is selected
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && selectedIdx !== null && !showSearch) {
        e.preventDefault();
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        setSelectedIdx(idx => idx === null ? 0 : (idx + dir + services.length) % services.length);
        setPanelCollapsed(false);
      }
      // g = jump to most critical service
      if (e.key === "g" || e.key === "G") {
        if (!cluster) return;
        const worst = services.reduce<{ idx: number; score: number } | null>((best, svc, i) => {
          const issues = cluster.unhealthyPods?.filter(p => p.namespace === svc.namespace) ?? [];
          const score = issues.filter(p => p.status === "CrashLoopBackOff").length * 100 + issues.length * 10 + (issues[0]?.restarts ?? 0);
          if (!best || score > best.score) return { idx: i, score };
          return best;
        }, null);
        if (worst && worst.score > 0) { setSelectedIdx(worst.idx); setPanelCollapsed(false); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Dynamic document.title reflecting cluster health
  useEffect(() => {
    if (!cluster) { document.title = "homelab — loading..."; return; }
    const crashPods = cluster.unhealthyPods.filter(p => p.status === "CrashLoopBackOff" || p.status === "OOMKilled");
    const outOfSync = cluster.apps.filter(a => a.sync !== "Synced");
    const totalRestarts = cluster.unhealthyPods.reduce((s, p) => s + (p.restarts ?? 0), 0);
    if (crashPods.length > 0) {
      const restartStr = totalRestarts > 0 ? ` ↺${totalRestarts}` : "";
      document.title = `🔴 ${crashPods.length} crashing${restartStr} — homelab`;
    } else if (outOfSync.length > 0) {
      document.title = `🟡 ${outOfSync.length} OutOfSync — homelab`;
    } else {
      document.title = `🟢 homelab · ${cluster.totalPods ?? "?"} pods`;
    }
  }, [cluster]);

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* Loading progress bar — thin line at top (loading: blue; countdown: dim) */}
      <div className="fixed top-0 left-0 right-0 h-0.5 z-50">
        {isLoading
          ? <div className="h-full bg-blue-500/80 animate-pulse" style={{ boxShadow: "0 0 8px #3b82f6" }} />
          : <div className="h-full bg-gray-800/50 overflow-hidden">
              <div
                className="h-full transition-none"
                style={{
                  width: `${((30 - nextRefreshIn) / 30) * 100}%`,
                  background: "linear-gradient(90deg, #22c55e20, #22c55e40)",
                }}
              />
            </div>
        }
      </div>
      {/* Critical alert banner */}
      {cluster && (() => {
        const crashPods = cluster.unhealthyPods.filter(p => p.status === "CrashLoopBackOff" || p.status === "OOMKilled");
        const outOfSync = cluster.apps.filter(a => a.sync !== "Synced");
        const storageWarn = cluster.longhornStorage && cluster.longhornStorage.pct > 80;
        if (crashPods.length === 0 && outOfSync.length === 0 && !storageWarn) return null;
        // Compute a unique "key" for the current alert state so dismiss persists until state changes
        const alertKey = crashPods.map(p => p.name).join("|") + "|" + outOfSync.map(a => a.name).join("|");
        if (alertDismissed === alertKey) return null;
        const hasCritical = crashPods.length > 0 || storageWarn;
        return (
          <div className={`fixed top-0.5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-1.5 rounded-b-lg text-xs font-mono ${hasCritical ? "bg-red-950/90 border-x border-b border-red-700/50 text-red-300" : "bg-yellow-950/90 border-x border-b border-yellow-700/50 text-yellow-300"}`}>
            {crashPods.length > 0 && <span>⚠ {crashPods.length} crashing: {crashPods.slice(0, 2).map(p => `${p.namespace}/${p.name.split("-")[0]}${p.restarts > 0 ? ` ↺${p.restarts}` : ""}`).join(", ")}{crashPods.length > 2 ? ` +${crashPods.length - 2} more` : ""}</span>}
            {outOfSync.length > 0 && <span className="text-yellow-400">⚡ {outOfSync.length} app{outOfSync.length !== 1 ? "s" : ""} OutOfSync: {outOfSync.slice(0, 2).map(a => a.name).join(", ")}{outOfSync.length > 2 ? "…" : ""}</span>}
            {storageWarn && <span className="text-red-300">💾 storage {cluster.longhornStorage!.pct.toFixed(0)}% full</span>}
            <button
              onClick={() => setAlertDismissed(alertKey)}
              className="ml-1 text-gray-500 hover:text-gray-300 transition-colors text-[10px] shrink-0"
              title="Dismiss alert"
            >✕</button>
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
                ["F / ⌘K", "Quick service search"],
                ["G", "Jump to most critical service"],
                ["S", "Toggle service spheres (3D)"],
                ["←/→", "Navigate services (when selected)"],
                ["R", "Manual refresh"],
                ["P", "Toggle detail panel"],
                ["?", "Toggle this help"],
                ["ESC", "Close overlays / deselect"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center gap-3">
                  <kbd className="min-w-[2.5rem] text-center px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-xs font-mono text-gray-300">{key}</kbd>
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
                onChange={e => { setSearchQuery(e.target.value); setSearchHighlight(0); }}
                onKeyDown={e => {
                  const matches = services.filter(s => (!searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.namespace.toLowerCase().includes(searchQuery.toLowerCase())) && (!searchCategory || s.category === searchCategory));
                  if (e.key === "Escape") { setShowSearch(false); setSearchQuery(""); setSearchCategory(null); setSearchHighlight(0); }
                  if (e.key === "ArrowDown") { e.preventDefault(); setSearchHighlight(h => Math.min(h + 1, Math.min(matches.length, 10) - 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setSearchHighlight(h => Math.max(h - 1, 0)); }
                  if (e.key === "Enter") {
                    const target = matches[searchHighlight] ?? matches[0];
                    if (target) { setSelectedIdx(services.indexOf(target)); setPanelCollapsed(false); setShowSearch(false); setSearchQuery(""); setSearchCategory(null); setSearchHighlight(0); }
                  }
                }}
                placeholder="Search services... (↑↓ navigate, ↵ select)"
                className="flex-1 bg-transparent text-gray-200 text-sm font-mono placeholder-gray-700 focus:outline-none"
              />
              <span className="text-gray-700 text-xs font-mono">ESC</span>
            </div>
            {/* Category filter chips */}
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-800">
              {[null, "app", "infra", "monitoring", "storage"].map(cat => (
                <button key={cat ?? "all"}
                  onClick={() => { setSearchCategory(cat); setSearchHighlight(0); }}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${searchCategory === cat ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" : "text-gray-600 hover:text-gray-400 border border-transparent"}`}
                >{cat ?? "all"}</button>
              ))}
              <span className="ml-auto text-[10px] font-mono text-gray-700">
                {services.filter(s =>
                  (!searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.namespace.toLowerCase().includes(searchQuery.toLowerCase())) &&
                  (!searchCategory || s.category === searchCategory)
                ).length} matches
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              {services
                .filter(s => (!searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.namespace.toLowerCase().includes(searchQuery.toLowerCase())) && (!searchCategory || s.category === searchCategory))
                .slice(0, 10)
                .map((svc, fi, filtered) => {
                  const idx = services.indexOf(svc);
                  const nsIssues = cluster?.unhealthyPods?.filter(p => p.namespace === svc.namespace) ?? [];
                  const hasCrit = nsIssues.some(p => p.status === "CrashLoopBackOff" || p.status === "Error");
                  const maxRestarts = Math.max(0, ...nsIssues.map(p => p.restarts ?? 0));
                  const pods = cluster?.nsPodCounts?.[svc.namespace];
                  const dotColor = hasCrit ? "#ef4444" : nsIssues.length > 0 ? "#f97316" : "#22c55e";
                  const isHighlighted = fi === searchHighlight;
                  return (
                    <div
                      key={svc.name}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${isHighlighted ? "bg-gray-800/80 border border-gray-700/40" : "hover:bg-gray-800/60"}`}
                      onClick={() => { setSelectedIdx(idx); setPanelCollapsed(false); setShowSearch(false); setSearchQuery(""); setSearchCategory(null); setSearchHighlight(0); }}
                    >
                      <span className="text-lg">{svc.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-200 font-mono truncate">{svc.name}</div>
                        <div className="text-xs text-gray-600 font-mono flex items-center gap-1.5">
                          <span>{svc.namespace}</span>
                          <span>·</span>
                          <span>{svc.category}</span>
                          {pods !== undefined && <span className="text-gray-700">{pods}p</span>}
                          {hasCrit && <span className="text-red-400">⚠ {nsIssues.length} issue{nsIssues.length > 1 ? "s" : ""}</span>}
                          {maxRestarts > 0 && !hasCrit && <span className="text-orange-400/80">↺{maxRestarts}</span>}
                        </div>
                      </div>
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColor, boxShadow: hasCrit ? `0 0 4px ${dotColor}` : "none" }} />
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
            <div className="relative flex-1 w-full h-full">
              {/* Red edge glow overlay when CrashLoopBackOff detected */}
              {cluster?.unhealthyPods.some(p => p.status === "CrashLoopBackOff") && (
                <div className="absolute inset-0 pointer-events-none z-10" style={{
                  boxShadow: "inset 0 0 80px -20px rgba(239,68,68,0.15)",
                  animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
                }} />
              )}
              <div className="absolute inset-0">
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
              unhealthyPodCount={cluster?.unhealthyPods.length}
              nodeUptime={cluster?.node?.uptime}
              nsMaxRestarts={cluster ? (() => {
                const m: Record<string, number> = {};
                for (const p of cluster.unhealthyPods) {
                  if ((p.restarts ?? 0) > 0) m[p.namespace] = Math.max(m[p.namespace] ?? 0, p.restarts ?? 0);
                }
                return m;
              })() : undefined}
              nodePressures={cluster?.node?.pressures}
              apps={cluster?.apps}
            />
            </div>
            </div>
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
              nsMaxRestarts={cluster ? (() => {
                const m: Record<string, number> = {};
                for (const p of cluster.unhealthyPods) {
                  if ((p.restarts ?? 0) > 0) m[p.namespace] = Math.max(m[p.namespace] ?? 0, p.restarts ?? 0);
                }
                return m;
              })() : undefined}
              recentPods={cluster?.recentPods}
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
            <div className={`w-2 h-2 rounded-full animate-pulse ml-1 ${!cluster ? "bg-gray-600" : cluster.unhealthyPods?.some(p => p.status === "CrashLoopBackOff") ? "bg-red-500 shadow-[0_0_6px_#ef4444]" : cluster.unhealthyPods?.length ? "bg-yellow-500 shadow-[0_0_6px_#eab308]" : "bg-green-500 shadow-[0_0_6px_#22c55e]"}`}
              title={`Last refreshed: ${nextRefreshIn}s ago · ${cluster?.totalPods ?? "?"} pods`}
            />
          </div>

          {/* View switcher */}
          <div className="flex items-center bg-gray-900 rounded-lg border border-gray-800/50 p-0.5">
            <button
              onClick={() => { setView("rack"); localStorage.setItem("hl_view", "rack"); }}
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
              onClick={() => { setView("topology"); localStorage.setItem("hl_view", "topology"); }}
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
                  {(() => {
                    const critical = cluster.unhealthyPods.filter(p => p.status === "CrashLoopBackOff" || p.status === "Error" || (p.restarts && p.restarts > 50));
                    const isCritical = critical.length > 0;
                    return (
                      <button
                        onClick={() => setShowPods(v => !v)}
                        className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer transition-colors ${isCritical ? "bg-red-500/10 border border-red-500/20 hover:bg-red-500/20" : "hover:bg-gray-800/50"}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${cluster.unhealthyPods.length === 0 ? "bg-green-500 shadow-[0_0_4px_#22c55e]" : isCritical ? "bg-red-500 animate-pulse shadow-[0_0_4px_#ef4444]" : "bg-orange-500"}`} />
                        <span className={`hidden sm:inline ${isCritical ? "text-red-400" : "text-gray-500"}`}>
                          {cluster.unhealthyPods.length > 0 ? (isCritical ? `${critical.length} critical` : `${cluster.unhealthyPods.length} issues`) : "healthy"}
                          {cluster.totalPods ? ` · ${cluster.totalPods} pods` : ""}
                        </span>
                      </button>
                    );
                  })()}
                  {showPods && (
                    <div className="absolute top-full right-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-50 min-w-64 max-h-72 overflow-y-auto">
                      <div className="px-3 py-2 text-xs font-mono text-gray-500 border-b border-gray-800">Pod Status</div>
                      {cluster.unhealthyPods.length === 0 ? (
                        <div className="px-3 py-2 text-xs font-mono text-green-400">● All pods healthy</div>
                      ) : (
                        [...cluster.unhealthyPods].sort((a, b) => (b.restarts ?? 0) - (a.restarts ?? 0)).map((pod, i) => {
                          const isCrit = pod.status === "CrashLoopBackOff" || pod.status === "Error" || (pod.restarts && pod.restarts > 50);
                          return (
                          <div key={i} className={`px-3 py-1.5 text-xs font-mono hover:bg-gray-800/50 border-b border-gray-800/30 ${isCrit ? "bg-red-500/5" : ""}`}>
                            <div className={isCrit ? "text-red-400" : "text-orange-400"}>{pod.name}</div>
                            <div className="flex items-center gap-2 text-gray-600 mt-0.5">
                              <span>{pod.namespace}</span>
                              <span>·</span>
                              <span className={isCrit ? "text-red-400 font-semibold" : "text-yellow-500"}>{pod.status}</span>
                              {pod.restarts > 0 && <span className={isCrit ? "text-red-400" : "text-yellow-600"}>↺{pod.restarts}</span>}
                            </div>
                          </div>
                          );
                        })
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
              // Compute trend from metricsHistory
              const hist = metricsHistory.current;
              let trendArrow: string | null = null;
              let trendColor = "#6b7280";
              if (hist.length >= 3) {
                const prev = hist[hist.length - 2];
                const prevScore = Math.round(
                  (prev.appsTotal ? (prev.appsHealthy ?? 0) / prev.appsTotal * 40 : 40) +
                  (prev.unhealthy === 0 ? 40 : Math.max(0, 40 - (prev.unhealthy ?? 0) * 5)) + 20
                );
                if (score > prevScore + 3) { trendArrow = "↑"; trendColor = "#22c55e"; }
                else if (score < prevScore - 3) { trendArrow = "↓"; trendColor = "#ef4444"; }
              }
              return (
                <>
                  {hist.length >= 4 && (() => {
                    const scores = hist.slice(-12).map(h => Math.round(
                      (h.appsTotal ? (h.appsHealthy ?? 0) / h.appsTotal * 40 : 40) +
                      (h.unhealthy === 0 ? 40 : Math.max(0, 40 - (h.unhealthy ?? 0) * 5)) + 20
                    ));
                    const minS = Math.min(...scores), maxS = Math.max(...scores, minS + 1);
                    const w = 36, h = 12;
                    const xs = scores.map((_, i) => (i / (scores.length - 1)) * w);
                    const ys = scores.map(s => h - 2 - ((s - minS) / (maxS - minS)) * (h - 4));
                    const pts = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
                    const sparkColor = color;
                    return (
                      <svg width={w} height={h} className="hidden md:inline-block" style={{ verticalAlign: "middle", opacity: 0.6 }}>
                        <polyline points={pts} fill="none" stroke={sparkColor} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx={xs[xs.length-1]} cy={ys[ys.length-1]} r={1.5} fill={sparkColor} />
                      </svg>
                    );
                  })()}
                  <span className="hidden md:inline font-semibold tabular-nums" style={{ color }} title="Cluster health score">
                    {score}%{trendArrow && <span style={{ color: trendColor, fontSize: "0.65rem", marginLeft: 1 }}>{trendArrow}</span>}
                  </span>
                  {hist.length >= 4 && (() => {
                    // Compute 24h SLA: pct of samples where unhealthy=0
                    const recentHist = hist.filter(h => Date.now() - h.ts < 86400000);
                    if (recentHist.length < 2) return null;
                    const healthy = recentHist.filter(h => (h.unhealthy ?? 0) === 0).length;
                    const sla = Math.round((healthy / recentHist.length) * 100);
                    const slaColor = sla >= 99 ? "#22c55e" : sla >= 95 ? "#eab308" : "#ef4444";
                    return (
                      <>
                        <span className="hidden lg:inline text-gray-800">|</span>
                        <span className="hidden lg:inline text-[10px] font-mono tabular-nums" style={{ color: slaColor }} title={`24h SLA: ${healthy}/${recentHist.length} samples with all pods healthy`}>
                          SLA {sla}%
                        </span>
                      </>
                    );
                  })()}
                  <span className="hidden md:inline text-gray-800">|</span>
                </>
              );
            })()}
            <span className="hidden md:inline text-gray-600">Talos v1.13.2</span>
            <span className="hidden md:inline text-gray-800">|</span>
            <span className="hidden md:inline text-gray-600">K8s v1.36</span>
            {cluster?.recentEvents && cluster.recentEvents.length > 0 && (
              <>
                <span className="hidden md:inline text-gray-800">|</span>
                <span className={`hidden md:inline font-mono text-xs ${cluster.recentEvents.length > 5 ? "text-orange-500/80" : "text-yellow-600/70"}`} title={`${cluster.recentEvents.length} warning events`}>
                  ⚠{cluster.recentEvents.length}
                </span>
              </>
            )}
            {cluster?.unhealthyPods && cluster.unhealthyPods.length > 0 && (() => {
              const totalRestarts = cluster.unhealthyPods.reduce((s, p) => s + (p.restarts ?? 0), 0);
              if (totalRestarts === 0) return null;
              return (
                <>
                  <span className="hidden md:inline text-gray-800">|</span>
                  <span className="hidden md:inline font-mono text-xs text-red-500/70" title={`Total pod restarts: ${totalRestarts}`}>↺{totalRestarts}</span>
                </>
              );
            })()}
            {cluster?.longhornStorage && (
              <>
                <span className="hidden md:inline text-gray-800">|</span>
                <span className={`hidden md:inline ${cluster.longhornStorage.pct > 80 ? "text-red-500" : cluster.longhornStorage.pct > 60 ? "text-yellow-500" : "text-gray-600"}`} title={`Longhorn: ${cluster.longhornStorage.usedGiB}G used of ${cluster.longhornStorage.totalGiB}G`}>
                  💾 {cluster.longhornStorage.pct.toFixed(0)}%
                </span>
              </>
            )}
            {/* ArgoCD apps mini-grid */}
            {cluster?.apps && cluster.apps.length > 0 && (
              <>
                <span className="hidden lg:inline text-gray-800">|</span>
                <div className="hidden lg:flex items-center gap-0.5" title={`ArgoCD: ${cluster.apps.filter(a => a.health === "Healthy").length}/${cluster.apps.length} healthy`}>
                  {cluster.apps.map((app, i) => {
                    const c = app.health === "Healthy" && app.sync === "Synced" ? "#22c55e"
                      : app.health === "Degraded" ? "#ef4444"
                      : app.sync === "OutOfSync" ? "#eab308" : "#6b7280";
                    return <div key={i} title={`${app.name}: ${app.health} / ${app.sync}`} className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: c + "cc" }} />;
                  })}
                </div>
              </>
            )}
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

        {/* Events ticker at bottom when there are recent events */}
        {cluster?.recentEvents && cluster.recentEvents.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-6 bg-gray-950/70 border-t border-gray-800/30 overflow-hidden pointer-events-none flex items-center">
            <span className="text-[9px] font-mono text-yellow-600/60 px-2 shrink-0">EVENTS</span>
            <div className="overflow-hidden flex-1" style={{ maskImage: "linear-gradient(90deg, transparent, black 5%, black 95%, transparent)" }}>
              <div className="whitespace-nowrap text-[9px] font-mono text-gray-700" style={{ animation: `scroll-ticker ${Math.max(20, cluster.recentEvents.length * 6)}s linear infinite` }}>
                {[...cluster.recentEvents, ...cluster.recentEvents].map((ev, i) => (
                  <span key={i} className="mr-8">
                    <span className={ev.type === "Warning" ? "text-yellow-600/70" : "text-gray-600"}>
                      {ev.type === "Warning" ? "⚠ " : "· "}{ev.namespace}/{ev.name} — {ev.reason}
                    </span>
                    {ev.message && <span className="text-gray-800"> · {ev.message.slice(0, 60)}{ev.message.length > 60 ? "…" : ""}</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

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
          <div className="absolute bottom-5 right-5 text-xs text-gray-700 font-mono hidden sm:flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              {isLoading ? (
                <span className="text-blue-500/60 animate-pulse">syncing...</span>
              ) : (
                (() => {
                  const dataAgeMs = cluster ? Date.now() - new Date(cluster.timestamp).getTime() : 0;
                  const isStale = dataAgeMs > 120000; // 2 mins
                  return (
                    <span className={`pointer-events-none ${isStale ? "text-yellow-600/70" : ""}`}>
                      {isStale && "⚠ "}last sync: {new Date(cluster.timestamp).toLocaleTimeString()} · {nextRefreshIn}s
                    </span>
                  );
                })()
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
            {/* Refresh progress bar */}
            <div className="w-full h-px bg-gray-800/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600/40 rounded-full transition-all duration-1000"
                style={{ width: `${(1 - nextRefreshIn / 30) * 100}%` }}
              />
            </div>
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
            recentPods={cluster?.recentPods}
            totalCpuRequestsM={cluster?.totalCpuRequestsM}
            totalMemRequestsMi={cluster?.totalMemRequestsMi}
            nsImages={cluster?.nsImages}
            longhornVolumes={cluster?.longhornVolumes}
            nodePressures={cluster?.node?.pressures}
            kubeletVersion={cluster?.node?.kubeletVersion}
            nodeUptime={cluster?.node?.uptime}
            k8sServices={cluster?.k8sServices}
            nsIngress={cluster?.nsIngress}
            nsDeployments={cluster?.nsDeployments}
            nsCronJobs={cluster?.nsCronJobs}
            nsHelmReleases={cluster?.nsHelmReleases}
            nsPvcs={cluster?.nsPvcs}
            podStatusCounts={cluster?.podStatusCounts}
            nsStatefulSets={cluster?.nsStatefulSets}
            totalDaemonSets={cluster?.totalDaemonSets}
            restartHistory={restartHistory.current}
            longRunningPods={cluster?.longRunningPods}
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
