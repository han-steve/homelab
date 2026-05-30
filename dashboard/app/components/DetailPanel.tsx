"use client";

import { useState } from "react";
import { services, node, type Service } from "../data";

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
  selectedIdx, onClose, onSelectService, nodeMetrics,
}: {
  selectedIdx: number | null;
  onClose: () => void;
  onSelectService?: (idx: number) => void;
  nodeMetrics?: { cpuCores: string; memoryi: string; cpuPct: string; memPct: string } | null;
}) {
  const [search, setSearch] = useState("");

  if (selectedIdx === null) {
    const filteredServices = search
      ? services.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.category.includes(search.toLowerCase()))
      : services;

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
            </>
          )}
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent mb-4" />

        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider font-mono">Services</h3>
          <span className="text-xs font-mono text-green-400">
            {services.filter((s) => s.status === "running").length}/{services.length}
          </span>
        </div>

        {/* Search filter */}
        <div className="relative mb-3">
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

        <div className="space-y-1.5">
          {filteredServices.map((svc) => {
            const i = services.indexOf(svc);
            return (
            <div
              key={svc.name}
              className="flex items-center justify-between text-sm py-1.5 px-2 rounded-md hover:bg-gray-800/50 transition-colors cursor-pointer"
              onClick={() => onSelectService?.(i)}
            >              <span className="text-gray-300 flex items-center gap-2">
                <span>{svc.icon}</span>
                <span className="text-xs">{svc.name}</span>
              </span>
              <div className="flex items-center gap-1.5">
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

        <div className="h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent my-4" />
        <div className="space-y-1 text-xs text-gray-600 font-mono">
          <p>CNI: Cilium v1.19.4</p>
          <p>Storage: Longhorn</p>
          <p>GitOps: ArgoCD v3.4.2</p>
          <p>LB: 192.168.1.11-30</p>
        </div>
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
