"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef, Suspense } from "react";
import DetailPanel from "./components/DetailPanel";

interface ClusterStatus {
  timestamp: string;
  apps: { name: string; sync: string; health: string }[];
  unhealthyPods: { namespace: string; name: string; status: string; restarts: number }[];
  totalPods?: number;
  nsPodCounts?: Record<string, number>;
  node: { name: string; ready: boolean; cpu?: string; memory?: string; uptime?: string | null } | null;
  nodeMetrics?: { cpuCores: string; memoryi: string; cpuPct: string; memPct: string } | null;
  recentEvents?: { namespace: string; name: string; reason: string; message: string; count: number; age: string }[];
  longhornStorage?: { totalGiB: number; usedGiB: number; freeGiB: number; pct: number } | null;
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
  const [nextRefreshIn, setNextRefreshIn] = useState(30);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const metricsHistory = useRef<{ cpu: number; ram: number; ts: number }[]>([]);

  useEffect(() => {
    const fetchStatus = () => {
      setIsLoading(true);
      setNextRefreshIn(30);
      fetch("/api/cluster-status")
        .then((r) => r.json())
        .then((data: ClusterStatus) => {
          setCluster(data);
          // Store metrics history (keep last 20 samples)
          if (data.nodeMetrics) {
            const cpu = parseInt(data.nodeMetrics.cpuPct, 10) || 0;
            const ram = parseInt(data.nodeMetrics.memPct, 10) || 0;
            metricsHistory.current = [...metricsHistory.current.slice(-19), { cpu, ram, ts: Date.now() }];
          }
        })
        .catch(() => {})
        .finally(() => setIsLoading(false));
    };
    fetchStatus();
    const id = setInterval(fetchStatus, 30000);
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

  return (
    <div className="flex h-screen bg-gray-950 text-white">
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
            />
          ) : (
            <TopologyView
              onSelectService={setSelectedIdx}
              nodeMetrics={cluster?.nodeMetrics}
              nsPodCounts={cluster?.nsPodCounts}
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
            <span className="hidden md:inline text-gray-600">Talos v1.13.2</span>
            <span className="hidden md:inline text-gray-800">|</span>
            <span className="hidden md:inline text-gray-600">K8s v1.36</span>
            {cluster?.node?.uptime && (
              <>
                <span className="hidden md:inline text-gray-800">|</span>
                <span className="hidden md:inline text-gray-600" title="Node uptime">↑ {cluster.node.uptime}</span>
              </>
            )}
            <span className="hidden md:inline text-gray-800">|</span>
            <span className="hidden md:inline text-gray-500 tabular-nums" title="Local time">{currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
          </div>
        </div>

        {/* Footer hints */}
        {view === "rack" && (
          <div className="absolute bottom-5 left-5 text-xs text-gray-700 pointer-events-none font-mono">
            click node/service · drag to rotate · scroll to zoom · [S] services · [←/→] navigate · [Esc] deselect
          </div>
        )}
        {cluster && (
          <div className="absolute bottom-5 right-5 text-xs text-gray-700 pointer-events-none font-mono hidden sm:block">
            {isLoading ? (
              <span className="text-blue-500/60 animate-pulse">syncing...</span>
            ) : (
              <span>last sync: {new Date(cluster.timestamp).toLocaleTimeString()} · refresh in {nextRefreshIn}s</span>
            )}
          </div>
        )}
      </div>

      {/* Detail Panel — hidden on mobile, slide-in on tablet+ */}
      <div className="hidden sm:block">
        <DetailPanel
          selectedIdx={selectedIdx}
          onClose={() => setSelectedIdx(null)}
          onSelectService={setSelectedIdx}
          nodeMetrics={cluster?.nodeMetrics}
          nsPodCounts={cluster?.nsPodCounts}
          recentEvents={cluster?.recentEvents}
          metricsHistory={metricsHistory.current}
          longhornStorage={cluster?.longhornStorage}
        />
      </div>
    </div>
  );
}
