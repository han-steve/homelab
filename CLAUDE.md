# CLAUDE.md — Homelab Repository Guide

## Overview

Single-node Kubernetes homelab on Talos Linux. Everything deployed via ArgoCD GitOps.

## Architecture

- **Node**: Apple M2 Mac Mini, 24GB RAM, 1TB NVMe
- **OS**: Talos Linux v1.13.2 (immutable, no SSH — use `talosctl`)
- **Kubernetes**: v1.36.0
- **CNI**: Cilium v1.19.4 with LB-IPAM (192.168.1.11–30)
- **Storage**: Longhorn (1 replica, 200% overprovisioning)
- **GitOps**: ArgoCD v3.4.2 with app-of-apps pattern

## Key Commands

```bash
# Cluster access
talosctl -n 192.168.1.10 dashboard
kubectl get pods -A

# ArgoCD
kubectl patch application <name> -n argocd --type merge \
  -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"hard"}}}'

# Dashboard dev
cd dashboard && npm run dev
```

## Repository Structure

```
app-of-apps/          # ArgoCD Application manifests (auto-discovered recursively)
apps/                 # Application deployments (actual-budget, ocis, etc.)
infrastructure/       # Infrastructure components (argocd, loki, longhorn, etc.)
simplefin-exporter/   # SimpleFIN financial data exporter
prometheus-monitoring/ # kube-prometheus-stack with local helm chart
dashboard/            # 3D Next.js homelab dashboard
docs/                 # Design docs and operational guides
talos/                # Talos config (secrets gitignored, patches committed)
```

## Conventions

- **Namespaces**: One per app (actual-budget, ocis, monitoring, argocd, etc.)
- **Storage**: All PVCs use `longhorn` StorageClass, ReadWriteOnce, 1 replica
- **Secrets**: Use K8s Secrets with `stringData`. Keep passwords unique per service.
- **Images**: Pin to specific version tags, never use `:latest`
- **ArgoCD apps**: Place in `app-of-apps/<name>/base/<name>.yaml`
- **App manifests**: Place in `apps/<name>/base/` with kustomization.yaml

## Service Map

| Service | IP | Port | Namespace |
|---------|-----|------|-----------|
| Jellyfin | 192.168.1.11 | 8096 | jellyfin |
| Actual Budget | 192.168.1.12 | 5006 | actual-budget |
| Grafana | 192.168.1.13 | 80 | monitoring |
| ArgoCD | 192.168.1.14 | 80 | argocd |
| APITable | 192.168.1.15 | 80 | apitable |
| oCIS | 192.168.1.20 | 9200 | ocis |

## Security Notes

- Talos secrets (talos/secrets.yaml, talosconfig) are gitignored and NEVER committed
- Grafana password: set in helm-values.yaml (homelab2026)
- oCIS password: set in apps/ocis/base/secret.yaml (unique generated)
- MinIO credentials: in infrastructure/restic/minio.yaml (unique generated)
- No external ingress — all services LAN-only via Cilium LB-IPAM

## Known Issues

- SimpleFIN exporter needs a fresh setup token (old one expired/consumed)
- APITable is degraded (gateway CrashLoopBackOff)
- Grafana 13.0.1+security-01 had auth issues — fixed by setting password via API
