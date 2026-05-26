#!/bin/bash
set -uo pipefail

SRC=stevehan@192.168.1.100
DST=/mnt/backup
LOG=$DST/backup.log
SSH_KEY=/tmp/migration_key
RSYNC_SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=no"

echo "Backup started at $(date)" | tee $LOG

# Step 1: /opt directories
echo "=== Step 1: /opt (Actual, Jellyfin config, WireGuard, QBit) ===" | tee -a $LOG
for dir in actual jellyfin wireguard-server qbit-vpn-server openvpn; do
    echo "  Syncing /opt/$dir ..." | tee -a $LOG
    rsync -az --ignore-errors -e "$RSYNC_SSH" $SRC:/opt/$dir/ $DST/opt/$dir/ >> $LOG 2>&1 || true
done

# Step 2: Home directories
echo "=== Step 2: Home directories ===" | tee -a $LOG
for dir in repos apps data .kube .claude .local/share/mkcert; do
    echo "  Syncing ~/$dir ..." | tee -a $LOG
    rsync -az --ignore-errors -e "$RSYNC_SSH" $SRC:/home/stevehan/$dir/ $DST/home/$dir/ >> $LOG 2>&1 || true
done

# Individual files from home
for f in .claude.json .zsh_history .gitconfig .zshrc .bashrc .bash_history; do
    rsync -az -e "$RSYNC_SSH" $SRC:/home/stevehan/$f $DST/home/ 2>/dev/null || true
done

# Step 3: K8S storage (Prometheus + vclusters)
echo "=== Step 3: K8S storage (Prometheus financial data + vclusters) ===" | tee -a $LOG
rsync -az --ignore-errors -e "$RSYNC_SSH" $SRC:/home/stevehan/k8s-storage/ $DST/k8s-storage/ >> $LOG 2>&1 || true

# Step 4: Jellyfin media (LARGEST ~219G)
echo "=== Step 4: Jellyfin media (~219G) ===" | tee -a $LOG
rsync -az --ignore-errors -e "$RSYNC_SSH" $SRC:/mnt/data/jellyfin/ $DST/jellyfin-media/ >> $LOG 2>&1 || true

# Step 5: MySQL dump (already captured separately as /mnt/backup/mysql-dump.sql)
echo "=== Step 5: MySQL dump (pre-captured) ===" | tee -a $LOG
ls -lh $DST/mysql-dump.sql 2>/dev/null | tee -a $LOG || echo "  WARNING: mysql-dump.sql not found" | tee -a $LOG

# Step 6: Docker volumes (jellyfin-config, jellyfin-cache, appflowy)
echo "=== Step 6: Docker named volumes ===" | tee -a $LOG
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SRC 'echo 1024 | sudo -S tar czf /tmp/docker-volumes-backup.tar.gz -C /var/lib/docker/volumes . 2>/dev/null' || true
rsync -az --ignore-errors -e "$RSYNC_SSH" $SRC:/tmp/docker-volumes-backup.tar.gz $DST/docker-volumes/ >> $LOG 2>&1 || true

echo "" | tee -a $LOG
echo "Backup completed at $(date)" | tee -a $LOG
echo "=== BACKUP SIZES ===" | tee -a $LOG
du -sh $DST/*/ 2>/dev/null | tee -a $LOG
echo "=== DISK USAGE ===" | tee -a $LOG
df -h /mnt/backup | tee -a $LOG
