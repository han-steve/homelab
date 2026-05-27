export interface Service {
  name: string;
  icon: string;
  ip: string;
  port: number;
  status: "running" | "degraded" | "stopped";
  namespace: string;
  description: string;
  color: string;
  url?: string;
  category: "app" | "infra" | "monitoring" | "storage";
}

export const services: Service[] = [
  {
    name: "Jellyfin",
    icon: "🎬",
    ip: "192.168.1.11",
    port: 8096,
    status: "running",
    namespace: "jellyfin",
    description: "Media server for movies, TV shows, and music",
    color: "#00a4dc",
    url: "http://192.168.1.11:8096",
    category: "app",
  },
  {
    name: "Actual Budget",
    icon: "💰",
    ip: "192.168.1.12",
    port: 5006,
    status: "running",
    namespace: "actual-budget",
    description: "Privacy-focused personal finance manager",
    color: "#5b21b6",
    url: "https://192.168.1.12:5006",
    category: "app",
  },
  {
    name: "Grafana",
    icon: "📊",
    ip: "192.168.1.13",
    port: 80,
    status: "running",
    namespace: "monitoring",
    description: "Observability dashboards and alerting",
    color: "#f46800",
    url: "http://192.168.1.13",
    category: "monitoring",
  },
  {
    name: "ArgoCD",
    icon: "🔄",
    ip: "192.168.1.14",
    port: 80,
    status: "running",
    namespace: "argocd",
    description: "GitOps continuous delivery for Kubernetes",
    color: "#ef7b4d",
    url: "http://192.168.1.14",
    category: "infra",
  },
  {
    name: "APITable",
    icon: "📋",
    ip: "192.168.1.15",
    port: 80,
    status: "running",
    namespace: "apitable",
    description: "Open-source Airtable alternative",
    color: "#7c3aed",
    url: "http://192.168.1.15",
    category: "app",
  },
  {
    name: "oCIS",
    icon: "☁️",
    ip: "192.168.1.20",
    port: 9200,
    status: "running",
    namespace: "ocis",
    description: "ownCloud Infinite Scale — self-hosted cloud storage",
    color: "#0082c9",
    url: "https://192.168.1.20:9200",
    category: "app",
  },
  {
    name: "Prometheus",
    icon: "🔥",
    ip: "internal",
    port: 9090,
    status: "running",
    namespace: "monitoring",
    description: "Metrics collection and alerting (90d retention)",
    color: "#e6522c",
    category: "monitoring",
  },
  {
    name: "Loki",
    icon: "📜",
    ip: "internal",
    port: 3100,
    status: "running",
    namespace: "monitoring",
    description: "Log aggregation system",
    color: "#f5a623",
    category: "monitoring",
  },
  {
    name: "MinIO",
    icon: "🗄️",
    ip: "internal",
    port: 9000,
    status: "running",
    namespace: "backup",
    description: "S3-compatible object storage for backups",
    color: "#c72c48",
    category: "storage",
  },
  {
    name: "Longhorn",
    icon: "💾",
    ip: "internal",
    port: 443,
    status: "running",
    namespace: "longhorn-system",
    description: "Distributed block storage (1TB NVMe, 200% overprov)",
    color: "#5f8dd3",
    category: "storage",
  },
];

export interface NodeInfo {
  name: string;
  hostname: string;
  ip: string;
  os: string;
  cpu: string;
  ram: string;
  storage: string;
  k8sVersion: string;
}

export const node: NodeInfo = {
  name: "m2",
  hostname: "m2",
  ip: "192.168.1.10",
  os: "Talos Linux v1.13.2",
  cpu: "Apple M2 (8 cores)",
  ram: "24 GB",
  storage: "1TB NVMe",
  k8sVersion: "v1.36.0",
};

// Topology graph data for the network view
export interface TopoNode {
  id: string;
  label: string;
  icon: string;
  type: "internet" | "router" | "node" | "node-planned" | "infra" | "service";
  x: number; // 0-1 normalized
  y: number;
  color: string;
  tooltip: string;
  serviceIdx?: number; // index into services[] for linking
}

export interface TopoLink {
  source: string;
  target: string;
  style: "solid" | "dashed";
  color: string;
  label?: string;
}

export const topoNodes: TopoNode[] = [
  { id: "internet", label: "Internet", icon: "🌐", type: "internet", x: 0.5, y: 0.05, color: "#30363d", tooltip: "AT&T Fiber upstream" },
  { id: "router", label: "AT&T BGW320", icon: "📡", type: "router", x: 0.5, y: 0.2, color: "#8b949e", tooltip: "Gateway 192.168.1.1" },
  { id: "tailscale", label: "Tailscale", icon: "🔐", type: "infra", x: 0.75, y: 0.2, color: "#8b949e", tooltip: "WireGuard VPN overlay" },
  { id: "m2", label: "M2 Node", icon: "⚡", type: "node", x: 0.35, y: 0.38, color: "#58a6ff", tooltip: "K8s control-plane 192.168.1.10" },
  { id: "gpu", label: "GPU Node", icon: "🎮", type: "node-planned", x: 0.72, y: 0.38, color: "#d29922", tooltip: "i9-9900K + RTX 3080 Ti (pending)" },
  { id: "cilium", label: "Cilium LB", icon: "🔀", type: "infra", x: 0.35, y: 0.55, color: "#3fb950", tooltip: "LB-IPAM 192.168.1.11-30" },
  { id: "jellyfin", label: "Jellyfin", icon: "🎬", type: "service", x: 0.08, y: 0.78, color: "#00a4dc", tooltip: "192.168.1.11:8096", serviceIdx: 0 },
  { id: "actual", label: "Actual Budget", icon: "💰", type: "service", x: 0.22, y: 0.78, color: "#5b21b6", tooltip: "192.168.1.12:5006", serviceIdx: 1 },
  { id: "grafana", label: "Grafana", icon: "📊", type: "service", x: 0.36, y: 0.78, color: "#f46800", tooltip: "192.168.1.13", serviceIdx: 2 },
  { id: "argocd", label: "ArgoCD", icon: "🔄", type: "service", x: 0.50, y: 0.78, color: "#ef7b4d", tooltip: "192.168.1.14", serviceIdx: 3 },
  { id: "apitable", label: "APITable", icon: "📋", type: "service", x: 0.64, y: 0.78, color: "#7c3aed", tooltip: "192.168.1.15", serviceIdx: 4 },
  { id: "ocis", label: "oCIS", icon: "☁️", type: "service", x: 0.78, y: 0.78, color: "#0082c9", tooltip: "192.168.1.20:9200", serviceIdx: 5 },
];

export const topoLinks: TopoLink[] = [
  { source: "internet", target: "router", style: "solid", color: "#8b949e" },
  { source: "router", target: "m2", style: "solid", color: "#58a6ff" },
  { source: "router", target: "tailscale", style: "dashed", color: "#8b949e" },
  { source: "router", target: "gpu", style: "dashed", color: "#d29922", label: "planned" },
  { source: "tailscale", target: "m2", style: "dashed", color: "#8b949e" },
  { source: "m2", target: "cilium", style: "solid", color: "#3fb950" },
  { source: "m2", target: "gpu", style: "dashed", color: "#d29922", label: "worker" },
  { source: "cilium", target: "jellyfin", style: "solid", color: "#3fb950" },
  { source: "cilium", target: "actual", style: "solid", color: "#3fb950" },
  { source: "cilium", target: "grafana", style: "solid", color: "#3fb950" },
  { source: "cilium", target: "argocd", style: "solid", color: "#3fb950" },
  { source: "cilium", target: "apitable", style: "solid", color: "#3fb950" },
  { source: "cilium", target: "ocis", style: "solid", color: "#3fb950" },
];
