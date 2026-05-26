# Homelab — Architecture & Design

> This document describes the **target architecture**. For the current migration
> from the old Intel NUC, see [MIGRATION.md](MIGRATION.md).
>
> Last updated: May 2026

## Vision

A fully declarative, GitOps-managed Kubernetes homelab on **Talos Linux** — no
SSH into nodes, no imperative config, everything reproduced from git. Secrets
managed through 1Password so nothing sensitive ever touches the repo. Remote
access via Tailscale instead of WireGuard.

---

## Hardware

| Node | Machine | CPU | RAM | Role |
|------|---------|-----|-----|------|
| **m2** | Minisforum EliteMini M2 | Core Ultra 7 356H (16c, Panther Lake) | 32–64GB DDR5 SO-DIMM *(must buy — DDR4 incompatible)* | Control plane + worker |
| **gpu** | ASUS Z390-A | i9-9900K (8c/16t, 5GHz) | 32GB DDR4 | Worker — GPU, media, downloads |

**GPU node storage:** Samsung 870 EVO 1TB (Talos boot), Crucial P3 NVMe 1TB (workloads/Longhorn), 1.9TB SATA M.2 in M.2\_1 slot (media library), 953.9GB SATA M.2 via SATA adapter (overflow).

**Power (SF, PG&E ~$0.40/kWh):** M2 ~$4/mo · GPU node idle ~$32/mo · both always on ~$36/mo · GPU on-demand only ~$4/mo.

---

## OS: Talos Linux

**Why Talos over Debian + K3s:**
- Immutable read-only OS — no SSH, no shell, no package manager
- Everything is an API call (`talosctl`) — fully scriptable, zero snowflakes
- Designed exclusively for Kubernetes; upgrades are atomic with rollback
- Machine configs live in git → cluster fully reproducible from scratch

```
talos/
├── controlplane.yaml     # M2 config
├── worker-gpu.yaml       # GPU node config (NVIDIA extension, disk mounts)
└── patches/
    ├── longhorn.yaml
    └── nvidia.yaml
```

**Bootstrap:**
```bash
talosctl gen config homelab https://192.168.1.200:6443 \
  --output talos/ \
  --config-patch-control-plane @talos/patches/controlplane.yaml

talosctl apply-config --insecure --nodes 192.168.1.200 --file talos/controlplane.yaml
talosctl apply-config --insecure --nodes 192.168.1.101 --file talos/worker-gpu.yaml
talosctl bootstrap --nodes 192.168.1.200
talosctl kubeconfig --nodes 192.168.1.200
```

---

## Networking: Tailscale (replacing WireGuard)

**Why replace WireGuard:** Zero port-forwarding, no key management, works behind CGNAT, built-in HTTPS with valid certs via Funnel.

### Tailscale Operator
```bash
helm repo add tailscale https://pkgs.tailscale.com/helmcharts
helm install tailscale-operator tailscale/tailscale-operator \
  --namespace tailscale \
  --set oauth.clientId=<from-1password> \
  --set oauth.clientSecret=<from-1password>
```

### Per-service exposure
```yaml
metadata:
  annotations:
    tailscale.com/expose: "true"
    tailscale.com/hostname: "actual-budget"   # → actual-budget.tailXXXX.ts.net
    tailscale.com/funnel: "true"              # public HTTPS, no exposed IP
```

### Subnet router
Announces `192.168.1.0/24` to the tailnet — full LAN access from any Tailscale device without per-service config.

### Internal
- **CNI**: Flannel (default) or Cilium (recommended — eBPF, NetworkPolicy, per-pod metrics)
- **MetalLB**: LoadBalancer IPs 192.168.1.11–20 for local access
- **cert-manager**: Let's Encrypt TLS or Tailscale-provided certs

---

## Storage: Longhorn

**Why Longhorn over Ceph:** Ceph requires 3+ nodes for proper HA. Longhorn handles 2-node replication well with a simple Helm install, web UI, and built-in S3 backup. Revisit Ceph if a third node is added.

### Storage classes

| Class | Replicas | Use for |
|-------|----------|---------|
| `longhorn` | 2 | App configs, databases, anything stateful |
| `longhorn-single` | 1 (local-only) | Cache, scratch, large read-only data |

### Media storage
Jellyfin's media library (219GB+) lives on the GPU node's 1.9TB SATA M.2, exposed as a **hostPath PersistentVolume** pinned to the GPU node via nodeAffinity. Replication would be wasteful for re-downloadable media.

```yaml
# talos/worker-gpu.yaml — mount the media disk
machine:
  disks:
    - device: /dev/sdb        # 1.9TB SATA M.2
      partitions:
        - mountpoint: /var/mnt/media
```

### Backup
Longhorn volume snapshots → S3-compatible backend (Backblaze B2 ~$0.006/GB/mo, or self-hosted MinIO on GPU NVMe).

---

## Secrets: 1Password + External Secrets Operator

**Zero secrets in git — ever.**

```
1Password Vault "Homelab"
        ↓  1Password Connect Server (in-cluster, Longhorn PVC)
External Secrets Operator
        ↓  reconciles ExternalSecret CRDs
Kubernetes Secrets  →  Pods
```

**1Password vault items:** `SimpleFin`, `Actual Budget`, `PIA VPN`, `Tailscale OAuth`, `Grafana Admin`, `MySQL APITable`, `Longhorn S3 Backup`.

```yaml
# Pattern: ExternalSecret pulls from 1Password
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: simplefin-secret
  namespace: monitoring
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: onepassword
    kind: ClusterSecretStore
  target:
    name: simplefin-access-url
  data:
    - secretKey: access-url
      remoteRef:
        key: "Homelab/SimpleFin"
        property: access_url
```

---

## GitOps: ArgoCD + Kargo

### Repository layout
```
homelab/
├── talos/                        # Talos machine configs
├── infrastructure/
│   ├── longhorn/
│   ├── metallb/
│   ├── cert-manager/
│   ├── external-secrets/         # 1Password Connect + ESO
│   ├── tailscale-operator/
│   └── argocd/
├── apps/
│   ├── monitoring/               # kube-prometheus-stack + simplefin-exporter
│   ├── media/                    # Jellyfin
│   ├── finance/                  # Actual Budget
│   ├── downloads/                # QBitTorrent + Gluetun
│   └── apitable/                 # (parked)
├── app-of-apps/                  # ArgoCD App-of-Apps root (exists)
├── prometheus-monitoring/        # (existing Helm chart + values)
└── simplefin-exporter/           # (existing CronJob manifests)
```

### ArgoCD
Root `Application` in `app-of-apps/` bootstraps everything. Infrastructure auto-syncs; apps sync automatically after initial deployment approval.

### Kargo promotion pipeline
```
main branch push → Stage "dev" (auto, 5-min soak) → Stage "prod" (auto after soak)
```
Useful for: rolling Prometheus rule updates, testing service upgrades, verifying Jellyfin image changes before they affect playback.

---

## Services: Docker Compose → Kubernetes

### Translation pattern

| Compose | Kubernetes |
|---------|-----------|
| `image:` | `Deployment` container image |
| `volumes:` | `PVC` (Longhorn) or `hostPath PV` for media |
| `environment:` / `env_file:` | `ExternalSecret` → `envFrom: secretRef` |
| `ports:` | `Service` + Tailscale annotation |
| `restart: always` | Deployment `restartPolicy` + liveness probe |
| `healthcheck:` | `livenessProbe` / `readinessProbe` |

---

### Actual Budget

```yaml
# apps/finance/ — Deployment + PVC + Service
image: actualbudget/actual-server:latest
pvc: 5Gi longhorn (mountPath: /data)
service:
  annotations:
    tailscale.com/expose: "true"
    tailscale.com/hostname: "actual-budget"
    tailscale.com/funnel: "true"   # HTTPS from anywhere
```

Restore: `cp -r /mnt/backup/opt/actual/ → PVC /data`

---

### Jellyfin

```yaml
# apps/media/ — GPU node only
nodeSelector:
  kubernetes.io/hostname: gpu
resources:
  limits:
    nvidia.com/gpu: 1              # hardware transcoding
volumes:
  - name: config
    pvc: jellyfin-config (10Gi longhorn)
  - name: media
    pvc: jellyfin-media (hostPath /var/mnt/media, nodeAffinity: gpu)
service:
  annotations:
    tailscale.com/expose: "true"
    tailscale.com/hostname: "jellyfin"
```

Talos GPU worker requires: `nvidia` + `nvidia-container-toolkit` system extensions, `modules.load: [nvidia, nvidia_uvm, nvidia_drm]`.

Restore: config from `/mnt/backup/opt/jellyfin/` + `/mnt/backup/docker-named-volumes/jellyfin-config/` · media already on GPU node NVMe.

---

### SimpleFin Exporter *(already K8s-native)*

```bash
kubectl apply -k simplefin-exporter/base/
```

Migrate secret from in-cluster Secret → `ExternalSecret` pulling from 1Password.

---

### Prometheus + Grafana *(kube-prometheus-stack)*

Already in `prometheus-monitoring/`. Switch storage class to `longhorn`.

**Restoring financial TSDB history:**
```bash
# Copy Prometheus TSDB blocks from backup into the PVC
kubectl cp /mnt/backup/k8s-storage/prometheus/prometheus-db/ \
  monitoring/prometheus-0:/prometheus/
# Restart Prometheus — it auto-discovers blocks on startup
```
All `simplefin_*` history (3,598 series, back to cluster creation) preserved.

---

### QBitTorrent + Gluetun VPN sidecar

```yaml
# apps/downloads/ — GPU node, VPN sidecar
nodeSelector:
  kubernetes.io/hostname: gpu
containers:
  - name: gluetun                  # VPN — ALL pod traffic routes through it
    image: qmcgaw/gluetun
    securityContext:
      capabilities:
        add: [NET_ADMIN]
    envFrom:
      - secretRef:
          name: pia-vpn-secret     # from 1Password: username p3990820 + password
  - name: qbittorrent
    image: linuxserver/qbittorrent
    # shares network namespace with gluetun automatically
```

---

### Tailscale *(replacing WireGuard entirely)*

WireGuard Docker container → **removed**. Tailscale Operator handles all remote access. Existing WireGuard peer devices just install the Tailscale client — no key exchange needed.

---

### APITable *(parked)*

Complex 10-container stack. Redis AOF was corrupted and has been repaired. Data backed up (MySQL dump 6.6MB + MinIO). Skip for initial migration; revisit if needed. The patched backend image (`stevehan2001/backend-server-patched:0.4`) would need to be rebuilt for a newer APITable version.

---

## Deployment Order

1. **Talos** — install + bootstrap 2-node cluster
2. **Infrastructure** — Longhorn, MetalLB, cert-manager, External Secrets Operator
3. **1Password Connect** — one-time manual bootstrap with credentials file
4. **Tailscale Operator** — subnet router replaces WireGuard immediately
5. **ArgoCD + Kargo** — GitOps takes over; push everything else through the pipeline
6. **Monitoring** — kube-prometheus-stack + SimpleFin, restore Prometheus TSDB
7. **Actual Budget** — restore from backup (highest daily-use priority)
8. **Jellyfin** — restore config, media already on NVMe
9. **QBitTorrent** — restore config, wire up Gluetun
10. **Decommission NUC** — once all services verified healthy for 48h

---

## Open Questions / Future Work

- **Ceph**: Revisit when a third node is added (proper 3-replica OSD). Until then, Longhorn.
- **CNI**: Cilium recommended over Flannel for per-pod observability and NetworkPolicy enforcement.
- **GPU sharing**: `nvidia.com/gpu` time-slicing or MIG partitioning for Jellyfin + AI/ML coexistence.
- **APITable**: Rebuild patched backend, or replace with Nocodb / AppFlowy / another self-hosted tool.
- **Backup redundancy**: Add Longhorn → Backblaze B2 after initial setup stabilizes.
