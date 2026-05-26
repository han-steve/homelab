# 🏠 Homelab

A production-grade Kubernetes homelab running on [Talos Linux](https://www.talos.dev/) with full GitOps via ArgoCD.

## Hardware

| Node | Role | CPU | RAM | Storage | Network |
|------|------|-----|-----|---------|---------|
| **Minisforum M2** | control-plane + worker | Intel Core Ultra 7 356H (16C) | 32 GB DDR5-4800 | 1 TB Crucial P3 Plus NVMe | 2× 2.5 GbE |
| **GPU Node** (pending) | worker | Intel i9-9900K (8C/16T) | 32 GB DDR4-3200 XMP | 1 TB Samsung 870 EVO | 1× 1 GbE |

Router: AT&T BGW320 (1× 5 GbE + 3× 1 GbE)

## Cluster Stack

| Layer | Component | Version |
|-------|-----------|---------|
| OS | [Talos Linux](https://www.talos.dev/) | v1.13.2 |
| Kubernetes | k8s | v1.36.0 |
| CNI + LB | [Cilium](https://cilium.io/) | v1.19.4 |
| Storage | [Longhorn](https://longhorn.io/) | v1.11.2 |
| GitOps | [ArgoCD](https://argo-cd.readthedocs.io/) | v3.4.2 |
| PKI | [cert-manager](https://cert-manager.io/) | v1.20.2 |
| VPN | [Tailscale Operator](https://tailscale.com/kb/1236/kubernetes-operator) | planned |

## Services

All services exposed via Cilium LB-IPAM on pool `192.168.1.11–20`:

| Service | IP | Description |
|---------|-----|-------------|
| [Jellyfin](https://jellyfin.org/) | `192.168.1.11` | Media server |
| [Actual Budget](https://actualbudget.org/) | `192.168.1.12` | Personal finance |
| [Grafana](https://grafana.com/) | `192.168.1.13` | Metrics + SimpleFIN dashboard |
| [ArgoCD](https://argo-cd.readthedocs.io/) | `192.168.1.14` | GitOps UI |
| [APITable](https://apitable.com/) | `192.168.1.15` | No-code database |

## Repository Layout

```
apps/                     # Application manifests (Actual Budget, APITable, etc.)
infrastructure/           # Core infrastructure (Cilium, cert-manager, Longhorn, ArgoCD, Tailscale)
talos/                    # Talos machine configs (schematics + patches; secrets are gitignored)
prometheus-monitoring/    # kube-prometheus-stack Helm chart + values
simplefin-exporter/       # Custom SimpleFIN → Prometheus exporter + Grafana dashboard
docs/                     # Documentation, HTML dashboard, topology diagram
```

## GitOps Workflow

All cluster changes go through git:

1. Edit YAML in this repo
2. Commit + push to `master`
3. ArgoCD auto-syncs within ~3 minutes

No `kubectl apply` or `helm install` for managed resources.

## PKI

Self-signed CA chain managed by cert-manager:

```
homelab-root-ca  (ECDSA P-256, 10 years, self-signed)
    └── homelab-ca  (ClusterIssuer — issues all service certs)
            └── *.homelab  (1 year, auto-renewed by cert-manager)
```

See [docs/PKI.md](docs/PKI.md) for trust installation instructions.

## Docs

- [Networking](docs/NETWORKING.md) — Cilium LB-IPAM, AT&T BGW320, Tailscale architecture
- [Cluster Dashboard](docs/cluster-dashboard.html) — hardware specs, benchmarks, service health
- [Interactive Topology](docs/topology.html) — visual cluster topology (D3.js, zoomable)
- [PKI Setup](docs/PKI.md) — certificate authority chain
- [GPU Node Setup](docs/GPU-NODE-SETUP.md) — Talos migration guide for the GPU worker
- [Split-DNS](docs/SPLIT-DNS.md) — DNS configuration for local + VPN access
- [Stress Test](docs/STRESS-TEST.md) — CPU/RAM benchmark methodology

## Setup Notes

### Prerequisites

- `talosctl` and `kubectl` on your workstation
- 1Password CLI (for secrets)
- ArgoCD CLI (optional)

### Secrets

Secrets are **never stored in git**. The following live in 1Password:

- `talos/secrets.yaml` — cluster bootstrap secrets
- `talos/controlplane.yaml` + `talos/worker-gpu.yaml` — machine configs with tokens
- `talos/talosconfig` — talosctl access config
- Tailscale OAuth client credentials

### Tailscale VPN Access

After deploying the Tailscale operator (`infrastructure/tailscale-operator/`):

```bash
# Create OAuth secret first (from https://login.tailscale.com/admin/settings/oauth)
kubectl create namespace tailscale
kubectl create secret generic operator-oauth \
  --namespace tailscale \
  --from-literal=client_id='<id>' \
  --from-literal=client_secret='<secret>'

# Then apply the ArgoCD app
kubectl apply -f infrastructure/tailscale-operator/argocd-app.yaml
```

For direct peer-to-peer (no DERP relay): forward UDP 41641 on AT&T BGW320 to `192.168.1.10`. See [infrastructure/tailscale-operator/values.yaml](infrastructure/tailscale-operator/values.yaml) for full setup steps.

## Benchmarks (Minisforum M2, sysbench 1.0.20)

| Metric | Result | Notes |
|--------|--------|-------|
| CPU (16T, 60s prime) | 73,462 ev/s | avg latency 0.22ms |
| RAM throughput | 9,593 MiB/s | Single-channel DDR5; add 2nd SO-DIMM for ~2× |

## vClusters

Three virtual clusters for environment isolation:

| vCluster | Namespace | Purpose |
|----------|-----------|---------|
| vc-prod | vc-prod | Production workloads |
| vc-staging | vc-staging | Staging environment |
| vc-dev | vc-dev | Development |

All registered as ArgoCD clusters for environment-specific GitOps deployments.
