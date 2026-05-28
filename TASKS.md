# Homelab Task Tracker
# This file is checked by the AI agent before stopping work.
# Tasks are added continuously. Agent should always find something to do here.
# Last updated: 2026-05-28

## CRITICAL — Fix Now
- [x] Fix Grafana password: deployed homelab2026, added ignoreDifferences to ArgoCD app
- [ ] Fix Actual Budget file download: server returns 200 OK (3MB), client-side JS decryption fails. Likely encryption key mismatch.
- [x] Finish /etc/hosts setup for *.homelab domains — using /etc/resolver/homelab → 192.168.1.22
- [x] Verify nginx-ingress is routing all services correctly via curl (all return 200/302)
- [x] Fix APITable: added imageproxy deployment, REDIS_PASSWORD to secret, fixed RabbitMQ/Redis credentials in vCluster ConfigMap

## HIGH — Infrastructure
- [x] Commit and push nginx-ingress, ingress, homelab-dns infrastructure to git
- [x] Test all *.homelab domains work through nginx-ingress (jellyfin.homelab, grafana.homelab, etc.)
- [ ] Fix Tailscale operator: CrashLoopBackOff due to invalid OAuth token. User needs to create fresh OAuth credentials.
- [x] Document Tailscale split DNS setup — added to Docusaurus docs-site and docs/SPLIT-DNS.md
- [ ] Answer: Tailscale free plan = 100 devices, 3 users. All features included (MagicDNS, subnet routing, HTTPS certs)
- [ ] Clean SSH public key from git history (BFG or git filter-branch)
- [ ] Check/increase oCIS storage space

## HIGH — Home Automation
- [x] Deploy Home Assistant 2026.5.4 at 192.168.1.16:8123 (steve/homelab2026)
- [x] Deploy Mosquitto MQTT broker (port 1883, anonymous auth)
- [x] Deploy Zigbee2MQTT with Sonoff ZBDongle-E (EmberZNet 7.4.5, EZSP v13)
- [x] Configure MQTT integration in HA (programmatic config entry)
- [x] Ignore ZHA discovery (using Zigbee2MQTT instead)
- [x] Add DNS entries for ha.homelab and zigbee.homelab
- [ ] Pair Zigbee devices (need physical devices in pairing mode near dongle)
- [ ] Connect LotusLantern LED strip — BLOCKED: Talos kernel has CONFIG_BT disabled, no btusb module. Options: (a) build custom Talos image with BT, (b) USB BT adapter + custom extension
- [ ] WiFi device discovery via HA SSDP/mDNS
- [ ] Add HA dashboard cards for paired devices
- [ ] Evaluate ESPHome for WiFi IoT devices

## HIGH — 3D Dashboard Improvements
- [x] Fix 3D view centering — camera at [0,1,10], fov 50, orbit target [0,0.5,0]
- [x] Fix topology button visibility at different browser sizes (responsive layout)
- [x] Dashboard live cluster status indicators (ArgoCD sync, pod health, node status)
- [x] Draw GPU node (192.168.1.101) as 3D object with gamepad icon, dim/yellow planned status
- [x] Show physical specs overlay on 3D objects when clicked (CPU, RAM, storage, IP, etc.)
- [x] Overlay info as SciFi bubble/tooltip (Html component in 3D space) with close button
- [x] Make 3D objects glow when online (blue emissive), dim when offline/planned
- [x] Add selection rings and hover animations (y-lift, rotation wobble)
- [x] Draw router (AT&T BGW320) as 3D object with satellite dish icon
- [x] Visualize network connections as flowing glowing pipes (green active, yellow dashed planned)
- [ ] Show IP addresses, bandwidth info on network connections
- [x] Create 3D ArgoCD logo object (rotating octahedron, non-rotating label)
- [x] Place services in 6-column layout with category color strips (expanded from 5)
- [x] Added Home Assistant, Zigbee2MQTT, Mosquitto, nginx-ingress, CoreDNS, cert-manager to dashboard
- [x] Added HA, nginx, DNS nodes to topology view
- [ ] Add more logos and branding to 3D objects
- [x] Icons on top face, names below boxes — visible from all camera angles
- [x] Bloom and vignette post-processing effects
- [x] HoloGrid shader floor and floating particles
- [ ] Keep iterating with screenshot testing for best UX

## MEDIUM — Config & Cleanup
- [x] Merge .cursorrules into CLAUDE.md with correct hardware specs
- [x] Reconcile hardware specs: confirmed Intel Core Ultra 7 356H 32GB DDR5
- [x] Update data.ts with correct hardware specs
- [x] Delete .cursorrules after merging into CLAUDE.md

## MEDIUM — Security
- [x] Add security contexts to SimpleFIN CronJob (runAsNonRoot, seccomp, drop ALL, readOnlyRootFilesystem)
- [ ] Add security contexts to APITable MySQL
- [ ] Review PodSecurity exemptions (12 namespaces too many — currently in Talos machineconfig)
- [x] Fix SimpleFIN using :latest image tag — pinned to sha256 digest
- [ ] Disable SSH root login on migration bridges
- [ ] Fix etcd metrics listening on 0.0.0.0:2381

## LOW — Future Work
- [ ] vCluster: add vc-prod, vc-dev, vc-staging as kubectl contexts
- [ ] Move more services to vc-prod
- [ ] Set up Tailscale MagicDNS for remote access
- [ ] Consider Let's Encrypt certs for public domains (if desired)
- [x] Dashboard: add real-time metrics from Prometheus API (cluster status API route)
- [ ] Dashboard: add log viewer from Loki
- [x] Dashboard: add ArgoCD sync status indicators (live in top bar)

## LOW — Backup
- [x] Set up Google Drive backup via rclone (4 services: actual-budget, grafana, jellyfin, HA)
- [x] Configure rclone with Google Drive OAuth
- [x] Set up backup CronJob (4 AM daily, 7-day retention)
- [x] Create backup RBAC (ServiceAccount + ClusterRole for kubectl exec)
- [x] Test E2E: 31MB uploaded to google_drive:homelab-backups/

## LOW — 3D Models
- [ ] Use Blender MCP to create real 3D model of Minisforum M2
- [ ] Use Blender MCP to create real 3D model of AT&T BGW320 router
- [ ] Use Blender MCP to create real 3D model of GPU node (i9 + RTX 3080 Ti)

## COMPLETED
- [x] Storage cleanup — audit & right-size PVCs
- [x] Remove secrets/tokens from git files
- [x] Fix Actual Budget unreachable at 192.168.1.12:5006
- [x] SimpleFIN key exchange + deploy
- [x] Fix SimpleFIN Grafana dashboard (no data)
- [x] Change Grafana password to homelab2026 (was homelab2024)
- [x] Find APITable credentials (needs first-time registration)
- [x] Fix 3D dashboard "Loading 3D scene..." issue
- [x] Deploy Tailscale operator via GitOps
- [x] Browser test all services visually
- [x] Build initial 3D SciFi dashboard with topology view
- [x] Security review (SSH key removed, Tailscale RBAC tightened)
- [x] Update CLAUDE.md with findings
- [x] Deploy nginx-ingress controller at 192.168.1.21
- [x] Deploy homelab-dns CoreDNS at 192.168.1.22
- [x] Create wildcard cert *.homelab via cert-manager
- [x] Create Ingress resources for all 6 services
- [x] Patch kube-system CoreDNS with homelab zone
- [x] Fix Grafana password (homelab2026)
- [x] Merge .cursorrules into CLAUDE.md
- [x] Update data.ts with correct hardware specs
- [x] Create TASKS.md persistent task tracker
- [x] Rewrite Scene3D.tsx with 3D nodes, pipes, overlays
- [x] Fix font loading error (removed font prop)
- [x] Fix MeshTransmissionMaterial HDR error (replaced with meshPhysicalMaterial)
- [x] Fix service label visibility (icons on top, names below)
- [x] Fix ArgoCD label rotation (only mesh rotates, not label)
- [x] Make pipes/grid non-raycastable for service clicks
- [x] Re-enable bloom/vignette post-processing
- [x] Commit 3D dashboard changes (84957ed)
- [x] Fix MinIO CrashLoopBackOff (volume permissions: chown 1000:1000 /data)
- [x] Fix APITable Redis/Gateway/Backend (imageproxy missing, REDIS_PASSWORD in secret, RabbitMQ credentials)
- [x] Add SimpleFIN security contexts (pod + container level)
- [x] Pin SimpleFIN image to sha256 digest
- [x] Deploy Home Assistant stack (HA + Mosquitto + Zigbee2MQTT) to K8s
- [x] Configure MQTT integration in Home Assistant
- [x] Add 6 new services to dashboard (HA, Z2M, Mosquitto, nginx, DNS, cert-manager)
- [x] Fix ArgoCD bootstrap OutOfSync (removed kustomization.yaml from app-of-apps subdirs)
- [x] DNS setup: /etc/resolver/homelab → nameserver 192.168.1.22
- [x] Delete unused device-plugin.yaml from git
