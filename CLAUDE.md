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
- **VPN**: Tailscale operator (requires OAuth secret deployment)

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

# SimpleFIN manual job
kubectl create job --from=cronjob/simplefin-exporter simplefin-manual -n monitoring
```

## Repository Structure

```
app-of-apps/          # ArgoCD Application manifests (auto-discovered recursively)
apps/                 # Application deployments (actual-budget, ocis, apitable, etc.)
infrastructure/       # Infrastructure components (argocd, loki, longhorn, tailscale, restic, etc.)
simplefin-exporter/   # SimpleFIN financial data exporter (29 accounts, $1.32M net worth)
prometheus-monitoring/ # kube-prometheus-stack with local helm chart
dashboard/            # 3D Next.js homelab dashboard (React Three Fiber)
docs/                 # Design docs and operational guides
talos/                # Talos config (secrets gitignored, patches committed)
```

## Conventions

- **Namespaces**: One per app (actual-budget, ocis, monitoring, argocd, etc.)
- **Storage**: All PVCs use `longhorn` StorageClass, ReadWriteOnce, 1 replica
- **Secrets**: All secrets use `PLACEHOLDER_DEPLOY_MANUALLY` in git. Deploy real values via kubectl.
- **Images**: Pin to specific version tags, never use `:latest`
- **ArgoCD apps**: Place in `app-of-apps/<name>/base/<name>.yaml`
- **App manifests**: Place in `apps/<name>/base/` with kustomization.yaml
- **Secret management**: ArgoCD `ignoreDifferences` on Secret data fields + `RespectIgnoreDifferences=true`

## Service Map

| Service | IP | Port | Namespace | Status |
|---------|-----|------|-----------|--------|
| Jellyfin | 192.168.1.11 | 8096 | jellyfin | Running |
| Actual Budget | 192.168.1.12 | 5006 (HTTPS) | actual-budget | Running |
| Grafana | 192.168.1.13 | 80 | monitoring | Running |
| ArgoCD | 192.168.1.14 | 80 | argocd | Running |
| APITable | 192.168.1.15 | 80 | apitable | Running |
| oCIS | 192.168.1.20 | 9200 (HTTPS) | ocis | Running |

## Security Notes

- Talos secrets (talos/secrets.yaml, talosconfig) are gitignored and NEVER committed
- All service passwords use placeholders in git — deploy real secrets manually via kubectl
- Grafana, oCIS, MinIO, Restic, APITable, Tailscale secrets all require manual deployment
- No external ingress — all services LAN-only via Cilium LB-IPAM
- SimpleFIN access URL stored in K8s secret, not in git (key exchange is one-time)

## Known Issues

- APITable needs first-time admin registration at http://192.168.1.15/login
- Actual Budget uses self-signed TLS cert (browser warns, curl -sk works)
- Tailscale operator requires manual OAuth credential deployment before it will start
- SimpleFIN CronJob runs daily at 6AM; metrics available for 5-minute scrape window
