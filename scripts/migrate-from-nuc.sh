#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# migrate-from-nuc.sh
# STATUS: MIGRATION COMPLETE. The NUC (192.168.1.100) is retired. This script
# is kept for reference only. Do not run it.
#
# Note: This script contains the NUC SSH password and MySQL container password
# which were internal credentials for the decommissioned NUC. Both systems are
# offline; these credentials are no longer in use.
#
# Run this on your MAC (not on the NUC) after starting SSH on the NUC.
#
# PREREQUISITES:
#   1. NUC (192.168.1.100) has SSH running:
#        sudo systemctl start ssh    # on the NUC
#   2. GPU node (192.168.1.101) is booted (or skip GPU steps)
#   3. Migration bridges are deployed (kubectl apply -f infrastructure/migration/bridges.yaml)
#
# USAGE:
#   bash scripts/migrate-from-nuc.sh
#   bash scripts/migrate-from-nuc.sh --skip-media    # skip Jellyfin 219G
#   bash scripts/migrate-from-nuc.sh --actual-only   # only Actual Budget
#   bash scripts/migrate-from-nuc.sh --prometheus-only
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

NUC_IP="${NUC_IP:-192.168.1.100}"
NUC_USER="${NUC_USER:-stevehan}"

BRIDGE_ACTUAL="192.168.1.16"
BRIDGE_PROMETHEUS="192.168.1.17"
BRIDGE_JELLYFIN="192.168.1.18"
BRIDGE_APITABLE="192.168.1.19"
BRIDGE_PORT="2222"

# Parse flags
SKIP_MEDIA="${SKIP_MEDIA:-0}"
ACTUAL_ONLY="${ACTUAL_ONLY:-0}"
PROMETHEUS_ONLY="${PROMETHEUS_ONLY:-0}"
for arg in "$@"; do
  case "$arg" in
    --skip-media)       SKIP_MEDIA=1 ;;
    --actual-only)      ACTUAL_ONLY=1 ;;
    --prometheus-only)  PROMETHEUS_ONLY=1 ;;
  esac
done

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
step()    { echo -e "\n${BLUE}══════════════════════════════════════${NC}"; echo -e "${BLUE}  $*${NC}"; echo -e "${BLUE}══════════════════════════════════════${NC}"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── SSH key passphrase setup ──────────────────────────────────────────────────
# Add the SSH key to agent once (passphrase: 1024)
setup_ssh_agent() {
  if ! ssh-add -l &>/dev/null; then
    info "Starting SSH agent..."
    eval "$(ssh-agent -s)"
  fi
  # Check if our key is already added
  local key_file="$HOME/.ssh/id_ed25519"
  if [ ! -f "$key_file" ]; then
    key_file="$HOME/.ssh/id_rsa"
  fi
  if [ -f "$key_file" ]; then
    if ! ssh-add -l 2>/dev/null | grep -q "$(ssh-keygen -lf "$key_file" 2>/dev/null | awk '{print $2}')"; then
      info "Adding SSH key to agent (enter passphrase: 1024)"
      ssh-add "$key_file"
    else
      info "SSH key already in agent"
    fi
  fi
}

# NUC uses password auth (sshpass)
NUC_SSH="sshpass -p '1024' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=8"
NUC_RSYNC_PREFIX="sshpass -p '1024'"

# ── Helpers ───────────────────────────────────────────────────────────────────

check_nuc() {
  info "Checking NUC SSH at $NUC_IP..."
  if ! sshpass -p '1024' ssh -o ConnectTimeout=8 -o StrictHostKeyChecking=no \
    "$NUC_USER@$NUC_IP" "echo ok" &>/dev/null; then
    error "Cannot SSH to NUC at $NUC_IP. Start SSH first: sudo systemctl start ssh"
  fi
  info "✓ NUC reachable"
}

check_bridge() {
  local ip="$1" name="$2"
  info "Checking bridge $name at $ip:$BRIDGE_PORT..."
  if ! ssh -p "$BRIDGE_PORT" -o ConnectTimeout=5 -o StrictHostKeyChecking=no \
    -o BatchMode=yes "root@$ip" "echo ok" &>/dev/null; then
    warn "Bridge $name not reachable at $ip:$BRIDGE_PORT — deploying..."
    kubectl apply -f infrastructure/migration/bridges.yaml
    sleep 15
  fi
}

# rsync from NUC path → bridge pod path
# Uses the NUC as the rsync source, tunnels through Mac
nuc_to_bridge() {
  local src="$1" bridge_ip="$2" dest="$3" desc="$4"
  info "Migrating: $desc"
  info "  NUC:$src → bridge:$dest"
  
  # rsync via SSH jump: Mac connects to NUC, NUC rsyncs to bridge
  # OR: use rsync directly from Mac pulling from NUC and pushing to bridge (two-hop)
  
  # Approach: run rsync on NUC pushing to bridge
  sshpass -p '1024' ssh -o StrictHostKeyChecking=no "$NUC_USER@$NUC_IP" \
    "rsync -avz --progress --stats \
      -e 'ssh -p $BRIDGE_PORT -o StrictHostKeyChecking=no' \
      '$src' \
      root@$bridge_ip:$dest" \
  && info "✓ $desc — done" \
  || { warn "$desc failed — trying one more time..."; sleep 5;
       sshpass -p '1024' ssh -o StrictHostKeyChecking=no "$NUC_USER@$NUC_IP" \
         "rsync -avz -e 'ssh -p $BRIDGE_PORT -o StrictHostKeyChecking=no' \
           '$src' root@$bridge_ip:$dest"; }
}

# ── Main migration ────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║          Homelab NUC → K8s Migration                ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

setup_ssh_agent
check_nuc

# ── STEP 1: Actual Budget ─────────────────────────────────────────────────────
if [[ "$PROMETHEUS_ONLY" == "0" ]]; then
step "1/4 — Actual Budget (SQLite — ~552MB)"
info "Bridge: $BRIDGE_ACTUAL:$BRIDGE_PORT → PVC: actual-budget-data"

# Scale down Actual Budget app so we get a clean copy
kubectl scale deployment actual-budget -n actual-budget --replicas=0 2>&1 || true
sleep 5

nuc_to_bridge \
  "/opt/actual/packages/sync-server/actual-data/" \
  "$BRIDGE_ACTUAL" \
  "/data/" \
  "Actual Budget data"

# Scale back up
kubectl scale deployment actual-budget -n actual-budget --replicas=1 2>&1
info "✓ Actual Budget restored and restarted"
fi

# ── STEP 2: Prometheus TSDB ───────────────────────────────────────────────────
if [[ "$ACTUAL_ONLY" == "0" ]]; then
step "2/4 — Prometheus TSDB (financial history — ~3.6GB)"
info "Bridge: $BRIDGE_PROMETHEUS:$BRIDGE_PORT → PVC: prometheus-db"
warn "Rsyncing only sealed blocks (wal/ excluded) — safe to do while Prometheus runs"

# Rsync ONLY sealed TSDB blocks (skip wal and head chunks — those are ephemeral)
# The old blocks will be discoverable by Prometheus on restart
sshpass -p '1024' ssh -o StrictHostKeyChecking=no "$NUC_USER@$NUC_IP" \
  "rsync -avz --progress \
    --exclude='wal/' \
    --exclude='chunks_head/' \
    --exclude='.tmp*' \
    -e 'ssh -p $BRIDGE_PORT -o StrictHostKeyChecking=no' \
    /home/stevehan/k8s-storage/prometheus/prometheus-db/ \
    root@$BRIDGE_PROMETHEUS:/data/" \
&& info "✓ Prometheus TSDB blocks synced"

# Restart Prometheus to pick up new blocks
kubectl rollout restart statefulset -n monitoring \
  prometheus-prometheus-kube-prometheus-prometheus 2>&1 || true
info "✓ Prometheus restarting to load historical blocks"
fi

# ── STEP 3: Jellyfin ──────────────────────────────────────────────────────────
if [[ "$ACTUAL_ONLY" == "0" && "$PROMETHEUS_ONLY" == "0" ]]; then
step "3/4 — Jellyfin (config ~16KB + media ~219GB)"

kubectl scale deployment jellyfin -n jellyfin --replicas=0 2>&1 || true
sleep 5

# Config (fast)
nuc_to_bridge \
  "/opt/jellyfin/" \
  "$BRIDGE_JELLYFIN" \
  "/data/config/" \
  "Jellyfin config"

# Media (slow — 219G)
if [[ "$SKIP_MEDIA" == "0" ]]; then
  warn "Syncing Jellyfin media library (~219G) — this will take hours"
  warn "Progress visible on NUC. Use screen/tmux if running manually."
  nuc_to_bridge \
    "/mnt/data/jellyfin/" \
    "$BRIDGE_JELLYFIN" \
    "/data/media/" \
    "Jellyfin media (219G)"
else
  warn "Skipping media (--skip-media flag). Run manually:"
  echo "  ssh $NUC_USER@$NUC_IP rsync -avz --progress -e 'ssh -p $BRIDGE_PORT' /mnt/data/jellyfin/ root@$BRIDGE_JELLYFIN:/data/media/"
fi

kubectl scale deployment jellyfin -n jellyfin --replicas=1 2>&1 || true
fi

# ── STEP 4: APITable MySQL dump ───────────────────────────────────────────────
if [[ "$ACTUAL_ONLY" == "0" && "$PROMETHEUS_ONLY" == "0" ]]; then
step "4/4 — APITable MySQL dump"

# Create dump on NUC first (if not already done)
info "Dumping MySQL from NUC Docker container..."
sshpass -p '1024' ssh -o StrictHostKeyChecking=no "$NUC_USER@$NUC_IP" \
  "docker exec mysql mysqldump -u root -ppassword --all-databases \
    --single-transaction --quick 2>/dev/null > /tmp/apitable-mysql-dump.sql && \
  echo 'Dump created: '$(du -sh /tmp/apitable-mysql-dump.sql)" \
|| warn "MySQL dump failed (container may not be running on NUC)"

# Rsync dump to apitable bridge
nuc_to_bridge \
  "/tmp/apitable-mysql-dump.sql" \
  "$BRIDGE_APITABLE" \
  "/dump/" \
  "APITable MySQL dump"

# Trigger restore job in cluster
info "Triggering MySQL restore job..."
kubectl delete job mysql-restore -n apitable --ignore-not-found 2>&1
kubectl create job mysql-restore -n apitable \
  --from=job/mysql-restore 2>&1 || \
  kubectl apply -f infrastructure/migration/bridges.yaml 2>&1

info "MySQL restore job created — monitor with:"
echo "  kubectl logs -n apitable job/mysql-restore -f"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           Migration Complete!                       ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Services restored:"
echo "  Actual Budget:  http://192.168.1.12:5006   (your budget data is back)"
echo "  Prometheus:     http://192.168.1.13        (historical data loading...)"
echo "  Jellyfin:       http://192.168.1.11:8096   (media available)"
echo "  APITable:       http://192.168.1.15        (run mysql-restore job)"
echo ""
echo "Clean up migration bridges when done:"
echo "  kubectl delete -f infrastructure/migration/bridges.yaml"
echo "  kubectl delete configmap migration-ssh-authorized-keys -n actual-budget monitoring jellyfin apitable"
