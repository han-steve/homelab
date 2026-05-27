"use client";

import dynamic from "next/dynamic";
import { useState, Suspense } from "react";
import DetailPanel from "./components/DetailPanel";

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

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* Main view */}
      <div className="flex-1 relative">
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
        <div className="absolute top-0 left-0 right-0 h-[52px] bg-gray-950/80 backdrop-blur-md border-b border-gray-800/50 flex items-center px-5 z-10">
          {/* Logo */}
          <div className="flex items-center gap-2 mr-6">
            <span className="text-lg">🏠</span>
            <span className="text-sm font-bold text-white tracking-tight">
              homelab
            </span>
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1" />
          </div>

          {/* View switcher */}
          <div className="flex items-center bg-gray-900 rounded-lg border border-gray-800/50 p-0.5">
            <button
              onClick={() => setView("rack")}
              className={
                "px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer " +
                (view === "rack"
                  ? "bg-gray-800 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-300")
              }
            >
              🖥️ 3D Rack
            </button>
            <button
              onClick={() => setView("topology")}
              className={
                "px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer " +
                (view === "topology"
                  ? "bg-gray-800 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-300")
              }
            >
              🔗 Topology
            </button>
          </div>

          {/* Stack info */}
          <div className="ml-auto flex items-center gap-4 text-xs text-gray-600 font-mono">
            <span>Talos v1.13.2</span>
            <span className="text-gray-800">|</span>
            <span>K8s v1.36</span>
            <span className="text-gray-800">|</span>
            <span>Cilium</span>
            <span className="text-gray-800">|</span>
            <span>Longhorn</span>
          </div>
        </div>

        {/* Footer hints */}
        {view === "rack" && (
          <div className="absolute bottom-5 left-5 text-xs text-gray-700 pointer-events-none font-mono">
            click service · drag rotate · scroll zoom
          </div>
        )}
      </div>

      {/* Detail Panel */}
      <DetailPanel
        selectedIdx={selectedIdx}
        onClose={() => setSelectedIdx(null)}
      />
    </div>
  );
}
