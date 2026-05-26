# oCIS (ownCloud Infinite Scale) — Homelab Research

> Research completed 2026-05-26. Latest stable: **oCIS 8.0.4** (Curie), Helm chart **0.7.0**

---

## 1. Resource Requirements

| Resource | Minimum | Recommended (homelab) |
|----------|---------|----------------------|
| **CPU** | 1 core | 2 cores |
| **RAM** | 512MB | 1–2 GB |
| **Storage** | 10GB+ | 50–100GB (depends on files stored) |
| **Image size** | ~78 MB (compressed) | — |

oCIS is written in Go — a **single statically-linked binary** that runs all ~30 microservices in one process. It is dramatically lighter than Nextcloud (which needs PHP, MySQL/PostgreSQL, Redis, Apache/nginx). Memory usage auto-tunes via Go's `GOMEMLIMIT` set to 90% by default.

**Verdict for your M2 node**: Easily fits. oCIS will use ~500MB–1GB RAM under light homelab usage.

---

## 2. Helm Chart

| Field | Value |
|-------|-------|
| **Repo** | `https://github.com/owncloud/ocis-charts` (clone-based, not published to a Helm repo) |
| **Chart path** | `charts/ocis` |
| **Chart version** | 0.7.0 |
| **App version** | 7.1.4 (chart lags behind; override with `image.tag`) |
| **Branching** | `main` = oCIS 6+, `stable-5` = oCIS 5 |

### Installation (clone-based)
```bash
git clone https://github.com/owncloud/ocis-charts.git /tmp/ocis-charts
cd /tmp/ocis-charts/charts/ocis
helm install ocis . -n ocis --create-namespace -f values-override.yaml
```

### Key values.yaml settings
```yaml
# REQUIRED: public domain oCIS will be accessible at
externalDomain: cloud.homelab.local  # or cloud.example.com

# Image override to latest stable
image:
  repository: owncloud/ocis
  tag: "8.0.4"

# Ingress (or skip for LoadBalancer/Tailscale)
ingress:
  enabled: false  # use LoadBalancer service instead for homelab

# Storage backend
services:
  storageusers:
    storageBackend:
      driver: ocis        # "ocis" = local filesystem, "s3ng" = S3-compatible
    persistence:
      enabled: true
      size: 50Gi           # main data volume
      accessModes: [ReadWriteOnce]  # RWO is fine for single replica

  # Internal messaging (NATS)
  nats:
    persistence:
      enabled: true
      size: 5Gi

  # Identity management (built-in LDAP)
  idm:
    persistence:
      enabled: true
      size: 5Gi

  # Search index
  search:
    persistence:
      enabled: true
      size: 10Gi

  # Storage system metadata
  storagesystem:
    persistence:
      enabled: true
      size: 5Gi
      accessModes: [ReadWriteOnce]  # RWO for single node

  # Thumbnails cache
  thumbnails:
    persistence:
      enabled: true
      size: 5Gi
      accessModes: [ReadWriteOnce]

# Single replica for homelab
replicas: 1

# Demo users for initial testing (disable for production)
features:
  demoUsers: false
  edition: Community

# Security context
securityContext:
  fsGroup: 1000
  runAsUser: 1000
  runAsGroup: 1000
```

---

## 3. Storage Backend Options

| Backend | Description | Pros | Cons |
|---------|-------------|------|------|
| **`ocis` (decomposedFS)** | All data + metadata on local filesystem (PVC) | Simple, fast, no extra infra | All eggs in one basket |
| **`s3ng`** | Metadata on PVC, blobs on S3-compatible storage | Separates metadata/data, good for large files | Requires MinIO or S3; more complexity |

### Recommendation: Use `ocis` (decomposedFS) with Longhorn PVC

For a single-node homelab with Longhorn:
- **`ocis` driver** is the clear winner — no need for MinIO overhead
- Longhorn handles replication/snapshots at the storage layer
- A single 50–100Gi PVC backed by Longhorn gives you NVMe performance + Longhorn snapshots/backups
- S3ng only makes sense if you have external/NAS S3 storage or multi-node setups

**PVC breakdown** (~75–80Gi total):
- `storageusers`: 50Gi (your files)
- `nats`: 5Gi (message bus)
- `idm`: 5Gi (user directory)
- `search`: 10Gi (search index)
- `storagesystem`: 5Gi (system metadata)
- `thumbnails`: 5Gi (thumbnail cache — optional)

---

## 4. TLS / HTTPS

oCIS **requires HTTPS** for production use. Options:

| Approach | How |
|----------|-----|
| **cert-manager + self-signed** | ClusterIssuer creates certs, Ingress terminates TLS |
| **cert-manager + Let's Encrypt** | Needs public DNS or DNS-01 challenge |
| **Tailscale HTTPS** | `tailscale cert` provides MagicDNS certs automatically |
| **oCIS self-signed** | oCIS can generate its own self-signed certs (set `insecure.oidcIdpInsecure: true` and `insecure.ocisHttpApiInsecure: true`) |

### Recommendation for your cluster
Since you already have **cert-manager** and can use Tailscale:
1. **For LAN access**: Use cert-manager with your existing ClusterIssuer + a split-DNS domain
2. **For mobile/remote access**: Expose via Tailscale Operator (already in your infra) — gets free HTTPS via MagicDNS
3. **Simplest start**: Set `insecure` flags to `true` for initial testing, then add proper certs

The `externalDomain` value **must** match the hostname users access. The built-in IDP (LibreGraph Connect) uses this for OIDC redirect URIs.

---

## 5. Mobile & Desktop Clients

| Platform | App | Status |
|----------|-----|--------|
| **iOS** | [ownCloud - File Sync and Share](https://apps.apple.com/app/id1359583808) | v12.7.0 (May 2026), 4.5★, supports oCIS Spaces, offline, Face ID |
| **Android** | [ownCloud](https://play.google.com/store/apps/details?id=com.owncloud.android) | v4.8.0 (May 2026) |
| **macOS** | [ownCloud Desktop](https://owncloud.com/desktop-app/) | Native Finder integration (virtual files) |
| **Linux/Windows** | ownCloud Desktop | Same client, cross-platform |
| **Web** | Built-in | Modern React-based web UI, no separate install |

**iOS app features relevant to you:**
- Full oCIS Spaces support
- Offline file marking
- Multiple account support
- Files.app integration (File Provider)
- Face ID / Touch ID lock
- Certificate pinning and TLS trust management

---

## 6. Key Environment Variables / Configuration

oCIS follows 12-Factor and is configured almost entirely via environment variables:

| Variable | Purpose | Example |
|----------|---------|---------|
| `OCIS_URL` | Full external URL | `https://cloud.homelab.local` |
| `OCIS_DOMAIN` | Domain (derived from URL) | `cloud.homelab.local` |
| `OCIS_INSECURE` | Skip TLS verification (dev) | `true` |
| `IDM_ADMIN_PASSWORD` | Admin password (first run) | *(set in secret)* |
| `OCIS_LOG_LEVEL` | Log verbosity | `info`, `debug` |
| `STORAGE_USERS_DRIVER` | Storage backend | `ocis` or `s3ng` |
| `PROXY_HTTP_ADDR` | Proxy listen address | `0.0.0.0:9200` |
| `PROXY_TLS` | Enable TLS on proxy | `true` |
| `MICRO_REGISTRY` | Service registry | `nats-js-kv` (default) |
| `GOMEMLIMIT` | Go memory limit | Auto-set to 90% |
| `OCIS_EDITION` | Community or Enterprise | `Community` |

In the Helm chart, these are abstracted into `values.yaml` keys — you generally don't set env vars directly.

---

## 7. Authentication

| Mode | Description |
|------|-------------|
| **Built-in IDP** (default) | LibreGraph Connect — embedded OIDC provider + LDAP (IDM service). Zero config needed. |
| **Built-in IDM** | LibreGraph IDM — embedded LDAP server for user/group storage. |
| **External OIDC** | Can use Keycloak, Authentik, or any OIDC provider. Set `features.externalUserManagement.enabled: true` |
| **External LDAP** | Can connect to existing LDAP/AD for user directory |

### Recommendation
Use the **built-in IDP + IDM** (default). It's zero-config and perfect for homelab. The admin user is created on first start. You only need external OIDC if you want SSO across multiple services.

---

## 8. Services / Pods Created

The Helm chart creates a **separate Deployment for each service** (unlike Docker where it's one process). With `replicas: 1`, expect these pods:

| Service | Purpose |
|---------|---------|
| `activitylog` | Activity tracking |
| `audit` | Audit logging |
| `auth-basic` | Basic auth |
| `auth-bearer` | Bearer/OIDC token auth |
| `auth-machine` | Machine-to-machine auth |
| `auth-service` | Auth coordination |
| `clientlog` | Client-facing activity log |
| `eventhistory` | Event history |
| `frontend` | API frontend / routing |
| `gateway` | CS3 gateway |
| `graph` | Microsoft Graph API |
| `groups` | Group management |
| `idm` | LDAP directory (LibreGraph IDM) |
| `idp` | OIDC provider (LibreGraph Connect) |
| `nats` | NATS message bus |
| `notifications` | Notification service |
| `ocdav` | WebDAV endpoint |
| `ocs` | OCS API (legacy compat) |
| `postprocessing` | Upload post-processing |
| `proxy` | Main HTTPS reverse proxy (entry point) |
| `search` | Full-text search (Bleve) |
| `settings` | User/system settings |
| `sharing` | Share management |
| `sse` | Server-Sent Events |
| `storage-publiclink` | Public link storage |
| `storage-shares` | Share storage |
| `storage-system` | System metadata storage |
| `storage-users` | User file storage (main) |
| `thumbnails` | Thumbnail generation |
| `userlog` | User activity log |
| `users` | User management |
| `web` | Web frontend (serves the SPA) |
| `webdav` | WebDAV endpoint |
| `webfinger` | WebFinger discovery |

**~30 pods total** — but each is very lightweight (10–50MB RAM). Total footprint is still ~500MB–1GB.

---

## 9. Comparison with Alternatives

| Feature | oCIS | Nextcloud | Seafile | Syncthing |
|---------|------|-----------|---------|-----------|
| **Language** | Go (single binary) | PHP | Python/C | Go |
| **Dependencies** | None (self-contained) | MySQL/PostgreSQL, Redis, PHP-FPM, nginx | MySQL/PostgreSQL, memcached, nginx | None |
| **RAM usage** | 500MB–1GB | 1–3GB+ | 500MB–1GB | 50–100MB |
| **File sync protocol** | oc sync + TUS (resumable) | oc sync | Delta sync (proprietary) | BEP (peer-to-peer) |
| **Web UI** | Modern (React), Spaces | Feature-rich, apps ecosystem | Basic, functional | Minimal (config only) |
| **Mobile apps** | iOS + Android (native) | iOS + Android (native) | iOS + Android | iOS (3rd party), Android |
| **Office integration** | Collabora/OnlyOffice (optional) | Built-in (Collabora/OnlyOffice) | Built-in (OnlyOffice) | No |
| **Sharing** | Spaces, links, federation | Extensive sharing, apps | Limited sharing | No sharing (sync only) |
| **Auth** | Built-in OIDC + LDAP | Built-in + LDAP/SAML | Built-in | No auth |
| **K8s readiness** | Designed for K8s | Possible but painful | Docker-focused | Not server-focused |
| **Backup** | Filesystem snapshot | Database + files | Database + files | No central server |

### Why choose oCIS for this homelab?
1. **Zero external dependencies** — no database, no Redis, no PHP. Just one image.
2. **Designed for Kubernetes** — 12-Factor, Helm chart, one pod per service
3. **Low resource footprint** — Go binary uses less RAM than Nextcloud's PHP stack
4. **Modern architecture** — built from scratch, not carrying legacy PHP debt
5. **Talos-friendly** — no shell access needed for maintenance, everything via API/env vars
6. **Good mobile apps** — native iOS app with oCIS Spaces support, offline, File Provider

### When NOT to choose oCIS:
- You need Nextcloud's **app ecosystem** (calendar, contacts, deck, mail, etc.)
- You need **office editing** as a primary feature (oCIS needs separate Collabora/OnlyOffice)
- You want **mature community support** (Nextcloud has a much larger community)
- You want **peer-to-peer sync** without a server (→ Syncthing)

---

## 10. Recommended Deployment for This Cluster

### Architecture
```
Internet/LAN
     │
     ▼
Cilium LB (192.168.1.1x)
     │
     ▼
oCIS Proxy Service (NodePort or LoadBalancer)
     │
     ▼
~30 oCIS pods (all in namespace "ocis")
     │
     ▼
Longhorn PVCs (50Gi data + 25Gi metadata/services)
```

### Step-by-step deployment plan

1. **Create namespace**: `kubectl create ns ocis`
2. **Clone Helm chart**:
   ```bash
   git clone https://github.com/owncloud/ocis-charts.git /tmp/ocis-charts
   ```
3. **Create values override** with key settings (see recommended values below)
4. **Install**:
   ```bash
   cd /tmp/ocis-charts/charts/ocis
   helm install ocis . -n ocis -f /path/to/values-override.yaml
   ```
5. **Expose via LoadBalancer** (Cilium L2):
   ```yaml
   # Override proxy service to LoadBalancer
   # Or create a separate Service manifest
   ```
6. **Access**: `https://cloud.homelab.local:9200` (or your chosen domain)
7. **Mobile**: Install ownCloud iOS app → Add account → enter URL

### Recommended values-override.yaml
```yaml
externalDomain: cloud.homelab.local  # adjust to your domain

image:
  tag: "8.0.4"

replicas: 1

features:
  demoUsers: false
  edition: Community

insecure:
  oidcIdpInsecure: true       # for self-signed certs
  ocisHttpApiInsecure: true   # for self-signed certs

services:
  storageusers:
    storageBackend:
      driver: ocis
    persistence:
      enabled: true
      size: 50Gi
      accessModes: [ReadWriteOnce]

  nats:
    persistence:
      enabled: true
      size: 5Gi

  idm:
    persistence:
      enabled: true
      size: 5Gi

  search:
    persistence:
      enabled: true
      size: 10Gi

  storagesystem:
    persistence:
      enabled: true
      size: 5Gi
      accessModes: [ReadWriteOnce]

  thumbnails:
    persistence:
      enabled: true
      size: 5Gi
      accessModes: [ReadWriteOnce]

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    memory: 256Mi

securityContext:
  fsGroup: 1000
  fsGroupChangePolicy: OnRootMismatch
  runAsUser: 1000
  runAsGroup: 1000
```

---

## 11. Gotchas & Warnings

1. **~30 pods**: The Helm chart creates a separate Deployment per service. This is a lot of pods for a single node but each is tiny. Monitor with `kubectl top pods -n ocis`.

2. **PVC count**: You'll create 5–6 PVCs. With Longhorn's 200% overprovisioning, 75Gi of PVCs uses ~150Gi of actual NVMe space. Plan accordingly with your 900GB capacity.

3. **`externalDomain` is immutable-ish**: Changing it after first run requires re-initializing the IDP. Set it correctly from the start.

4. **Helm chart not published**: You must `git clone` the chart repo — it's not on ArtifactHub or a Helm registry. Pin to a tag for reproducibility.

5. **Chart version vs app version**: Chart 0.7.0 bundles oCIS 7.1.4 by default. Override `image.tag` to `8.0.4` for the latest.

6. **RWX vs RWO**: The chart defaults many PVCs to `ReadWriteMany`. For single-replica on Longhorn, change these to `ReadWriteOnce` — Longhorn's RWX requires NFSv4 and is slower.

7. **First boot**: oCIS auto-generates admin credentials and secrets on first start. The Helm chart creates Kubernetes Secrets for these. **Back them up** — they're needed for recovery.

8. **No database**: This is a feature, not a bug. But it means backups are filesystem-level (Longhorn snapshots or Restic), not database dumps.

9. **Self-signed certs on mobile**: The iOS app has certificate trust management built in — it will warn about untrusted certs and let you accept them. For a better experience, use Tailscale's MagicDNS certs.

10. **Memory**: Go's garbage collector is tuned aggressively. If you set per-pod memory limits too low (<128Mi), some services may OOM. Start with 256Mi limits and tune down.
