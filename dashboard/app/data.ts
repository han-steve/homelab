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
  },
  {
    name: "APITable",
    icon: "📋",
    ip: "192.168.1.15",
    port: 80,
    status: "degraded",
    namespace: "apitable",
    description: "Open-source Airtable alternative",
    color: "#7c3aed",
    url: "http://192.168.1.15",
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
  storage: "1TB Crucial NVMe",
  k8sVersion: "v1.36.0",
};
