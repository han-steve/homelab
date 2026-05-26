# Homelab — Architecture & Operations

> **Status**: Live cluster on Talos Linux v1.13.2 / Kubernetes v1.36.0  
> **Last updated**: May 2025

---

## Hardware

| Node | Machine | CPU | RAM | Storage | Role | IP |
|------|---------|-----|-----|---------|------|----|
| **m2** | Minisforum EliteMini M2 | Core Ultra 7 356H (16c) | DDR5 | 1TB NVMe (Crucial P3) | Control plane + worker | `192.168.1.10` |
| **gpu** | ASUS Z390-P | i9-9900K (8c/16t) | 32GB DDR4 | 1TB SSD boot + 1TB NVMe + 1.9TB SATA | Worker — GPU workloads | `192.168.1.101` (not yet joined) |

---

## Network Layout

```
┌─────────────────────────────────────────────────────────┐
│  AT&T Router / Gateway  192.168.1.254                   │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │ .10     │  │ .11-.20  │  │ .101                 │   │
│  │ m2 (CP) │  │ MetalLB  │  │ gpu (worker, OFF)    │   │
│  │         │  │ Pool     │  │                      │   │
│  └─────────┘  └──────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────┘

MetalLB Assignments:
  192.168.1.11 = Jellyfin (http://192.168.1.11:8096)
  192.168.1.12-20 = available
```

---

## Cluster Stack

```
┌──────────────────────────────────────────────────────────────┐
│  APPS                                                        │
│  ┌──────────┐  ┌────────┐  ┌────────┐  ┌────────┐           │
│  │ Jellyfin │  │vc-dev  │  │vc-stage│  │vc-prod │           │
│  │ :8096    │  │        │  │        │  │        │           │
│  └──────────┘  └────────┘  └────────┘  └────────┘           │
├──────────────────────────────────────────────────────────────┤
│  PLATFORM                                                    │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌───────────────┐  │
│  │ ArgoCD   │ │Prometheus│ │cert-mgr   │ │External       │  │
│  │          │ │+ Grafana │ │           │ │Secrets (ESO)  │  │
│  └──────────┘ └──────────┘ └───────────┘ └───────────────┘  │
├──────────────────────────────────────────────────────────────┤
│  INFRASTRUCTURE                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────────────┐ │
│  │ Cilium   │ │ MetalLB  │ │ Longhorn (default SC)        │ │
│  │ (CNI)    │ │ (L2 LB)  │ │ persistent volumes           │ │
│  └──────────┘ └──────────┘ └──────────────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│  OS: Talos Linux v1.13.2 (immutable, API-driven, no SSH)     │
│  Extensions: intel-ucode, iscsi-tools, util-linux-tools      │
│  Schematic: 36cd6536eaec8ba802be2d3897...                    │
└──────────────────────────────────────────────────────────────┘
```

---

## Deployed Components

### Infrastructure (Helm releases)

| Release | Namespace | Chart | Status |
|---------|-----------|-------|--------|
| cilium | kube-system | cilium/cilium | Running — kube-proxy replacement, Hubble UI |
| metallb | metallb-system | metallb/metallb | Running — L2 pool .11-.20 |
| longhorn | longhorn-system | longhorn/longhorn | Running — default StorageClass, Retain policy |
| cert-manager | cert-manager | jetstack/cert-manager | Running |
| external-secrets | external-secrets | external-secrets/external-secrets | Running |
| argocd | argocd | argo/argo-cd | Running — single replica, insecure mode |
| prometheus | monitoring | prometheus-community/kube-prometheus-stack | Running — 90d retention, Longhorn PVC |

### Apps

| App | Namespace | Image | Access | Status |
|-----|-----------|-------|--------|--------|
| Jellyfin | jellyfin | jellyfin/jellyfin:10.10.7 | `http://192.168.1.11:8096` | Running |
| vcluster dev | vc-dev | loft-sh/vcluster:0.34.0 | `vcluster connect dev -n vc-dev` | Running |
| vcluster staging | vc-staging | loft-sh/vcluster:0.34.0 | `vcluster connect staging -n vc-staging` | Running |
| vcluster prod | vc-prod | loft-sh/vcluster:0.34.0 | `vcluster connect prod -n vc-prod` | Running |

---

## Talos Configuration

```
talos/
├── secrets.yaml              # Generated, gitignored — CA keys + tokens
├── controlplane.yaml         # Generated from patches — gitignored
├── worker.yaml               # Generated — for future worker nodes
├── .m2-schematic-id          # 36cd6536...
└── patches/
    ├── controlplane.yaml     # PodSecurity, CNI: none, proxy: disabled, certSANs
    ├── all-nodes.yaml        # sysctls, NTP, KubePrism :7445, kubelet, labels
    └── m2-node.yaml          # Static IP .10, install disk, factory image w/ extensions
```

### Regenerate & Apply

```bash
# Regenerate config from patches
talosctl gen config homelab https://192.168.1.10:6443 \
  --with-secrets talos/secrets.yaml \
  --config-patch-control-plane @talos/patches/controlplane.yaml \
  --config-patch @talos/patches/all-nodes.yaml \
  --config-patch @talos/patches/m2-node.yaml \
  --output talos/ --force
sed -i '' 's/^auto: stable$/hostname: m2/' talos/controlplane.yaml

# Apply without reboot
talosctl apply-config --nodes 192.168.1.10 --file talos/controlplane.yaml

# Upgrade (installs extensions, reboots)
talosctl upgrade --nodes 192.168.1.10 \
  --image factory.talos.dev/installer/36cd6536eaec8ba802be2d38974108359069cedba8857302f69792b26b87c010:v1.13.2
kubectl uncordon m2  # after upgrade
```

---

## Quick Commands

```bash
# Cluster status
kubectl get nodes
kubectl get pods -A

# Grafana password
kubectl -n monitoring get secret prometheus-grafana -o jsonpath="{.data.admin-password}" | base64 -d

# ArgoCD password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# Port-forward Grafana
kubectl -n monitoring port-forward svc/prometheus-grafana 3000:80

# Port-forward ArgoCD
kubectl -n argocd port-forward svc/argocd-server 8080:443

# vcluster access
vcluster connect dev --namespace vc-dev
vcluster connect staging --namespace vc-staging
vcluster connect prod --namespace vc-prod

# Talos diagnostics
talosctl get extensions --nodes 192.168.1.10
talosctl dmesg --nodes 192.168.1.10
talosctl health --nodes 192.168.1.10
```

---

## Remaining Setup

### Needs User Credentials
1. **1Password Connect** — run `op` CLI to create connect server + token, then apply `infrastructure/external-secrets/1password-connect.yaml`
2. **Tailscale Operator** — needs OAuth clientId/clientSecret from [Tailscale admin](https://login.tailscale.com/admin/settings/oauth)
3. **SimpleFin Exporter** — needs image rebuild (source was on old server at `~/repos/simplefin-bridge-exporter-modified/`)

### Needs GPU Node
4. **GPU node join** — boot from Talos installer, apply worker config, join cluster
5. **Jellyfin GPU transcoding** — move to GPU node with `nvidia.com/gpu` resource + hostPath media
6. **QBitTorrent + Gluetun** — deploy on GPU node with PIA VPN sidecar

### Future
- Kargo promotion pipeline (dev → staging → prod)
- Longhorn backup to Backblaze B2
- Actual Budget deployment
- Ceph evaluation when 3rd node added
