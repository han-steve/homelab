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
    url: "https://jellyfin.homelab",
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
    url: "https://budget.homelab",
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
    url: "https://grafana.homelab",
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
    url: "https://argocd.homelab",
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
    url: "https://apitable.homelab",
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
    url: "https://ocis.homelab",
    category: "app",
  },
  {
    name: "Prometheus",
    icon: "🔥",
    ip: "prometheus.homelab",
    port: 9090,
    status: "running",
    namespace: "monitoring",
    description: "Metrics collection and alerting (30d retention)",
    color: "#e6522c",
    url: "https://prometheus.homelab",
    category: "monitoring",
  },
  {
    name: "Loki",
    icon: "📜",
    ip: "loki.monitoring.svc",
    port: 3100,
    status: "running",
    namespace: "monitoring",
    description: "Log aggregation — query via Grafana Explore",
    color: "#f5a623",
    category: "monitoring",
  },
  {
    name: "MinIO",
    icon: "🗄️",
    ip: "minio.homelab",
    port: 9001,
    status: "running",
    namespace: "backup",
    description: "S3-compatible object storage for backups",
    color: "#c72c48",
    url: "https://minio.homelab",
    category: "storage",
  },
  {
    name: "Longhorn",
    icon: "💾",
    ip: "longhorn.homelab",
    port: 80,
    status: "running",
    namespace: "longhorn-system",
    description: "Distributed block storage (1TB NVMe, 200% overprov)",
    color: "#5f8dd3",
    url: "https://longhorn.homelab",
    category: "storage",
  },
  {
    name: "Home Assistant",
    icon: "🏠",
    ip: "192.168.1.16",
    port: 8123,
    status: "running",
    namespace: "home-assistant",
    description: "Smart home automation with Zigbee2MQTT and MQTT",
    color: "#18bcf2",
    url: "https://ha.homelab",
    category: "app",
  },
  {
    name: "nginx-ingress",
    icon: "🌐",
    ip: "192.168.1.21",
    port: 443,
    status: "running",
    namespace: "ingress-nginx",
    description: "Ingress controller — TLS termination for *.homelab",
    color: "#009639",
    category: "infra",
  },
  {
    name: "CoreDNS (homelab)",
    icon: "🔤",
    ip: "192.168.1.22",
    port: 53,
    status: "running",
    namespace: "homelab-dns",
    description: "Authoritative DNS for *.homelab zone",
    color: "#4a90d9",
    category: "infra",
  },
  {
    name: "cert-manager",
    icon: "🔒",
    ip: "internal",
    port: 443,
    status: "running",
    namespace: "cert-manager",
    description: "X.509 certificate management (homelab-ca, ECDSA P-256)",
    color: "#326ce5",
    category: "infra",
  },
  {
    name: "Zigbee2MQTT",
    icon: "📡",
    ip: "internal",
    port: 8080,
    status: "running",
    namespace: "home-assistant",
    description: "Zigbee gateway — Sonoff ZBDongle-E (EmberZNet 7.4.5)",
    color: "#ffc135",
    url: "https://zigbee.homelab",
    category: "app",
  },
  {
    name: "Mosquitto",
    icon: "🦟",
    ip: "internal",
    port: 1883,
    status: "running",
    namespace: "home-assistant",
    description: "MQTT broker for IoT device communication",
    color: "#3c5280",
    category: "infra",
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
  cpu: "Intel Core Ultra 7 356H (16C)",
  ram: "32 GB DDR5",
  storage: "1TB NVMe",
  k8sVersion: "v1.36.0",
};

export interface GpuNode {
  name: string;
  hostname: string;
  ip: string;
  os: string;
  cpu: string;
  ram: string;
  gpu: string;
  storage: string;
  nic: string;
  status: "online" | "planned" | "offline";
}

export const gpuNode: GpuNode = {
  name: "gpu",
  hostname: "gpu",
  ip: "192.168.1.101",
  os: "Debian 12 (pending Talos)",
  cpu: "Intel i9-9900K (8C/16T, 5.0 GHz)",
  ram: "32 GB DDR4-3200",
  gpu: "NVIDIA RTX 3080 Ti (12 GB)",
  storage: "1TB NVMe",
  nic: "Intel I219-V 1 GbE",
  status: "planned",
};

export interface RouterInfo {
  name: string;
  ip: string;
  model: string;
  ports: string;
  isp: string;
}

export const router: RouterInfo = {
  name: "AT&T BGW320",
  ip: "192.168.1.1",
  model: "BGW320-500",
  ports: "1x 5 GbE + 3x 1 GbE",
  isp: "AT&T Fiber",
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
  { id: "internet", label: "Internet", icon: "🌐", type: "internet", x: 0.5, y: 0.04, color: "#30363d", tooltip: "AT&T Fiber upstream" },
  { id: "router", label: "AT&T BGW320", icon: "📡", type: "router", x: 0.5, y: 0.17, color: "#8b949e", tooltip: "Gateway 192.168.1.1" },
  { id: "tailscale", label: "Tailscale", icon: "🔐", type: "infra", x: 0.78, y: 0.17, color: "#8b949e", tooltip: "WireGuard VPN overlay" },
  { id: "m2", label: "M2 Node", icon: "⚡", type: "node", x: 0.35, y: 0.33, color: "#58a6ff", tooltip: "K8s control-plane 192.168.1.10" },
  { id: "gpu", label: "GPU Node", icon: "🎮", type: "node-planned", x: 0.75, y: 0.33, color: "#d29922", tooltip: "i9-9900K + RTX 3080 Ti (pending)" },
  { id: "cilium", label: "Cilium LB", icon: "🔀", type: "infra", x: 0.35, y: 0.50, color: "#3fb950", tooltip: "LB-IPAM 192.168.1.11-30" },
  { id: "nginx", label: "nginx-ingress", icon: "🌐", type: "infra", x: 0.12, y: 0.50, color: "#009639", tooltip: "LB 192.168.1.21" },
  { id: "dns", label: "homelab-dns", icon: "🔤", type: "infra", x: 0.58, y: 0.50, color: "#4a90d9", tooltip: "DNS 192.168.1.22" },
  // Apps row
  { id: "jellyfin", label: "Jellyfin", icon: "🎬", type: "service", x: 0.05, y: 0.70, color: "#00a4dc", tooltip: "jellyfin.homelab:8096", serviceIdx: 0 },
  { id: "actual", label: "Actual Budget", icon: "💰", type: "service", x: 0.19, y: 0.70, color: "#5b21b6", tooltip: "budget.homelab:5006", serviceIdx: 1 },
  { id: "grafana", label: "Grafana", icon: "📊", type: "service", x: 0.33, y: 0.70, color: "#f46800", tooltip: "grafana.homelab", serviceIdx: 2 },
  { id: "argocd", label: "ArgoCD", icon: "🔄", type: "service", x: 0.47, y: 0.70, color: "#ef7b4d", tooltip: "argocd.homelab", serviceIdx: 3 },
  { id: "apitable", label: "APITable", icon: "📋", type: "service", x: 0.61, y: 0.70, color: "#7c3aed", tooltip: "apitable.homelab", serviceIdx: 4 },
  { id: "ocis", label: "oCIS", icon: "☁️", type: "service", x: 0.75, y: 0.70, color: "#0082c9", tooltip: "ocis.homelab:9200", serviceIdx: 5 },
  { id: "homeassistant", label: "Home Assistant", icon: "🏠", type: "service", x: 0.92, y: 0.70, color: "#18bcf2", tooltip: "ha.homelab:8123", serviceIdx: 10 },
  // Monitoring row
  { id: "prometheus", label: "Prometheus", icon: "🔥", type: "service", x: 0.12, y: 0.88, color: "#e6522c", tooltip: "prometheus.homelab:9090", serviceIdx: 6 },
  { id: "loki", label: "Loki", icon: "📜", type: "service", x: 0.30, y: 0.88, color: "#f0c057", tooltip: "loki.monitoring.svc:3100", serviceIdx: 7 },
  { id: "minio", label: "MinIO", icon: "🗄️", type: "service", x: 0.50, y: 0.88, color: "#c72c2c", tooltip: "minio.homelab:9001", serviceIdx: 8 },
  { id: "longhorn", label: "Longhorn", icon: "💾", type: "service", x: 0.70, y: 0.88, color: "#3b82f6", tooltip: "longhorn.homelab", serviceIdx: 9 },
  { id: "certmanager", label: "cert-manager", icon: "🔒", type: "service", x: 0.88, y: 0.88, color: "#6366f1", tooltip: "Homelab CA (ECDSA P-256)", serviceIdx: 13 },
];

export const topoLinks: TopoLink[] = [
  { source: "internet", target: "router", style: "solid", color: "#8b949e" },
  { source: "router", target: "m2", style: "solid", color: "#58a6ff" },
  { source: "router", target: "tailscale", style: "dashed", color: "#8b949e" },
  { source: "router", target: "gpu", style: "dashed", color: "#d29922", label: "planned" },
  { source: "tailscale", target: "m2", style: "dashed", color: "#8b949e" },
  { source: "m2", target: "cilium", style: "solid", color: "#3fb950" },
  { source: "m2", target: "gpu", style: "dashed", color: "#d29922", label: "worker" },
  { source: "m2", target: "nginx", style: "solid", color: "#009639" },
  { source: "m2", target: "dns", style: "solid", color: "#4a90d9" },
  { source: "cilium", target: "jellyfin", style: "solid", color: "#3fb950" },
  { source: "cilium", target: "actual", style: "solid", color: "#3fb950" },
  { source: "cilium", target: "grafana", style: "solid", color: "#3fb950" },
  { source: "cilium", target: "argocd", style: "solid", color: "#3fb950" },
  { source: "cilium", target: "apitable", style: "solid", color: "#3fb950" },
  { source: "cilium", target: "ocis", style: "solid", color: "#3fb950" },
  { source: "cilium", target: "homeassistant", style: "solid", color: "#3fb950" },
  { source: "nginx", target: "prometheus", style: "solid", color: "#e6522c" },
  { source: "nginx", target: "longhorn", style: "solid", color: "#3b82f6" },
  { source: "nginx", target: "minio", style: "solid", color: "#c72c2c" },
  { source: "m2", target: "loki", style: "solid", color: "#f0c057" },
  { source: "m2", target: "certmanager", style: "dashed", color: "#6366f1" },
];
