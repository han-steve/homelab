# Homelab Migration Plan

## Overview

Migrate from Intel NUC (`steve-homelab`, 192.168.1.100) to Minisforum M2 (Intel Series 3), with Talos Linux Kubernetes cluster. The GPU node (`steve-gpu-node`, 192.168.1.101) serves as interim backup storage and will become a Talos worker node.

---

## Current Infrastructure

### Old Server — Intel NUC (`steve-homelab` / 192.168.1.100)

- **OS**: Debian 12 (bookworm)
- **Storage**:
  - `sda` (953.9G) — boot + root (75G used)
  - `sdb` (1.9T) — mounted at `/mnt/data` (219G used — Jellyfin media library)
- **K3S**: installed but **inactive**
- **Docker**: running multiple containers

#### Running Docker Services

| Service | Status | Image | Data Location |
|---------|--------|-------|---------------|
| Actual Budget | Running (healthy) | `actualbudget/actual-server:latest` | `/opt/actual/` (552M) |
| Jellyfin | Running (healthy) | `jellyfin/jellyfin` | Config: `/opt/jellyfin/` (16K), Media: `/mnt/data/jellyfin/` (219G) |
| WireGuard | Running | `linuxserver/wireguard:latest` | `/opt/wireguard-server/` (224K) |
| APITable | Running (unhealthy) | Multiple containers | `/home/stevehan/apps/apitable-docker/` (1.6G), `/home/stevehan/apps/apitable/` (2.9G) |
| QBitTorrent VPN | Stopped | `binhex/arch-qbittorrentvpn` | `/opt/qbit-vpn-server/` (12M) |
| OpenVPN | Stopped | `openvpn/openvpn-as` | `/opt/openvpn/` |
| MySQL (APITable) | Running (healthy) | `mysql:8.0.32` | Docker-managed volume |
| Redis (APITable) | Restarting | `redis:7.0.8` | Docker-managed volume |
| MinIO (APITable) | Running (healthy) | `minio/minio` | Docker-managed volume |
| RabbitMQ (APITable) | Running | `rabbitmq:3.11.9-management` | Docker-managed volume |

#### Kubernetes Data (K3S inactive, but data exists)

| Path | Size | Description |
|------|------|-------------|
| `~/k8s-storage/prometheus/prometheus-db/` | 3.6G | **Prometheus TSDB — financial history data** (actively written, latest block May 24) |
| `~/k8s-storage/prod-vcluster/` | 2.4G | Production vcluster data |
| `~/k8s-storage/stage-vcluster/` | 166M | Stage vcluster data |
| `~/k8s-storage/dev-vcluster/` | 92M | Dev vcluster data |

#### Other Important Data

| Path | Size | Description |
|------|------|-------------|
| `~/repos/` | 149M | Git repos: dotfiles, homelab, simplefin-bridge-exporter |
| `~/data/etc/` | 307M | System data / configs |
| `~/apps/AppFlowy-Cloud/` | 12M | AppFlowy Cloud setup |
| `~/apps/PIA/` | — | PIA VPN configs |
| `~/.kube/config` | — | K3S kubeconfig |
| `~/.claude/`, `~/.claude.json` | — | Claude CLI config |
| `~/.zshrc → repos/dotfiles/` | — | Dotfiles (symlinked) |

#### Key Database Files

- **Actual Budget SQLite**: `/opt/actual/packages/sync-server/actual-data/user-files/*.sqlite` (budget data)
- **Actual Budget Account DB**: `/opt/actual/packages/sync-server/actual-data/server-files/account.sqlite`
- **MySQL (APITable)**: Running in Docker container `mysql`, databases need to be dumped

### GPU Node (`steve-gpu-node` / 192.168.1.101)

- **OS**: Linux (Ubuntu/Debian)
- **Motherboard**: ASUS PRIME Z390-A (LGA1151, ATX)
  - M.2_1: PCIe 3.0 x4 **AND** SATA mode ← NUC's SATA M.2 drives CAN go here
  - M.2_2: PCIe 3.0 x4 only (NVMe only)
  - 6× SATA 6Gb/s ports
- **RAM**: 2×16GB TEAMGROUP DDR4-3200 (slots A2+B2); A1+B1 empty
- **Storage**:
  - `sda` (931.5G Samsung 870 EVO 1TB SATA) — boot + root (35G used, 833G available)
  - `sdb` (894.3G ADATA SU650 SATA) — old Windows drive (unmounted, NTFS)
  - **`nvme0n1` (931.5G Crucial CT1000P3PSSD8 NVMe) — formatted ext4, mounted `/mnt/backup`**
- **GPU**: NVIDIA RTX 3080 Ti (GA102, 12GB VRAM)
- **PSU**: 1000W

---

## Migration Phases

### Phase 1: Prepare Backup Target (GPU Node NVMe)

Format and mount the NVMe drive on the GPU node for receiving backups.

```bash
# On GPU node (192.168.1.101)
# 1. Partition NVMe
sudo parted /dev/nvme0n1 mklabel gpt
sudo parted /dev/nvme0n1 mkpart primary ext4 0% 100%

# 2. Format
sudo mkfs.ext4 -L homelab-backup /dev/nvme0n1p1

# 3. Create mount point and mount
sudo mkdir -p /mnt/backup
sudo mount /dev/nvme0n1p1 /mnt/backup
sudo chown stevehan:stevehan /mnt/backup

# 4. Add to fstab for persistence
echo 'LABEL=homelab-backup /mnt/backup ext4 defaults 0 2' | sudo tee -a /etc/fstab
```

### Phase 2: Backup Data from Old Server

**Estimated total: ~236G** (mostly Jellyfin media). NVMe has 931.5G — plenty of room.

#### Step 2.1: Stop services to ensure data consistency

```bash
# On old server (192.168.1.100)
# Stop Docker containers to get clean database snapshots
docker stop sync-server-actual_server-1 jellyfin wireguard
docker compose -f /home/stevehan/apps/apitable-docker/docker-compose.yaml down
docker stop qbittorrentvpn
```

#### Step 2.2: Dump MySQL databases (APITable)

```bash
# On old server
docker exec mysql mysqldump -u root -ppassword --all-databases > /tmp/apitable-mysql-dump.sql
```

#### Step 2.3: Rsync all data to GPU node NVMe

```bash
# From old server → GPU node NVMe
# Run from old server, or from GPU node pulling

# Option A: Run from a machine that can reach both (e.g., your Mac or the GPU node)
# Below assumes running from GPU node:

# Jellyfin media (largest — 219G)
rsync -avz --progress stevehan@192.168.1.100:/mnt/data/jellyfin/ /mnt/backup/jellyfin-media/

# Application configs and data
rsync -avz --progress stevehan@192.168.1.100:/opt/actual/ /mnt/backup/opt/actual/
rsync -avz --progress stevehan@192.168.1.100:/opt/jellyfin/ /mnt/backup/opt/jellyfin/
rsync -avz --progress stevehan@192.168.1.100:/opt/wireguard-server/ /mnt/backup/opt/wireguard-server/
rsync -avz --progress stevehan@192.168.1.100:/opt/qbit-vpn-server/ /mnt/backup/opt/qbit-vpn-server/
rsync -avz --progress stevehan@192.168.1.100:/opt/openvpn/ /mnt/backup/opt/openvpn/

# K8S storage (Prometheus financial data, vclusters)
rsync -avz --progress stevehan@192.168.1.100:/home/stevehan/k8s-storage/ /mnt/backup/k8s-storage/

# Home directory important folders
rsync -avz --progress stevehan@192.168.1.100:/home/stevehan/repos/ /mnt/backup/home/repos/
rsync -avz --progress stevehan@192.168.1.100:/home/stevehan/apps/ /mnt/backup/home/apps/
rsync -avz --progress stevehan@192.168.1.100:/home/stevehan/data/ /mnt/backup/home/data/
rsync -avz --progress stevehan@192.168.1.100:/home/stevehan/.kube/ /mnt/backup/home/.kube/
rsync -avz --progress stevehan@192.168.1.100:/home/stevehan/.claude/ /mnt/backup/home/.claude/
rsync -avz --progress stevehan@192.168.1.100:/home/stevehan/.claude.json /mnt/backup/home/

# MySQL dump
rsync -avz --progress stevehan@192.168.1.100:/tmp/apitable-mysql-dump.sql /mnt/backup/databases/
```

#### Step 2.4: Verify backup integrity

```bash
# On GPU node
# Compare file counts and sizes
ssh stevehan@192.168.1.100 'du -sh /mnt/data/jellyfin /opt/actual /home/stevehan/k8s-storage'
du -sh /mnt/backup/jellyfin-media /mnt/backup/opt/actual /mnt/backup/k8s-storage

# Verify Actual Budget SQLite databases are valid
sqlite3 /mnt/backup/opt/actual/packages/sync-server/actual-data/server-files/account.sqlite "SELECT count(*) FROM sqlite_master;"

# Verify Prometheus data
ls -la /mnt/backup/k8s-storage/prometheus/prometheus-db/

# Check backup inventory
find /mnt/backup -maxdepth 2 -type d | head -30
du -sh /mnt/backup/*/
```

### Phase 3: Export Prometheus Data (Financial History)

The Prometheus TSDB data in `~/k8s-storage/prometheus/prometheus-db/` contains financial history. To make it portable:

```bash
# Option 1: Keep the raw TSDB (already copied in Phase 2)
# The TSDB blocks are self-contained and can be loaded by any Prometheus instance

# Option 2: Additionally export key metrics as JSON/CSV using promtool
# If promtool is available on the old server:
# promtool tsdb dump /home/stevehan/k8s-storage/prometheus/prometheus-db/ > /tmp/prometheus-dump.txt

# The raw TSDB copy from Phase 2 is sufficient for restoration
```

### Phase 4: Wipe Old Server (Intel NUC)

> **CHECKPOINT**: Before proceeding, verify ALL data on GPU node NVMe. Run the verification commands from Step 2.4.

```bash
# Power off the old server
sudo shutdown -h now

# Physically:
# 1. Remove SSD from Intel NUC
# 2. Remove RAM from Intel NUC
# 3. Install SSD and RAM into Minisforum M2
```

### Phase 5: Set Up Minisforum M2 with Talos Linux

#### Hardware Compatibility Notes ⚠️

| Component | NUC has | M2 needs | Compatible? |
|-----------|---------|----------|-------------|
| RAM | 1×16GB DDR4-2133 SO-DIMM | DDR5 SO-DIMM (up to 128GB DDR5-7200) | ❌ **Must buy new DDR5 SO-DIMM** |
| Storage | 2× SATA M.2 drives | PCIe 4.0 NVMe only | ❌ **SATA M.2 won't fit** |
| NVMe backup | Crucial P3 Plus NVMe (on GPU node) | PCIe 4.0 NVMe | ✅ Compatible |

**Buy before migration**: DDR5 SO-DIMM (32GB minimum, up to 128GB). The M2 has dual SO-DIMM slots.

**Storage plan**: The NUC's SATA M.2 SSDs need to be read via USB adapter or the GPU node's M.2_1 slot (which supports SATA). Data comes from the NVMe backup on the GPU node.

#### Machine

- **Machine**: Minisforum EliteMini M2 (Intel Core Ultra 7 356H, Panther Lake, 18A process)
  - 16 cores (4P+8E+4LP), up to 5.0GHz, 25W TDP / 80W turbo
  - Dual DDR5 SO-DIMM slots (up to 128GB), dual 2.5GbE, USB4, PCIe 4.0 NVMe
- **RAM**: New DDR5 SO-DIMM required — buy 32GB+ before migration
- **SSD**: New PCIe 4.0 NVMe (or transfer Crucial P3 Plus from GPU node after backup complete)

#### Talos Linux Installation

```bash
# 1. Download Talos Linux ISO
# https://www.talos.dev/latest/introduction/getting-started/

# 2. Create bootable USB with Talos installer
# On your Mac:
curl -LO https://github.com/siderolabs/talos/releases/latest/download/metal-amd64.iso
# Flash to USB using dd or balenaEtcher

# 3. Boot Minisforum M2 from USB and install Talos

# 4. Generate Talos config
talosctl gen config homelab-cluster https://<MINISFORUM-IP>:6443

# 5. Apply config to control plane node (Minisforum M2)
talosctl apply-config --insecure --nodes <MINISFORUM-IP> --file controlplane.yaml

# 6. Bootstrap the cluster
talosctl bootstrap --nodes <MINISFORUM-IP> --endpoints <MINISFORUM-IP>

# 7. Get kubeconfig
talosctl kubeconfig --nodes <MINISFORUM-IP> --endpoints <MINISFORUM-IP>
```

### Phase 6: Join GPU Node as Talos Worker

> **Note**: This will wipe the GPU node's current OS on sda. Make sure all backup data is on the NVMe (`/mnt/backup`). The NVMe drive should be safe as Talos will install on the configured disk (sda).

```bash
# 1. Install Talos on GPU node (192.168.1.101)
# Boot from Talos USB, install to sda
# IMPORTANT: Configure Talos to install ONLY on /dev/sda, NOT /dev/nvme0n1

# 2. Apply worker config
talosctl apply-config --insecure --nodes 192.168.1.101 --file worker.yaml

# 3. After join, configure NVMe as persistent storage
# Add machine.disks config in worker.yaml:
# machine:
#   disks:
#     - device: /dev/nvme0n1
#       partitions:
#         - mountpoint: /var/mnt/backup

# 4. Configure GPU passthrough if needed for compute workloads
```

### Phase 7: Restore Services on Talos Cluster

#### Priority Order for Restoration

1. **Actual Budget** — Active daily use (budget tracking)
2. **Prometheus + SimpleFin Exporter** — Financial data monitoring (from this repo's manifests)
3. **WireGuard** — VPN access
4. **Jellyfin** — Media server (needs NVMe data access)
5. **QBitTorrent** — P2P downloads
6. ~~APITable~~ — Low priority (project abandoned)

#### Restoration Strategy

All services should be deployed as Kubernetes workloads on Talos:

```
homelab-cluster (Talos)
├── Control Plane: Minisforum M2
│   └── Core services, Actual Budget, Prometheus, WireGuard
└── Worker: GPU Node
    └── Jellyfin (media on NVMe), QBitTorrent, GPU workloads
```

For each service:
1. Create Kubernetes manifests (Deployments, Services, PVs) 
2. Use the existing manifests in this repo where available (e.g., `prometheus-monitoring/`, `simplefin-exporter/`)
3. Mount backup data from NVMe as PersistentVolumes
4. Migrate Docker Compose configs to K8s manifests for remaining services

---

## Data Inventory Summary

| Data | Size | Source Path | Backup Path | Priority |
|------|------|-------------|-------------|----------|
| Jellyfin Media (Movies/Videos) | 219G | `/mnt/data/jellyfin/` | `/mnt/backup/jellyfin-media/` | High |
| Prometheus Financial DB | 3.6G | `~/k8s-storage/prometheus/` | `/mnt/backup/k8s-storage/prometheus/` | **Critical** |
| Actual Budget (SQLite + data) | 552M | `/opt/actual/` | `/mnt/backup/opt/actual/` | **Critical** |
| Prod vcluster data | 2.4G | `~/k8s-storage/prod-vcluster/` | `/mnt/backup/k8s-storage/prod-vcluster/` | Medium |
| APITable app + Docker | 4.5G | `~/apps/apitable*` | `/mnt/backup/home/apps/` | Low |
| Git repos (dotfiles, homelab, etc.) | 149M | `~/repos/` | `/mnt/backup/home/repos/` | Medium |
| System data | 307M | `~/data/` | `/mnt/backup/home/data/` | Medium |
| WireGuard config | 224K | `/opt/wireguard-server/` | `/mnt/backup/opt/wireguard-server/` | High |
| QBitTorrent config | 12M | `/opt/qbit-vpn-server/` | `/mnt/backup/opt/qbit-vpn-server/` | Medium |
| Jellyfin config | 16K | `/opt/jellyfin/` | `/mnt/backup/opt/jellyfin/` | High |
| MySQL dump (APITable) | ~500M est. | `/tmp/apitable-mysql-dump.sql` | `/mnt/backup/databases/` | Low |
| K3S kubeconfig | — | `~/.kube/config` | `/mnt/backup/home/.kube/` | Low |
| **TOTAL** | **~236G** | | | |

---

## Progress Checklist

- [ ] **Phase 1**: Format and mount NVMe on GPU node
- [ ] **Phase 2**: Backup all data from old server
  - [ ] Stop Docker services
  - [ ] Dump MySQL databases
  - [ ] Rsync all data to NVMe
  - [ ] Verify backup integrity
- [ ] **Phase 3**: Export/verify Prometheus financial data
- [ ] **Phase 4**: Wipe old server and transfer hardware
  - [ ] Verify ALL backups are complete
  - [ ] Power off old server
  - [ ] Transfer SSD and RAM to Minisforum M2
- [ ] **Phase 5**: Install Talos Linux on Minisforum M2
  - [ ] Download and flash Talos ISO
  - [ ] Generate cluster config
  - [ ] Bootstrap control plane
- [ ] **Phase 6**: Join GPU node as Talos worker
  - [ ] Install Talos on GPU node (sda only, preserve NVMe)
  - [ ] Join cluster as worker
  - [ ] Configure NVMe as persistent storage
  - [ ] Configure GPU passthrough
- [ ] **Phase 7**: Restore services
  - [ ] Deploy Actual Budget
  - [ ] Deploy Prometheus + SimpleFin Exporter
  - [ ] Deploy WireGuard
  - [ ] Deploy Jellyfin
  - [ ] Deploy QBitTorrent
  - [ ] Migrate remaining services as needed

---

## Risk Considerations

1. **SSD form factor compatibility**: The Intel NUC SSD may not fit the Minisforum M2. Verify M.2 slot type (2280 vs 2242) and interface (NVMe vs SATA) before wiping.
2. **RAM compatibility**: Verify DDR generation and SO-DIMM form factor match.
3. **NVMe data safety during Talos install**: When installing Talos on the GPU node, explicitly target `/dev/sda` only. The NVMe with backups must not be touched.
4. **Prometheus TSDB portability**: The raw TSDB blocks should work with any compatible Prometheus version. Note the Prometheus version running on the old server.
5. **WireGuard keys**: The WireGuard config directory contains private keys. These are needed to maintain existing VPN connections. Backup is included.
6. **APITable MySQL data**: The MySQL dump should be taken while the container is running to ensure consistency. Consider `--single-transaction` flag.
