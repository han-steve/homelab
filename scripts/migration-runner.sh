#!/usr/bin/env bash
# migration-runner.sh
# Runs on the NUC (192.168.1.100) OR the GPU node (192.168.1.101)
# Rsyncs data into K8s PVCs via the migration bridge pod.
# Usage: ssh stevehan@192.168.1.100 "bash -s" < scripts/migration-runner.sh
#   OR:  scp scripts/migration-runner.sh stevehan@192.168.1.100:~ && ssh stevehan@192.168.1.100 sudo bash migration-runner.sh

set -euo pipefail

BRIDGE_IP="${BRIDGE_IP:-}"   # set after bridge pod is deployed
M2_IP="192.168.1.10"
BRIDGE_PORT="${BRIDGE_PORT:-2222}"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Which data source are we on? ──────────────────────────────────────────────
detect_host() {
  if [[ -f /opt/actual/packages/sync-server/actual-data/server-files/account.sqlite ]]; then
    echo "nuc"
  elif [[ -d /mnt/backup ]]; then
    echo "gpu"
  else
    echo "unknown"
  fi
}

HOST_TYPE=$(detect_host)
info "Detected host type: $HOST_TYPE"

# ── Check bridge IP ───────────────────────────────────────────────────────────
if [[ -z "$BRIDGE_IP" ]]; then
  # Try to get it from the cluster
  BRIDGE_IP=$(ssh -o StrictHostKeyChecking=no "stevehan@$M2_IP" \
    "kubectl get svc migration-bridge -n migration -o jsonpath='{.status.loadBalancer.ingress[0].ip}'" 2>/dev/null || true)
fi

if [[ -z "$BRIDGE_IP" ]]; then
  error "BRIDGE_IP not set and could not auto-detect. Set BRIDGE_IP=<ip> before running."
fi
info "Bridge IP: $BRIDGE_IP"

# ── SSH options ───────────────────────────────────────────────────────────────
SSH_OPTS="-p $BRIDGE_PORT -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
RSYNC_OPTS="-avz --progress --stats --delete"
RSYNC_SSH="ssh $SSH_OPTS"

# ── Helper: rsync with retry ──────────────────────────────────────────────────
rsync_to() {
  local src="$1" dest="$2" desc="$3"
  info "Rsyncing $desc ($src → bridge:$dest)"
  rsync $RSYNC_OPTS -e "$RSYNC_SSH" "$src" "root@$BRIDGE_IP:$dest" || {
    warn "rsync failed for $desc — retrying once..."
    sleep 5
    rsync $RSYNC_OPTS -e "$RSYNC_SSH" "$src" "root@$BRIDGE_IP:$dest"
  }
  info "✓ $desc done"
}

echo ""
echo "=== Homelab Migration Runner ==="
echo "Host: $HOST_TYPE | Bridge: $BRIDGE_IP:$BRIDGE_PORT"
echo ""

# ── NUC migrations ───────────────────────────────────────────────────────────
if [[ "$HOST_TYPE" == "nuc" || "${FORCE_NUC:-}" == "1" ]]; then
  info "=== PHASE 1: Actual Budget (SQLite) ==="
  rsync_to \
    "/opt/actual/packages/sync-server/actual-data/" \
    "/data/actual-budget/" \
    "Actual Budget data"

  info "=== PHASE 2: Prometheus TSDB ==="
  rsync_to \
    "/home/stevehan/k8s-storage/prometheus/prometheus-db/" \
    "/data/prometheus-tsdb/" \
    "Prometheus TSDB (financial history)"

  info "=== PHASE 3: Jellyfin config ==="
  rsync_to \
    "/opt/jellyfin/" \
    "/data/jellyfin-config/" \
    "Jellyfin config"

  info "=== PHASE 4: Jellyfin media (large — ~219G) ==="
  warn "This will take a while. Monitor with: watch -n5 df -h"
  rsync_to \
    "/mnt/data/jellyfin/" \
    "/data/jellyfin-media/" \
    "Jellyfin media library"

  info "=== PHASE 5: MySQL dump (APITable) ==="
  if [[ -f /tmp/apitable-mysql-dump.sql ]]; then
    rsync_to \
      "/tmp/apitable-mysql-dump.sql" \
      "/data/mysql-dump/" \
      "APITable MySQL dump"
  else
    warn "No MySQL dump found at /tmp/apitable-mysql-dump.sql"
    info "To create it: docker exec mysql mysqldump -u root -ppassword --all-databases > /tmp/apitable-mysql-dump.sql"
  fi
fi

# ── GPU node migrations (from /mnt/backup) ───────────────────────────────────
if [[ "$HOST_TYPE" == "gpu" || "${FORCE_GPU:-}" == "1" ]]; then
  info "=== GPU NODE: Syncing from /mnt/backup ==="

  [[ -d /mnt/backup/jellyfin-media ]] && \
    rsync_to "/mnt/backup/jellyfin-media/" "/data/jellyfin-media/" "Jellyfin media (from GPU backup)"

  [[ -d /mnt/backup/opt/actual ]] && \
    rsync_to "/mnt/backup/opt/actual/packages/sync-server/actual-data/" "/data/actual-budget/" "Actual Budget (from GPU backup)"

  [[ -d /mnt/backup/k8s-storage/prometheus/prometheus-db ]] && \
    rsync_to "/mnt/backup/k8s-storage/prometheus/prometheus-db/" "/data/prometheus-tsdb/" "Prometheus TSDB (from GPU backup)"

  [[ -f /mnt/backup/databases/apitable-mysql-dump.sql ]] && \
    rsync_to "/mnt/backup/databases/apitable-mysql-dump.sql" "/data/mysql-dump/" "APITable MySQL dump (from GPU backup)"
fi

echo ""
info "=== Migration data transfer complete! ==="
echo ""
echo "Now run on the k8s cluster (from your Mac):"
echo "  kubectl create job actual-budget-restore --from=cronjob/actual-budget-restore -n migration"
echo "  kubectl create job prometheus-restore --from=cronjob/prometheus-restore -n migration"
echo "  (Jellyfin media is already in place — restart jellyfin pod)"
