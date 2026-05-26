"use client";

import { services, node, type Service } from "../data";

function StatusBadge({ status }: { status: Service["status"] }) {
  const styles = {
    running: "bg-green-500/20 text-green-400 border-green-500/30",
    degraded: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    stopped: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export default function DetailPanel({
  selectedIdx,
  onClose,
}: {
  selectedIdx: number | null;
  onClose: () => void;
}) {
  if (selectedIdx === null) {
    return (
      <div className="w-80 bg-gray-900/80 backdrop-blur-xl border-l border-gray-800 p-6 overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-200 mb-4">
          Node Overview
        </h2>
        <div className="space-y-3 text-sm">
          <InfoRow label="Hostname" value={node.hostname} />
          <InfoRow label="IP" value={node.ip} />
          <InfoRow label="OS" value={node.os} />
          <InfoRow label="CPU" value={node.cpu} />
          <InfoRow label="RAM" value={node.ram} />
          <InfoRow label="Storage" value={node.storage} />
          <InfoRow label="Kubernetes" value={node.k8sVersion} />
        </div>

        <h3 className="text-sm font-semibold text-gray-400 mt-6 mb-3 uppercase tracking-wider">
          Services ({services.filter((s) => s.status === "running").length}/
          {services.length} running)
        </h3>
        <div className="space-y-2">
          {services.map((svc) => (
            <div
              key={svc.name}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-gray-300">
                {svc.icon} {svc.name}
              </span>
              <StatusBadge status={svc.status} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const svc = services[selectedIdx];

  return (
    <div className="w-80 bg-gray-900/80 backdrop-blur-xl border-l border-gray-800 p-6 overflow-y-auto">
      <button
        onClick={onClose}
        className="text-gray-500 hover:text-gray-300 text-sm mb-4 cursor-pointer"
      >
        ← Back to overview
      </button>

      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">{svc.icon}</span>
        <div>
          <h2 className="text-lg font-semibold text-gray-200">{svc.name}</h2>
          <StatusBadge status={svc.status} />
        </div>
      </div>

      <p className="text-gray-400 text-sm mb-6">{svc.description}</p>

      <div className="space-y-3 text-sm">
        <InfoRow label="Namespace" value={svc.namespace} />
        <InfoRow
          label="Endpoint"
          value={
            svc.ip === "internal"
              ? `${svc.name.toLowerCase()}.${svc.namespace}.svc:${svc.port}`
              : `${svc.ip}:${svc.port}`
          }
        />
        <InfoRow
          label="Access"
          value={svc.ip === "internal" ? "Cluster-only" : "LAN LoadBalancer"}
        />
      </div>

      {svc.url && (
        <a
          href={svc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 block w-full text-center py-2 px-4 rounded-lg text-sm font-medium transition-colors"
          style={{
            backgroundColor: svc.color + "33",
            color: svc.color,
            border: `1px solid ${svc.color}55`,
          }}
        >
          Open {svc.name} →
        </a>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-300 font-mono text-xs">{value}</span>
    </div>
  );
}
