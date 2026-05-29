# Cluster Restore Guide

This document covers full cluster restoration from scratch using:
1. **Git** (all configuration is in this repo)
2. **Google Drive** (all persistent data, backed up daily at 4 AM)
3. **1Password** (secrets: Talos machine config, API tokens, passwords)

> For hardware reference, node IPs, and architecture — see [CLAUDE.md](CLAUDE.md)

---

## Prerequisites (Before You Start)

Ensure you have on the restore workstation:

- [ ] `talosctl` installed (`brew install siderolabs/tap/talosctl`)
- [ ] `kubectl` installed (`brew install kubectl`)
- [ ] `rclone` installed and configured (`brew install rclone`)
- [ ] `git` with access to this repo (han-steve/homelab)
- [ ] Talos secrets from 1Password: `talos/secrets.yaml`, `talos/talosconfig`, `talos/controlplane.yaml`
- [ ] Talos v1.13.2 ISO flashed to USB (see step 1)
- [ ] rclone configured with google_drive remote (`~/.config/rclone/rclone.conf`)

---

## Phase 1: OS Installation (Talos Linux)

> See [talos/RECOVERY-STEPS.md](talos/RECOVERY-STEPS.md) for full details.
> This is a summary.

### 1.1 Flash Talos ISO to USB

```bash
# Get the ISO matching your schematic (M2 node)
# Schematic is in talos/schematic-m2.yaml — submit to factory.talos.dev
# Or use the base ISO:
curl -LO https://github.com/siderolabs/talos/releases/download/v1.13.2/metal-amd64.iso

# Flash to USB (replace /dev/diskN with your USB device)
diskutil list | grep "external"
sudo dd if=metal-amd64.iso of=/dev/rdiskN bs=4M status=progress
```

### 1.2 Boot M2 from USB

1. Plug USB into Minisforum M2
2. Power on, press **F7** for boot menu
3. Select USB drive
4. Wait for Talos maintenance mode screen

### 1.3 Apply Machine Config

```bash
# Find the temporary DHCP IP
arp -a | grep "84:47"
# Or check AT&T BGW320: http://192.168.254.254 → Device List

# Apply config (use actual DHCP IP):
talosctl apply-config \
  --nodes <DHCP_IP> \
  --endpoints <DHCP_IP> \
  --file talos/controlplane.yaml \
  --insecure
```

### 1.4 Bootstrap and Get kubeconfig

```bash
# Wait for install (~3 min), then bootstrap etcd (ONLY for fresh cluster!)
talosctl bootstrap --nodes 192.168.1.10

# Wait 2 minutes, then get kubeconfig
talosctl kubeconfig --nodes 192.168.1.10 --force ~/.kube/config

# Verify
kubectl get nodes
# Should show: m2   Ready   control-plane   ...
```

---

## Phase 2: Core Infrastructure

### 2.1 Install Cilium CNI (REQUIRED before ArgoCD)

```bash
# Cilium must be installed before any pods can communicate
# Check talos/bootstrap.sh for the exact helm command used
cat talos/bootstrap.sh

# Install with values from infrastructure/cilium/
helm repo add cilium https://helm.cilium.io/
helm upgrade --install cilium cilium/cilium \
  --version 1.19.4 \
  --namespace kube-system \
  -f infrastructure/cilium/values.yaml

# Verify Cilium
kubectl get pods -n kube-system | grep cilium
```

### 2.2 Install ArgoCD

```bash
kubectl create namespace argocd
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/v2.14.x/manifests/install.yaml

# Wait for ArgoCD to start
kubectl rollout status deployment argocd-server -n argocd

# Get initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d
```

### 2.3 Deploy App-of-Apps

```bash
# This single command triggers ArgoCD to sync ALL applications from git
kubectl apply -f - <<EOF
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app-of-apps
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/han-steve/homelab
    targetRevision: master
    path: app-of-apps
    directory:
      recurse: true
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
EOF
```

ArgoCD will now pull all app manifests from git and sync them automatically (~5-15 min).

```bash
# Watch sync progress
watch kubectl get applications -n argocd

# Force hard refresh if needed
for app in $(kubectl get applications -n argocd -o name); do
  kubectl patch $app -n argocd \
    -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"hard"}}}' \
    --type merge
done
```

---

## Phase 3: Secrets Deployment

> All secrets use `PLACEHOLDER_DEPLOY_MANUALLY` in git. Deploy real values after ArgoCD sync.

### 3.1 Longhorn (Storage — deploy FIRST)

Longhorn must be healthy before stateful apps start.

```bash
kubectl get pods -n longhorn-system | grep -v Running
# Wait until all Running
```

### 3.2 Critical Secrets

Deploy these secrets in order:

```bash
# --- cert-manager homelab CA ---
# Get from 1Password: homelab CA key + cert
kubectl create secret tls homelab-ca-secret \
  --cert=homelab-ca.crt --key=homelab-ca.key \
  -n cert-manager

# --- Grafana admin password ---
kubectl patch secret prometheus-grafana -n monitoring \
  -p '{"data":{"admin-password":"'"$(echo -n 'homelab2026' | base64)"'"}}'

# --- Tailscale operator OAuth ---
kubectl create secret generic tailscale-operator \
  -n tailscale \
  --from-literal=client_id=<FROM_1PASSWORD> \
  --from-literal=client_secret=<FROM_1PASSWORD>

# --- oCIS admin password ---
kubectl patch secret ocis-admin -n ocis \
  -p '{"data":{"password":"'"$(echo -n '<FROM_1PASSWORD>' | base64)"'"}}'

# --- SimpleFIN access URL ---
kubectl create secret generic simplefin-secret \
  -n monitoring \
  --from-literal=SIMPLEFIN_ACCESS_URL=<FROM_1PASSWORD>

# --- rclone Google Drive config (for backups) ---
kubectl create secret generic rclone-config \
  -n backup \
  --from-file=rclone.conf=$HOME/.config/rclone/rclone.conf

# --- MinIO (APITable object storage) ---
kubectl patch secret apitable-minio-secret -n apitable \
  -p '{"data":{"MINIO_ACCESS_KEY":"'"$(echo -n '<FROM_1PASSWORD>' | base64)"'","MINIO_SECRET_KEY":"'"$(echo -n '<FROM_1PASSWORD>' | base64)"'"}}'
```

### 3.3 Fix backup namespace PSA

The backup namespace requires `baseline` (not `restricted`) to allow the rclone/gdrive job:

```bash
kubectl label ns backup \
  pod-security.kubernetes.io/enforce=baseline \
  --overwrite
```

---

## Phase 4: Data Restoration from Google Drive

### 4.1 List Available Backups

```bash
rclone lsd google_drive:homelab-backups/
# Shows timestamps like: 2025-05-28_0400
```

### 4.2 Download Backup

```bash
BACKUP_DATE="2025-05-28_0400"  # Use the most recent date
mkdir -p /tmp/restore/$BACKUP_DATE

rclone copy \
  "google_drive:homelab-backups/$BACKUP_DATE/" \
  /tmp/restore/$BACKUP_DATE/ \
  --progress

ls /tmp/restore/$BACKUP_DATE/
# Expected files:
#   actual-budget.tar.gz
#   grafana.tar.gz
#   jellyfin-config.tar.gz
#   home-assistant.tar.gz
#   ocis-data.tar.gz
#   ocis-config.tar.gz
#   apitable-mysql.sql.gz
```

### 4.3 Restore Actual Budget

```bash
RESTORE=/tmp/restore/$BACKUP_DATE
POD=$(kubectl get pods -n actual-budget -l app=actual-budget -o jsonpath='{.items[0].metadata.name}')

# Scale down first to avoid data corruption
kubectl scale deployment actual-budget -n actual-budget --replicas=0

# Restore
kubectl exec -n actual-budget $POD -- rm -rf /data/*
cat $RESTORE/actual-budget.tar.gz | \
  kubectl exec -i -n actual-budget $POD -- tar xzf - -C /

# Scale back up
kubectl scale deployment actual-budget -n actual-budget --replicas=1
```

### 4.4 Restore Grafana Dashboards

```bash
POD=$(kubectl get pods -n monitoring -l app.kubernetes.io/name=grafana -o jsonpath='{.items[0].metadata.name}')

kubectl scale deployment prometheus-grafana -n monitoring --replicas=0
sleep 5

cat $RESTORE/grafana.tar.gz | \
  kubectl exec -i -n monitoring $POD -- tar xzf - -C /var/lib/
  
kubectl scale deployment prometheus-grafana -n monitoring --replicas=1
```

### 4.5 Restore Jellyfin Config

```bash
POD=$(kubectl get pods -n jellyfin -l app=jellyfin -o jsonpath='{.items[0].metadata.name}')

kubectl scale deployment jellyfin -n jellyfin --replicas=0
sleep 5

cat $RESTORE/jellyfin-config.tar.gz | \
  kubectl exec -i -n jellyfin $POD -- tar xzf - -C /

kubectl scale deployment jellyfin -n jellyfin --replicas=1
```

### 4.6 Restore Home Assistant

```bash
POD=$(kubectl get pods -n home-assistant -l app=home-assistant -o jsonpath='{.items[0].metadata.name}')

kubectl scale deployment home-assistant -n home-assistant --replicas=0
sleep 5

cat $RESTORE/home-assistant.tar.gz | \
  kubectl exec -i -n home-assistant $POD -- tar xzf - -C /

kubectl scale deployment home-assistant -n home-assistant --replicas=1
```

### 4.7 Restore oCIS (Cloud Storage)

```bash
POD=$(kubectl get pods -n ocis -l app=ocis -o jsonpath='{.items[0].metadata.name}')

kubectl scale deployment ocis -n ocis --replicas=0
sleep 5

# Restore config
cat $RESTORE/ocis-config.tar.gz | \
  kubectl exec -i -n ocis $POD -- tar xzf - -C /etc/

# Restore data
cat $RESTORE/ocis-data.tar.gz | \
  kubectl exec -i -n ocis $POD -- tar xzf - -C /var/lib/

kubectl scale deployment ocis -n ocis --replicas=1
```

### 4.8 Restore APITable MySQL Database

```bash
POD=$(kubectl get pods -n apitable -l app=apitable-mysql -o jsonpath='{.items[0].metadata.name}')

# Restore the dump
zcat $RESTORE/apitable-mysql.sql.gz | \
  kubectl exec -i -n apitable $POD -c mysql -- \
  sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" apitable'

# Restart the API server to clear any caches
kubectl rollout restart deployment apitable-backend-bundled -n apitable
```

---

## Phase 5: Verification

```bash
# All pods should be Running
kubectl get pods -A | grep -v "Running\|Completed"

# All ArgoCD apps should be Synced + Healthy
kubectl get applications -n argocd

# Service IPs
kubectl get svc -A | grep LoadBalancer

# Test key services (requires *.homelab DNS or /etc/hosts)
curl -sk https://budget.homelab         # Actual Budget
curl -sk https://grafana.homelab        # Grafana
curl -sk https://argocd.homelab         # ArgoCD
curl -sk https://ha.homelab             # Home Assistant
curl -sk https://ocis.homelab           # oCIS
```

---

## Service Endpoints After Restore

| Service | URL | Notes |
|---------|-----|-------|
| Actual Budget | https://budget.homelab | Login with your account |
| Grafana | https://grafana.homelab | admin / homelab2026 |
| ArgoCD | https://argocd.homelab | admin / initial secret |
| Home Assistant | https://ha.homelab | steve / homelab2026 |
| oCIS | https://ocis.homelab | admin (from 1Password) |
| APITable | http://192.168.1.15 | Re-register admin on first load |
| Jellyfin | http://192.168.1.11:8096 | Existing library after PVC restore |

---

## DNS Configuration

After restore, add *.homelab to your DNS or `/etc/hosts`:

```bash
# Quick /etc/hosts setup (temporary)
echo "192.168.1.21 budget.homelab grafana.homelab argocd.homelab ha.homelab ocis.homelab" \
  | sudo tee -a /etc/hosts
```

For permanent DNS: point your router's DNS to 192.168.1.22 (homelab CoreDNS).

---

## Troubleshooting

### ArgoCD not syncing
```bash
# Check ArgoCD app status
kubectl get applications -n argocd -o yaml | grep -A5 "conditions:"
# Force refresh all apps
kubectl annotate application -n argocd --all \
  argocd.argoproj.io/refresh=hard --overwrite
```

### Longhorn volumes not mounting
```bash
kubectl get volumes -n longhorn-system
kubectl get replicas -n longhorn-system
# Wait up to 5 min for replicas to sync
```

### cert-manager certificates not issuing
```bash
kubectl get clusterissuers
kubectl get certificaterequests -A
# Redeploy the homelab CA secret if needed
```

### rclone restore fails
```bash
# Re-authorize Google Drive
rclone config reconnect google_drive:
# Or reconfigure from scratch
rclone config
```
