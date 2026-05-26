"use client";

import dynamic from "next/dynamic";
import { useState, Suspense } from "react";
import DetailPanel from "./components/DetailPanel";

const Scene3D = dynamic(() => import("./components/Scene3D"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-gray-500 animate-pulse">Loading 3D scene...</div>
    </div>
  ),
});

export default function Home() {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* 3D Scene */}
      <div className="flex-1 relative">
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center">
              <div className="text-gray-500">Loading...</div>
            </div>
          }
        >
          <Scene3D onSelect={setSelectedIdx} selectedIdx={selectedIdx} />
        </Suspense>

        {/* Title overlay */}
        <div className="absolute top-6 left-6 pointer-events-none">
          <h1 className="text-2xl font-bold text-gray-200 tracking-tight">
            Homelab
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Talos Linux · K8s v1.36 · Cilium · Longhorn
          </p>
        </div>

        {/* Instructions */}
        <div className="absolute bottom-6 left-6 text-xs text-gray-600 pointer-events-none">
          Click a service for details · Drag to rotate · Scroll to zoom
        </div>
      </div>

      {/* Detail Panel */}
      <DetailPanel
        selectedIdx={selectedIdx}
        onClose={() => setSelectedIdx(null)}
      />
    </div>
  );
}
