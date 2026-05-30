"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, Suspense } from "react";
import DetailPanel from "./components/DetailPanel";

interface ClusterStatus {
  timestamp: string;
  apps: { name: string; sync: string; health: string }[];
  unhealthyPods: { namespace: string; name: string; status: string; restarts: number }[];
  node: { name: string; ready: boolean } | null;
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

  useEffect(() => {
    const fetchStatus = () =>
      fetch("/api/cluster-status")
        .then((r) => r.json())
        .then(setCluster)
        .catch(() => {});
    fetchStatus();
    const id = setInterval(fetchStatus, 30000);
    return () => clearInterval(id);
  }, []);

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
            <Scene3D onSelect={setSelectedIdx} selectedIdx={selectedIdx} />
          ) : (
            <TopologyView onSelectService={setSelectedIdx} />
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
                <span
                  className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded ${cluster.apps.every(a => a.sync === "Synced") ? "" : "bg-yellow-500/10 text-yellow-400"}`}
                  title={cluster.apps.map(a => `${a.name}: ${a.sync}`).join("\n")}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${cluster.apps.every(a => a.sync === "Synced") ? "bg-green-500" : "bg-yellow-500"}`} />
                  <span className="hidden sm:inline">{cluster.apps.filter(a => a.sync === "Synced").length}/{cluster.apps.length} synced</span>
                </span>
                <span className="hidden sm:inline text-gray-800">|</span>
                <span className="flex items-center gap-1.5" title={cluster.unhealthyPods.map(p => `${p.namespace}/${p.name}: ${p.status}`).join("\n")}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cluster.unhealthyPods.length === 0 ? "bg-green-500" : "bg-orange-500"}`} />
                  <span className="hidden sm:inline text-gray-500">{cluster.unhealthyPods.length > 0 ? `${cluster.unhealthyPods.length} issues` : "healthy"}</span>
                </span>
                <span className="hidden md:inline text-gray-800">|</span>
              </>
            )}
            <span className="hidden md:inline text-gray-600">Talos v1.13.2</span>
            <span className="hidden md:inline text-gray-800">|</span>
            <span className="hidden md:inline text-gray-600">K8s v1.36</span>
          </div>
        </div>

        {/* Footer hints */}
        {view === "rack" && (
          <div className="absolute bottom-5 left-5 text-xs text-gray-700 pointer-events-none font-mono">
            click node/service · drag to rotate · scroll to zoom · [S] services · [Esc] deselect
          </div>
        )}
        {cluster && (
          <div className="absolute bottom-5 right-5 text-xs text-gray-700 pointer-events-none font-mono hidden sm:block">
            last sync: {new Date(cluster.timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Detail Panel — hidden on mobile, slide-in on tablet+ */}
      <div className="hidden sm:block">
        <DetailPanel
          selectedIdx={selectedIdx}
          onClose={() => setSelectedIdx(null)}
          onSelectService={setSelectedIdx}
        />
      </div>
    </div>
  );
}
