# Backup Strategy

## Overview

Data protection for the homelab uses a two-tier approach:

1. **Longhorn Snapshots** (immediate, local) — point-in-time recovery within the cluster
2. **Longhorn Backup to S3** (offsite) — via MinIO on-cluster, eventually to GPU node 2TB NVMe

---

## Tier 1: Longhorn Recurring Snapshots

Configured via `infrastructure/restic/longhorn-recurring-jobs.yaml`:

| Job | Schedule | Task | Retain |
|-----|----------|------|--------|
| snapshot-daily | 2 AM daily | snapshot | 7 days |
| snapshot-weekly | 3 AM Sunday | snapshot | 4 weeks |

These apply to ALL Longhorn volumes in the `default` group (which is all volumes by default).

Snapshots are stored **locally on the Longhorn node**. They protect against accidental deletion/corruption but NOT against disk failure.

---

## Tier 2: Longhorn Backup to MinIO (S3)

MinIO is deployed in the `backup` namespace (`infrastructure/restic/minio.yaml`).

### Setup Steps

1. **Deploy MinIO** (already in repo):
   ```bash
   kubectl apply -k infrastructure/restic/
   ```

2. **Get MinIO credentials** (change from defaults first!):
   ```bash
   kubectl create secret generic minio-credentials -n backup \
     --from-literal=MINIO_ROOT_USER=admin \
     --from-literal=MINIO_ROOT_PASSWORD=$(openssl rand -base64 32) \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

3. **Create Longhorn backup bucket** in MinIO:
   ```bash
   # Port-forward MinIO console
   kubectl port-forward -n backup svc/minio 9001:9001
   # Open: http://localhost:9001 → login → create bucket "longhorn-backups"
   ```

4. **Configure Longhorn backup target**:
   ```bash
   # Via kubectl (or Longhorn UI → Settings → Backup Target)
   kubectl patch setting backup-target \
     -n longhorn-system \
     --type merge \
     -p '{"spec":{"value":"s3://longhorn-backups@minio/"}}'
   
   kubectl patch setting backup-target-credential-secret \
     -n longhorn-system \
     --type merge \
     -p '{"spec":{"value":"minio-longhorn-secret"}}'
   
   # Create the credential secret for Longhorn
   kubectl create secret generic minio-longhorn-secret -n longhorn-system \
     --from-literal=AWS_ACCESS_KEY_ID=admin \
     --from-literal=AWS_SECRET_ACCESS_KEY=YOUR_MINIO_PASSWORD \
     --from-literal=AWS_ENDPOINTS=http://minio.backup.svc.cluster.local:9000 \
     --from-literal=AWS_CERT=""
   ```

5. **Add backup RecurringJob** (after backup target is configured):
   ```yaml
   # Add to longhorn-recurring-jobs.yaml:
   apiVersion: longhorn.io/v1beta2
   kind: RecurringJob
   metadata:
     name: backup-daily
     namespace: longhorn-system
   spec:
     cron: "0 4 * * *"  # 4 AM daily
     task: backup
     groups: [default]
     retain: 30  # Keep 30 daily backups
     concurrency: 1
   ```

---

## Future: GPU Node 2TB NVMe Target

When the GPU node joins the cluster with Talos and its 2TB NVMe (`/dev/sdb`):

1. The NVMe will be a Longhorn disk on the GPU node
2. Create a dedicated StorageClass for GPU node: `storageClassName: longhorn-gpu-node`
3. Migrate MinIO's `minio-data` PVC to the GPU node StorageClass
4. All backup data will then live on the 2TB NVMe

This gives ~1.8TB of backup space for the entire cluster.

---

## Critical PVCs to Protect

| Namespace | PVC | Size | Contents |
|-----------|-----|------|----------|
| actual-budget | actual-budget-data | 5Gi | Budget data (account.sqlite, blobs) |
| monitoring | prometheus-grafana | 10Gi | Grafana config/dashboards |
| monitoring | prometheus-db (100Gi PVC) | 100Gi | Prometheus historical TSDB |
| jellyfin | jellyfin-config | 5Gi | Jellyfin metadata, transcoding config |
| monitoring | storage-loki-0 | 20Gi | Loki log data |
| home-assistant | home-assistant-config | 5Gi | HA config, automations, .storage |
| home-assistant | zigbee2mqtt-data | 1Gi | Zigbee2MQTT config and device database |

---

## Tier 3: Google Drive Backup (Offsite)

Uses restic + rclone to back up critical PVCs to Google Drive (8TB available, allocating 1TB).

### Setup Steps

1. **Install rclone locally** (if not already):
   ```bash
   brew install rclone
   ```

2. **Configure Google Drive remote**:
   ```bash
   rclone config
   # Choose: n (new remote)
   # Name: gdrive
   # Type: 18 (Google Drive)
   # Client ID: (leave blank for rclone's)
   # Client Secret: (leave blank)
   # Scope: 1 (full access)
   # Root folder ID: (leave blank)
   # Service account file: (leave blank)
   # Auto config: y
   # → Browser opens, authorize with your Google account
   # Team drive: n
   ```

3. **Create backup folder on Google Drive**:
   ```bash
   rclone mkdir gdrive:homelab-backups
   ```

4. **Create K8s secrets**:
   ```bash
   # Rclone config
   kubectl create secret generic rclone-config -n backup \
     --from-file=rclone.conf=$HOME/.config/rclone/rclone.conf

   # Restic password (save this somewhere safe!)
   kubectl create secret generic restic-password -n backup \
     --from-literal=password=$(openssl rand -base64 32)
   ```

5. **Enable the CronJob** — add to `infrastructure/restic/kustomization.yaml`:
   ```yaml
   resources:
   - gdrive-backup-cronjob.yaml
   ```

6. **Test manually**:
   ```bash
   kubectl create job --from=cronjob/gdrive-backup test-gdrive-backup -n backup
   kubectl logs -f job/test-gdrive-backup -n backup
   ```

---

## Recovery

### Restore from Longhorn Snapshot

```bash
# List snapshots for a volume
kubectl get volumes.longhorn.io -n longhorn-system
# Use Longhorn UI → Volume → Snapshots → Revert

# Or via API:
# POST /v1/volumes/{volumeId}/actions/snapshotRevert
```

### Restore from Longhorn Backup (S3/MinIO)

```bash
# Via Longhorn UI → Volume → Backups → Restore
# Or create a PVC from backup via:
kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: actual-budget-data-restored
  namespace: actual-budget
  annotations:
    longhorn.io/volume-name: <volume-name-from-backup>
spec:
  dataSource:
    name: <backup-volume-name>
    kind: Volume
    apiGroup: longhorn.io
  accessModes: [ReadWriteOnce]
  storageClassName: longhorn
  resources:
    requests:
      storage: 5Gi
EOF
```
