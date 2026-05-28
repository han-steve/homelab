---
sidebar_position: 4
title: Storage (Longhorn, oCIS, MinIO)
---

# Storage

## Longhorn

**Distributed block storage** for Kubernetes PersistentVolumes.

| Property | Value |
|----------|-------|
| Version | v1.11.2 |
| Replicas | 1 (single node) |
| Overprovisioning | 200% |

### Why 1 Replica?
Single-node cluster — multiple replicas would just consume extra disk on the same drive. Longhorn still provides snapshots for point-in-time recovery.

### Recurring Jobs

| Job | Schedule | Retain |
|-----|----------|--------|
| Daily snapshot | 2 AM | 7 days |
| Weekly snapshot | 3 AM Sunday | 4 weeks |

## oCIS (Infinite Scale)

**File sync & share** — self-hosted alternative to Google Drive/Dropbox.

| Property | Value |
|----------|-------|
| IP | 192.168.1.20 |
| Domain | ocis.homelab |
| Storage | Longhorn PVC |

## MinIO

**S3-compatible object storage** used as Longhorn backup target.

| Property | Value |
|----------|-------|
| Namespace | `backup` |
| Purpose | Longhorn backup target |

:::warning
MinIO is using default credentials. Change the password before relying on it for backups.
:::
