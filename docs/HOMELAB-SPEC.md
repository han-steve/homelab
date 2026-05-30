# Homelab Complete Specification
*Generated: May 29, 2026 — read on e-reader, print to PDF*

---

## 1. Hardware

### M2 Node (Primary — 192.168.1.10)
| Spec | Value |
|------|-------|
| Model | Minisforum M2 |
| CPU | Intel Core Ultra 7 356H (16 cores, 22 threads) |
| RAM | 32 GB DDR5 |
| Storage | 1 TB NVMe SSD |
| OS | Talos Linux v1.13.2 |
| Kernel | 6.18.29-talos (amd64) |
| K8s | v1.36.0 (control-plane + worker) |
| Container runtime | containerd v2.2.3 |
| Role | Single-node Kubernetes cluster |

### GPU Node (Planned — 192.168.1.101)
| Spec | Value |
|------|-------|
| GPU | NVIDIA RTX 4070 |
| Status | Planned — reinstalling with Ubuntu 26.04 |
| Future role | GPU workloads, AI inference, vCluster guest |

### Router (192.168.1.1)
| Spec | Value |
|------|-------|
| Model | AT&T BGW320-500 |
| Ports | 1× 5 GbE + 3× 1 GbE LAN |
| ISP | AT&T Fiber |
| Subnet | 192.168.1.0/24 |

---

## 2. Network

### IP Allocation
| Address | Assigned to |
|---------|-------------|
| 192.168.1.1 | Router (AT&T BGW320) |
| 192.168.1.10 | M2 Node (Talos) |
| 192.168.1.11 | Jellyfin LoadBalancer |
| 192.168.1.12 | Actual Budget LoadBalancer |
| 192.168.1.13 | Grafana LoadBalancer |
| 192.168.1.14 | ArgoCD LoadBalancer |
| 192.168.1.15 | APITable LoadBalancer |
| 192.168.1.16 | Home Assistant LoadBalancer |
| 192.168.1.20 | oCIS LoadBalancer |
| 192.168.1.21 | nginx-ingress (HTTPS gateway, all *.homelab) |
| 192.168.1.22 | CoreDNS (homelab zone authoritative DNS) |
| 192.168.1.30 | Tailscale k8s operator |
| 192.168.1.101 | GPU Node (planned) |
| 192.168.1.11–30 | MetalLB IP pool |

### DNS Setup (Split DNS)
- **LAN DNS server**: `192.168.1.22` (CoreDNS in homelab-dns namespace)
- **Wildcard**: All `*.homelab` → `192.168.1.21` (nginx-ingress)
- **Tailscale**: Custom nameserver `192.168.1.22`, restrict to domain `homelab`
  - Setup: Tailscale Admin Console → Settings → DNS → Custom Nameservers
- **Router DNS**: Point AT&T BGW320 custom DNS to `192.168.1.22`

### Service Domain Map
| Domain | Service | Port | Notes |
|--------|---------|------|-------|
| `jellyfin.homelab` | Jellyfin | 8096 | HTTP proxy |
| `grafana.homelab` | Grafana | 80 | HTTP proxy |
| `prometheus.homelab` | Prometheus | 9090 | HTTP proxy |
| `prom.homelab` | Prometheus (alias) | 9090 | Short alias |
| `alertmanager.homelab` | Alertmanager | 9093 | HTTP proxy |
| `longhorn.homelab` | Longhorn UI | 80 | HTTP proxy |
| `minio.homelab` | MinIO Console | 9001 | HTTP proxy |
| `argocd.homelab` | ArgoCD | 80 | HTTP proxy |
| `apitable.homelab` | APITable | 80 | HTTP proxy |
| `budget.homelab` | Actual Budget | 5006 | HTTPS proxy |
| `actual-budget.homelab` | Actual Budget | 5006 | Alias |
| `ocis.homelab` | ownCloud Infinite Scale | 9200 | HTTPS proxy |
| `ha.homelab` | Home Assistant | 8123 | HTTP proxy |
| `zigbee.homelab` | Zigbee2MQTT | 8080 | HTTP proxy |
| `m2.homelab` | M2 Node (direct) | — | A record → 192.168.1.10 |
| `node.homelab` | M2 Node (alias) | — | A record → 192.168.1.10 |
| `gpu.homelab` | GPU Node (planned) | — | A record → 192.168.1.101 |
| `router.homelab` | AT&T BGW320 | — | A record → 192.168.1.1 |

---

## 3. Kubernetes Cluster

### Cluster Info
- **Distribution**: Talos Linux (immutable, API-driven OS)
- **Version**: Kubernetes v1.36.0
- **Topology**: Single node — control-plane + worker on M2
- **CNI**: Cilium v1.19.4 (eBPF networking, no kube-proxy)
- **Ingress**: nginx-ingress v1.12.1 (LoadBalancer on 192.168.1.21)
- **Load Balancer**: MetalLB (L2 mode, pool 192.168.1.11–30) via Cilium LB-IPAM
- **Storage**: Longhorn v1.11.2 (distributed block storage over NVMe)
- **Certificates**: cert-manager (homelab-ca, ECDSA P-256 self-signed CA)
- **GitOps**: ArgoCD v3.4.2 (app-of-apps pattern)
- **VPN**: Tailscale v1.82.5 (k8s operator)

### ArgoCD App-of-Apps
| App | Sync | Health | Image Version |
|-----|------|--------|---------------|
| actual-budget-prod | Synced | Healthy | actual-server:26.5.2 |
| apitable-prod | Synced | Progressing | mysql:8.0.32, redis:7.0.8 |
| backup-stack | Synced | Healthy | minio:2024-12-18, rclone:1.74.2 |
| home-assistant | Synced | Healthy | HA:2026.5.4, zigbee2mqtt:2.10.1 |
| homelab-bootstrap | Synced | Healthy | — |
| homelab-dns | Synced | Healthy | coredns:1.12.1 |
| homelab-ingress | Synced | Healthy | — |
| jellyfin-prod | Synced | Progressing | jellyfin:10.10.7 |
| loki-logging | Synced | Healthy | loki:3.6.7 |
| nginx-ingress | Synced | Healthy | ingress-nginx:v1.12.1 |
| ocis | Synced | Healthy | ocis:8.0.4 |
| prometheus-monitoring | **OutOfSync** | Healthy | prometheus:v3.11.3, grafana:13.0.1 |
| simplefin-exporter | Synced | Healthy | python:3.11-slim |
| tailscale | Synced | Healthy | k8s-operator:v1.82.5 |

> **Note**: `prometheus-monitoring` is OutOfSync because `enableAdminAPI: true` was just added to helm-values.yaml. Sync it from ArgoCD to enable TSDB snapshots.

---

## 4. Storage (Longhorn PVCs)

All storage on single 1TB NVMe via Longhorn. 200% overprovisioning enabled.

### Current Volumes
| Namespace | PVC | Provisioned | Used | Next-install Size |
|-----------|-----|-------------|------|-------------------|
| actual-budget | actual-budget-data | 5 Gi | ~13 MB | **2 Gi** |
| apitable | apitable-mysql-data | 20 Gi | ~214 MB | **5 Gi** |
| apitable | apitable-minio-data | 20 Gi | ~0 | **5 Gi** |
| backup | minio-data | 20 Gi | ~184 KB | **5 Gi** |
| home-assistant | home-assistant-config | 5 Gi | low | **2 Gi** |
| home-assistant | mosquitto-data | 1 Gi | low | 1 Gi |
| home-assistant | zigbee2mqtt-data | 1 Gi | low | 1 Gi |
| jellyfin | jellyfin-config | 5 Gi | low | **2 Gi** |
| jellyfin | jellyfin-media | 100 Gi | growing | **Keep** |
| monitoring | prometheus-grafana | 10 Gi | ~58 MB | **3 Gi** |
| monitoring | prometheus-db | 100 Gi | ~minimal | **30 Gi** |
| monitoring | storage-loki-0 | 20 Gi | ~minimal | **10 Gi** |
| ocis | ocis-config | 1 Gi | ~0 | 1 Gi |
| ocis | ocis-data | 200 Gi | ~3 MB | **Keep 200 Gi** |

> **Critical**: Longhorn cannot shrink volumes. Resize-down requires a fresh cluster install.
> Apply the "Next-install Size" values in manifests before cluster rebuild.

### Backup Schedule
- **Daily Longhorn snapshots**: `snapshot-daily` CronJob (verified running)
- **Google Drive backup**: rclone via `backup-stack` (daily cron, running)
- **Prometheus TSDB backup**: NOT yet done — requires enabling admin API (OutOfSync app above)

---

## 5. Services

### Applications
| Service | URL | Version | Notes |
|---------|-----|---------|-------|
| Jellyfin | https://jellyfin.homelab | 10.10.7 | Media server |
| Actual Budget | https://budget.homelab | 26.5.2 | Personal finance |
| oCIS | https://ocis.homelab | 8.0.4 | Self-hosted cloud (200 Gi) |
| APITable | https://apitable.homelab | latest | Airtable alternative |
| Home Assistant | https://ha.homelab | 2026.5.4 | Smart home automation |
| Zigbee2MQTT | https://zigbee.homelab | 2.10.1 | Zigbee gateway (Sonoff ZBDongle-E) |
| Mosquitto | mqtt://m2.homelab:1883 | 2.0.21 | MQTT broker (no HTTP UI) |

### Monitoring
| Service | URL | Version | Notes |
|---------|-----|---------|-------|
| Grafana | https://grafana.homelab | 13.0.1 | Dashboards + SimpleFin |
| Prometheus | https://prometheus.homelab | v3.11.3 | 30d retention, 50GB max |
| Alertmanager | https://alertmanager.homelab | v0.32.1 | Alerts |
| Loki | via Grafana Explore | 3.6.7 | Log aggregation (API-only) |

### Infrastructure
| Service | URL | Version | Notes |
|---------|-----|---------|-------|
| ArgoCD | https://argocd.homelab | v3.4.2 | GitOps |
| Longhorn | https://longhorn.homelab | v1.11.2 | Storage UI |
| MinIO | https://minio.homelab | 2024-12-18 | S3 object storage console |
| nginx-ingress | 192.168.1.21:443 | v1.12.1 | HTTPS gateway |
| CoreDNS (homelab) | 192.168.1.22:53 | 1.12.1 | *.homelab authoritative |
| cert-manager | (no UI) | v1.x | TLS certificates |
| Tailscale | via tailscale.com | v1.82.5 | Zero-trust VPN |

### Financial Tracking (SimpleFin)
- SimpleFin exporter runs as a CronJob in monitoring namespace
- Syncs transactions to Prometheus every 30 min
- Grafana dashboard: `simplefin-improved-dashboard.json`

---

## 6. vCluster Setup

Three virtual clusters for workload isolation:
- `vc-dev` — development workloads
- `vc-prod` — production mirror workloads (Jellyfin, APITable)
- `vc-staging` — staging/test

Each has its own 5 Gi data PVC. vCluster uses `longhorn` storage class.

---

## 7. What's Outstanding

### Immediate
- [ ] **Sync prometheus-monitoring** in ArgoCD (admin API enabled → TSDB snapshot backup)
- [ ] **Configure router DNS** to `192.168.1.22` for LAN-wide *.homelab resolution
- [ ] **Test new domains**: `prometheus.homelab`, `longhorn.homelab`, `minio.homelab`, `alertmanager.homelab`

### Before M2 Reinstall
- [ ] Take Prometheus TSDB snapshot (after ArgoCD sync above)
- [ ] Export Grafana dashboards (or rely on ArgoCD to redeploy from git)
- [ ] Export Actual Budget data (File → Export in UI)
- [ ] Note down all ArgoCD app repo URLs (already in git)

### GPU Node (Ubuntu 26.04)
USB is flashed. Next steps:
1. Plug USB into GPU node, F12 → boot from USB
2. Install Ubuntu Server 26.04 (IP: 192.168.1.101, GW: 192.168.1.1, DNS: 192.168.1.22)
3. Install NVIDIA drivers: `ubuntu-drivers install nvidia:570`
4. Install Kubernetes via kubeadm or join as Talos worker
5. Add to `homelab-ingress` ArgoCD app
6. Update `gpu.homelab` DNS once online

---

## 8. Repo Structure

```
homelab/
├── app-of-apps/          # ArgoCD app-of-apps root
│   ├── prometheus-monitoring/
│   └── simplefin-exporter/
├── apps/                 # Per-app K8s manifests
│   ├── actual-budget/
│   ├── apitable/
│   ├── home-assistant/
│   ├── ocis/
│   └── simplefin/
├── dashboard/            # Next.js 3D homelab dashboard
│   └── app/
│       ├── components/Scene3D.tsx   # Three.js scene
│       ├── components/DetailPanel.tsx
│       ├── data.ts                  # Service/node data
│       └── api/cluster-status/     # Live K8s status API
├── infrastructure/       # Cluster infra manifests
│   ├── homelab-dns/      # CoreDNS *.homelab zone
│   ├── ingress/          # nginx-ingress resources
│   └── coredns-homelab.yaml
├── prometheus-monitoring/
│   └── helm-values.yaml  # kube-prometheus-stack config
└── simplefin-exporter/   # Custom Prometheus exporter
```

---

## 9. Common Commands

```bash
# Cluster status
kubectl get nodes -o wide
kubectl get pods -A | grep -v Running | grep -v Completed

# ArgoCD sync all
argocd app sync --all   # or use the UI at argocd.homelab

# Talos operations (no SSH — all via talosctl)
talosctl -n 192.168.1.10 health
talosctl -n 192.168.1.10 dmesg | tail
talosctl -n 192.168.1.10 dashboard

# Prometheus TSDB snapshot (after admin API enabled)
curl -X POST https://prometheus.homelab/api/v1/admin/tsdb/snapshot

# Longhorn volume list
kubectl get pvc -A

# Force ArgoCD sync
kubectl -n argocd exec deploy/argocd-server -- argocd app sync prometheus-monitoring
```

---

## 10. Security Notes

- All services use TLS via cert-manager (self-signed homelab CA)
- Tailscale provides zero-trust remote access
- Cilium provides network policy enforcement
- No public ports exposed (all behind AT&T NAT)
- ArgoCD, Prometheus, Longhorn, MinIO are LAN-only (homelab.local)
- Actual Budget uses HTTPS-only backend
