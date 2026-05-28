# CLAUDE.md — Homelab Repository Guide

## Agent Behavior

**Work continuously.** Pricing is per request, so maximize work per session.
- Before stopping, check TASKS.md for remaining work. If tasks remain, keep going.
- Write new discoveries, issues, and todos into TASKS.md as you find them.
- Do tasks one at a time. No need to multitask — just work as much as possible.
- Always run browser tests after making changes. Use screenshot tool to verify UX.
- If you think you're done, think of 10 more things to improve and do them.
- Never stop unless TASKS.md is empty and all services pass browser testing.

## Investigation Standard

Reach ≥90% confidence before concluding any fact.
- Do NOT guess hardware specs, K8s versions, IP addresses, or config values.
- If <90% confident, keep digging: read files, run commands, check docs.
- Always state confidence level for technical conclusions.

## Always Research First

Before claiming anything about hardware, Kubernetes/Talos/Cilium/ArgoCD APIs,
AT&T BGW320 capabilities, networking, or Tailscale — look it up.
Read the actual file, run the command, or check official docs.
NEVER assume from memory.

## Overview

Single-node Kubernetes homelab on Talos Linux. Everything deployed via ArgoCD GitOps.

## Architecture

- **Node**: Minisforum M2 at 192.168.1.10
  - Intel Core Ultra 7 356H (16 cores)
  - 32 GB DDR5-4800 single-channel (1x SO-DIMM)
  - 2x 2.5 GbE NICs (enp44s0 used for LB-IPAM)
  - 1TB NVMe
- **OS**: Talos Linux v1.13.2 (immutable, no SSH — use `talosctl`)
- **Kubernetes**: v1.36.0
- **CNI**: Cilium v1.19.4 with LB-IPAM (192.168.1.11–30)
- **Storage**: Longhorn v1.11.2 (1 replica, 200% overprovisioning)
- **GitOps**: ArgoCD v3.4.2 with app-of-apps pattern
- **Cert**: cert-manager v1.20.2 (homelab-ca ClusterIssuer, ECDSA P-256)
- **Ingress**: nginx-ingress at 192.168.1.21 (TLS termination for all services)
- **DNS**: CoreDNS homelab DNS at 192.168.1.22 (serves *.homelab zone)
- **VPN**: Tailscale operator (requires OAuth secret deployment)
- **vClusters**: vc-prod, vc-dev, vc-staging

## GPU Node (Planned)

- **IP**: 192.168.1.101, currently Debian 12, pending Talos
- ASUS PRIME Z390-P (NOT Z390-A — verify before writing)
- Intel i9-9900K (8C/16T, 5.0 GHz boost)
- 2x 16 GB Team Group DDR4 @ XMP 3200MHz (dual-channel)
- NVIDIA RTX 3080 Ti (GA102, 12 GB GDDR6X)
- NIC: Intel I219-V = 1 GbE ONLY (bottleneck for M2↔GPU transfers)

## Network Topology

```
AT&T BGW320 (192.168.1.1, 1x 5 GbE + 3x 1 GbE LAN ports)
    |
Minisforum M2 (192.168.1.10) — 2x 2.5 GbE
    ├── Cilium LB-IPAM pool: 192.168.1.11-30
    ├── nginx-ingress: 192.168.1.21
    └── homelab-dns: 192.168.1.22
    |
GPU Node (192.168.1.101) — 1 GbE
```

- LACP bonding M2's two 2.5 GbE ports = up to 5 Gbps aggregate (not single-stream)
- Tailscale direct: forward UDP 41641 → 192.168.1.10 on BGW320

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
CLAUDE.md              # This file — agent rules + cluster reference (merged from .cursorrules)
TASKS.md               # Persistent task tracker — check before stopping
app-of-apps/           # ArgoCD Application manifests (auto-discovered recursively)
apps/                  # Application deployments (actual-budget, ocis, apitable, etc.)
infrastructure/        # Infrastructure (argocd, loki, longhorn, tailscale, nginx-ingress, dns, etc.)
simplefin-exporter/    # SimpleFIN financial data exporter (29 accounts, $1.32M net worth)
prometheus-monitoring/ # kube-prometheus-stack with local helm chart
dashboard/             # 3D Next.js homelab dashboard (React Three Fiber)
docs/                  # Design docs and operational guides
talos/                 # Talos config (secrets gitignored, patches committed)
```

## Conventions

- **Namespaces**: One per app (actual-budget, ocis, monitoring, argocd, etc.)
- **Storage**: All PVCs use `longhorn` StorageClass, ReadWriteOnce, 1 replica
- **Secrets**: All secrets use `PLACEHOLDER_DEPLOY_MANUALLY` in git. Deploy real values via kubectl.
- **Images**: Pin to specific version tags, never use `:latest`
- **ArgoCD apps**: Place in `app-of-apps/<name>/base/<name>.yaml`
- **App manifests**: Place in `apps/<name>/base/` with kustomization.yaml
- **Secret management**: ArgoCD `ignoreDifferences` on Secret data fields + `RespectIgnoreDifferences=true`
- **YAML**: 2-space indentation. Validate with `kubectl --dry-run=client` when possible.
- **Kustomize**: Always include `kustomization.yaml` with resources listed.
- **Helm values**: Comments explaining each section.
- **app-of-apps/**: ArgoCD Application CRDs only. ArgoCD scans recursively (directory.recurse: true).

## GitOps Workflow

All changes go through git:
1. Edit YAML files in this repo
2. Commit + push to `master`
3. ArgoCD detects and syncs automatically

**DO NOT** run `helm install` / `helm upgrade` or `kubectl apply` for ArgoCD-managed resources.
Exception: one-off operations like creating secrets (which must NOT go in git).

## Commit Messages

```
<type>: <short description>
```
Types: `feat`, `fix`, `chore`, `docs`, `security`, `infra`

## Service Map

| Service | IP | Port | Namespace | Domain | Status |
|---------|-----|------|-----------|--------|--------|
| Jellyfin | 192.168.1.11 | 8096 | jellyfin | jellyfin.homelab | Running |
| Actual Budget | 192.168.1.12 | 5006 (HTTPS) | actual-budget | budget.homelab | Running |
| Grafana | 192.168.1.13 | 80 | monitoring | grafana.homelab | Running |
| ArgoCD | 192.168.1.14 | 80 | argocd | argocd.homelab | Running |
| APITable | 192.168.1.15 | 80 | apitable | apitable.homelab | Running |
| oCIS | 192.168.1.20 | 9200 (HTTPS) | ocis | ocis.homelab | Running |
| nginx-ingress | 192.168.1.21 | 80/443 | ingress-nginx | *.homelab | Running |
| homelab-dns | 192.168.1.22 | 53 | homelab-dns | — | Running |

## Security Notes

- Talos secrets (talos/secrets.yaml, talosconfig) are gitignored and NEVER committed
- All service passwords use placeholders in git — deploy real secrets manually via kubectl
- Grafana, oCIS, MinIO, Restic, APITable, Tailscale secrets all require manual deployment
- Services accessible via LAN (Cilium LB-IPAM) and nginx-ingress (192.168.1.21)
- SimpleFIN access URL stored in K8s secret, not in git (key exchange is one-time)
- Never commit: `talos/secrets.yaml`, `talos/controlplane.yaml`, `talos/worker*.yaml`, `talos/talosconfig`, any K8s Secret with real credentials, OAuth tokens, API keys, passwords

## When Stuck

1. Read the relevant file: `read_file`, `grep_search`, `semantic_search`
2. Check cluster state: `kubectl get` / `talosctl get`
3. Check ArgoCD: `kubectl get application -n argocd`
4. Check docs: official Talos, Cilium, ArgoCD, cert-manager docs
5. If stuck after 3 attempts, tell the user what's blocking

## Known Issues

- APITable needs first-time admin registration at http://192.168.1.15/login
- Actual Budget uses self-signed TLS cert (browser warns, curl -sk works)
- Tailscale operator requires manual OAuth credential deployment before it will start
- SimpleFIN CronJob runs daily at 6AM; metrics available for 5-minute scrape window
- Grafana password: set via `kubectl patch secret prometheus-grafana -n monitoring` (ArgoCD ignores Secret data)
- SSH public key still in git history (commit d6329c4)
- Tailscale free plan: 100 devices, 3 users (all features included)
