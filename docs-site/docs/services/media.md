---
sidebar_position: 1
title: Media (Jellyfin)
---

# Jellyfin

**Media server** for movies, TV shows, and music streaming.

| Property | Value |
|----------|-------|
| Namespace | `jellyfin-prod` |
| IP | 192.168.1.11 |
| Domain | jellyfin.homelab |
| Storage | Longhorn PVC |

## Access

- **Local**: https://jellyfin.homelab
- **Remote**: https://jellyfin.homelab (via Tailscale)

## Architecture

Jellyfin runs as a single pod with a Longhorn PVC for media library metadata and configuration. Media files are stored on the Longhorn volume.

## Backup

Jellyfin config is included in the Google Drive backup cronjob (`infrastructure/restic/gdrive-backup-cronjob.yaml`). The backup extracts `/config` from the running pod via `kubectl exec + tar`.
