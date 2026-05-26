# oCIS NAS – Design Document

## Overview

Deploy ownCloud Infinite Scale (oCIS) as a self-hosted NAS/file server accessible from macOS laptop and iOS phone.

## Architecture Decision

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| oCIS | Single Go binary, K8s-native, low resources (~500MB RAM), built-in IDP, WebDAV | Immature ecosystem vs Nextcloud | **Selected** |
| Nextcloud | Huge app ecosystem (calendar, contacts, office) | Heavy (PHP+MySQL+Redis), ~2GB RAM | Rejected |
| Seafile | Fast sync, dedup | Small community, complex setup | Rejected |
| Syncthing | P2P, no server | No web UI, no WebDAV, no mobile browser access | Rejected |

## Storage Backend

**Decision: decomposedFS on Longhorn PVCs (ReadWriteOnce)**

- S3ng/MinIO is overkill for single-node
- Longhorn provides snapshots + backup via recurring jobs
- Total PVC: ~30Gi (storageUsers) + small PVCs for metadata
- Access mode: RWO (Longhorn doesn't support RWX without NFSv4 server)

## Network

- LoadBalancer IP: 192.168.1.20
- Port: 9200 (oCIS default HTTPS port)
- External domain: `ocis.homelab.local` (for TLS SAN)
- Self-signed TLS (oCIS auto-generates)

## Client Access

- **macOS**: ownCloud Desktop client or WebDAV mount in Finder
- **iOS**: ownCloud iOS app (v12.7+, supports Spaces, offline files)
- **Web**: Browser at https://192.168.1.20:9200

## Resource Budget

- CPU: 1-2 cores (burstable)
- RAM: ~500MB-1GB
- Storage: 30Gi primary data PVC + 5Gi metadata PVCs

## Deployment Strategy

- Single-pod deployment (all oCIS services in one container)
- Simpler than microservice mode for single-node
- ArgoCD Application for GitOps
- Namespace: `ocis`

## Security

- Built-in IDP (LibreGraph Connect) — no external OIDC needed
- Admin user created on first boot
- HTTPS enforced by default
- Data encrypted at rest via Longhorn
