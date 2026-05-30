# Homelab Restore Playbook
*Use this after wiping and reinstalling the M2 node*

---

## Prerequisites
- Ubuntu 26.04 or Talos Linux USB flashed and ready
- This repo cloned: `git clone https://github.com/han-steve/homelab`
- `kubectl`, `talosctl`, `helm`, `argocd` CLI installed

---

## Option A: Reinstall Talos (recommended — keeps K8s)

### 1. Flash Talos to M2
```bash
# Download Talos installer ISO
curl -LO https://github.com/siderolabs/talos/releases/download/v1.13.2/talos-amd64.iso

# Flash USB (replace sdX)
sudo dd if=talos-amd64.iso of=/dev/sdX bs=4M status=progress
```

### 2. Boot and Install
- Boot M2 from USB
- Talos will be in "maintenance mode" — no UI
- From your Mac:
```bash
# Generate config
talosctl gen config homelab https://192.168.1.10:6443 \
  --output-dir ./talos-config

# Edit talos-config/controlplane.yaml:
# - Set hostname: m2
# - Set static IP: 192.168.1.10/24 gw 192.168.1.1
# - Add Cilium CNI settings

# Apply config
talosctl apply-config --insecure -n 192.168.1.10 \
  --file ./talos-config/controlplane.yaml

# Bootstrap etcd (first time only)
talosctl bootstrap -n 192.168.1.10

# Get kubeconfig
talosctl kubeconfig -n 192.168.1.10 ~/.kube/config
```

### 3. Restore Cluster via ArgoCD
```bash
# Install ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f \
  https://raw.githubusercontent.com/argoproj/argo-cd/v3.4.2/manifests/install.yaml

# Wait for ArgoCD
kubectl wait --for=condition=Available -n argocd deployment/argocd-server --timeout=120s

# Apply the app-of-apps (this recreates everything)
kubectl apply -f app-of-apps/

# Watch sync progress
kubectl get apps -n argocd -w
```

---

## Option B: Install Ubuntu 26.04 (GPU node or fresh Mac)

### 1. Boot from USB
- F12 (GPU node) or hold Option (Mac) → select USB
- Choose "Install Ubuntu Server"

### 2. During Install
- IP: `192.168.1.101` (GPU) or DHCP (Mac dev)
- Gateway: `192.168.1.1`
- DNS: `192.168.1.22` (homelab CoreDNS) or `1.1.1.1` if cluster isn't up yet
- Storage: Use full NVMe, ext4
- User: `stevehan`, enable OpenSSH

### 3. Post-Install (GPU Node)
```bash
# Install NVIDIA drivers
sudo apt update && sudo ubuntu-drivers install nvidia:570

# Verify GPU
nvidia-smi

# Install Docker (for containerd)
sudo apt install -y containerd

# Join K8s cluster (kubeadm or talosctl worker join)
# TODO: generate join token from M2 cluster
```

---

## PVC Sizes for Fresh Install
When recreating PVCs, use these sizes (smaller than current provisioned):

| Manifest | Current | **Use This** |
|----------|---------|--------------|
| apps/actual-budget/pvc.yaml | 5 Gi | **2 Gi** |
| apps/apitable/mysql-pvc.yaml | 20 Gi | **5 Gi** |
| apps/apitable/minio-pvc.yaml | 20 Gi | **5 Gi** |
| apps/backup/minio-pvc.yaml | 20 Gi | **5 Gi** |
| apps/jellyfin/config-pvc.yaml | 5 Gi | **2 Gi** |
| apps/jellyfin/media-pvc.yaml | 100 Gi | Keep 100 Gi |
| prometheus helm-values.yaml | 100 Gi | **30 Gi** |
| monitoring/grafana | 10 Gi | **3 Gi** |
| monitoring/loki | 20 Gi | **10 Gi** |
| ocis/ocis-data | 200 Gi | Keep 200 Gi |

---

## Critical Data to Back Up Before Wipe

### 1. Prometheus TSDB Snapshot
```bash
# Enable admin API first (now in helm-values.yaml)
# Then after ArgoCD sync:
curl -X POST https://prometheus.homelab/api/v1/admin/tsdb/snapshot

# Copy snapshot out
SNAPSHOT=$(curl -s -X POST https://prometheus.homelab/api/v1/admin/tsdb/snapshot | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['name'])")
kubectl cp monitoring/prometheus-prometheus-kube-prometheus-prometheus-0:\
prometheus/snapshots/$SNAPSHOT ./prometheus-backup/
```

### 2. Grafana Dashboards
Already in git: `simplefin-improved-dashboard.json`
All others are deployed via ArgoCD from repo.

### 3. Actual Budget Data
- Go to https://budget.homelab
- Settings → Export data → Download .zip
- Store in iCloud / Google Drive

### 4. oCIS Data
- 200 Gi volume, 3 MB used currently — minimal
- Access via https://ocis.homelab and download any important files

### 5. Home Assistant Config
- zigbee2mqtt-data PVC contains device pairings (important!)
- home-assistant-config has automations
- Both backed up by Longhorn daily snapshots

---

## Post-Restore Verification
```bash
# Check all nodes ready
kubectl get nodes

# Check all apps synced
kubectl get apps -n argocd

# Test DNS
dig jellyfin.homelab @192.168.1.22
nslookup grafana.homelab 192.168.1.22

# Test HTTPS
curl -k https://grafana.homelab
curl -k https://argocd.homelab
curl -k https://prometheus.homelab
curl -k https://longhorn.homelab
curl -k https://minio.homelab

# Check Longhorn volumes healthy
kubectl get volumes -n longhorn-system
```
