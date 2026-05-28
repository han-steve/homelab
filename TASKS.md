# Homelab Task Tracker
# This file is checked by the AI agent before stopping work.
# Tasks are added continuously. Agent should always find something to do here.
# Last updated: 2026-05-27

## CRITICAL — Fix Now
- [ ] Fix Grafana password: secret in cluster says PLACEHOLDER, user can't log in. Deploy real secret via kubectl.
- [ ] Fix Actual Budget file download: GET /sync/download-user-file returns 200 OK with Content-Length: 3157696 but browser fails to process. May be a content-type/encoding issue or CORS. Need to check actual-budget pod logs.
- [ ] Finish /etc/hosts setup for *.homelab domains (192.168.1.21)
- [ ] Verify nginx-ingress is routing all services correctly via browser

## HIGH — Infrastructure
- [ ] Commit and push nginx-ingress, ingress, homelab-dns infrastructure to git
- [ ] Test all *.homelab domains work through nginx-ingress (jellyfin.homelab, grafana.homelab, etc.)
- [ ] Fix Tailscale operator: CrashLoopBackOff due to invalid OAuth token. User needs to create fresh OAuth credentials.
- [ ] Document Tailscale split DNS setup: user adds 192.168.1.22 as nameserver for "homelab" domain in Tailscale admin
- [ ] Answer: Tailscale free plan = 100 devices, 3 users. All features included (MagicDNS, subnet routing, HTTPS certs)
- [ ] Clean SSH public key from git history (BFG or git filter-branch)
- [ ] Check/increase oCIS storage space

## HIGH — 3D Dashboard Improvements
- [ ] Fix 3D view centering — top row of apps cut off, camera/layout needs adjustment
- [ ] Fix topology button visibility at different browser sizes (responsive layout)
- [ ] Draw GPU node (192.168.1.101) as separate 3D object connected to M2
- [ ] Show physical specs overlay on 3D objects when clicked (CPU, RAM, storage, IP)
- [ ] Overlay info as SciFi bubble/tooltip on 3D object with connecting line/dot
- [ ] Make 3D objects glow when online, dim/engrave when offline
- [ ] Add selection and hover animations
- [ ] Draw router (AT&T BGW320) as 3D object
- [ ] Visualize network connections as flowing glowing pipes between objects
- [ ] Show IP addresses, bandwidth info on network connections
- [ ] Create 3D ArgoCD logo object (glassy texture, interactive, rotatable)
- [ ] Place app 3D objects connected together in creative layout
- [ ] Add more logos and branding to 3D objects
- [ ] Keep iterating with screenshot testing for best UX

## MEDIUM — Config & Cleanup
- [ ] Merge .cursorrules into CLAUDE.md (verify which hardware specs are correct first)
- [ ] Reconcile hardware specs: .cursorrules says Minisforum M2 Ultra 7 356H 32GB DDR5 vs CLAUDE.md says Apple M2 Mac Mini 24GB
- [ ] Update data.ts with correct hardware specs
- [ ] Delete .cursorrules after merging into CLAUDE.md

## MEDIUM — Security
- [ ] Add security contexts to SimpleFIN CronJob
- [ ] Add security contexts to APITable MySQL
- [ ] Review PodSecurity exemptions (12 namespaces too many)
- [ ] Fix SimpleFIN using :latest image tag
- [ ] Disable SSH root login on migration bridges
- [ ] Fix etcd metrics listening on 0.0.0.0:2381

## LOW — Future Work
- [ ] vCluster: add vc-prod, vc-dev, vc-staging as kubectl contexts
- [ ] Move more services to vc-prod
- [ ] Set up Tailscale MagicDNS for remote access
- [ ] Consider Let's Encrypt certs for public domains (if desired)
- [ ] Dashboard: add real-time metrics from Prometheus API
- [ ] Dashboard: add log viewer from Loki
- [ ] Dashboard: add ArgoCD sync status indicators

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
