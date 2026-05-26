# GPU Node Setup Guide

**Hardware:** ASUS PRIME Z390-P | Intel i9-9900K | 32GB Team Group DDR4-3200 | RTX 3080 Ti  
**IP:** 192.168.1.101 (Debian 12 currently — will be Talos worker)

---

## Drive Map

| Device | Model | Size | Current State | Plan |
|--------|-------|------|---------------|------|
| `sda`  | ADATA SU650 | 894 GB | ✅ Free — backup data moved to `/home/stevehan/nuc-backup` | **→ Windows 11** (games) |
| `sdb`  | NT-2TB 2280 | 1.9 TB | ext4 (`datavolume`) | Keep as data drive |
| `sdc`  | Samsung SSD 870 EVO 1TB | 931 GB | **Current Debian Linux OS** | **→ Talos Linux** (K8s worker) |

> ✅ **`sda` is now free.** NUC backup data (12 GB) has been moved to `/home/stevehan/nuc-backup` on `sdc`.
> Windows 11 can be installed on `sda` at any time.

---

## Recommended Order

**1. Talos first → 2. Windows 11 second**

Why Talos first:
- Adds GPU to K8s cluster (CUDA workloads, AI inference)
- Windows on `sda` is independent — doesn't touch `sdc`
- ~~NUC backup data on `sda` should be migrated before Windows install~~ ✅ Done — data at `/home/stevehan/nuc-backup`

---

## ~~PART 1: Migrate NUC Backup Data from ADATA~~ ✅ Complete

NUC backup data has already been moved from `/mnt/storage` (sda) to `/home/stevehan/nuc-backup` on sdc (the Linux OS drive):

```bash
# Already done via rsync (12 GB moved)
# rsync -avz --progress /mnt/storage/ /home/stevehan/nuc-backup/ --exclude='lost+found'
```

**sda (ADATA SU650 894GB) is now empty and ready for Windows 11.**

```bash
# Prometheus TSDB history → monitoring bridge
ssh -F /dev/null stevehan@192.168.1.101 \
  "rsync -avz --progress \
    -e 'ssh -p 2222 -o StrictHostKeyChecking=no' \
    /mnt/storage/k8s-storage/prometheus/ \
    root@192.168.1.17:/data/"

# MySQL dump → apitable bridge
scp -F /dev/null -P 2222 \
  stevehan@192.168.1.101:/mnt/storage/mysql-dump.sql \
  root@192.168.1.19:/dump/apitable-mysql-dump.sql 2>/dev/null || \
ssh -F /dev/null stevehan@192.168.1.101 \
  "rsync -avz --progress \
    -e 'ssh -p 2222 -o StrictHostKeyChecking=no' \
    /mnt/storage/mysql-dump.sql \
    root@192.168.1.19:/dump/"
```

---

## PART 2: Install Talos Linux on Samsung 870 EVO (sdc)

### Prerequisites
- USB drive (≥1 GB)
- Physical access to GPU node (or iDRAC/IPMI if available)

### Step 1: Download Talos ISO

```bash
# Match the cluster version: v1.13.2
curl -LO https://github.com/siderolabs/talos/releases/download/v1.13.2/talos-amd64.iso
# Flash to USB:
sudo dd if=talos-amd64.iso of=/dev/sdX bs=4M status=progress conv=fsync
# or use: balenaEtcher / Rufus / Ventoy
```

### Step 2: Verify No Important Data on sdc

```bash
ssh -F /dev/null stevehan@192.168.1.101 "
  echo '=== /home/stevehan contents ==='
  ls -la /home/stevehan/
  du -sh /home/stevehan/
  echo '=== Anything in repos? ==='
  ls /home/stevehan/repos/ 2>/dev/null || echo 'empty'
  echo '=== Apps? ==='
  ls /home/stevehan/apps/
"
```

> `/home/stevehan/` has 7.5 GB: dev tools (.nvm, .sdkman, .gradle), VS Code Server,
> and apitable docker compose. No unique code/data — safe to wipe.

### Step 3: Get Worker Machine Config

```bash
# Get the cluster endpoint from talosctl
CLUSTER_ENDPOINT=$(talosctl config info 2>/dev/null | grep Endpoints | awk '{print $2}')
# Usually: https://192.168.1.10:6443

# Generate worker config
talosctl gen config homelab https://192.168.1.10:6443 \
  --output-dir /tmp/talos-gpu-node \
  --force

# Edit worker.yaml to customize:
# - hostname: gpu-node
# - install disk: /dev/sdc  (Samsung 870 EVO)
# - network: static IP 192.168.1.101
```

### Step 4: Boot from USB

1. Insert USB into GPU node
2. Enter BIOS (Del / F2 at startup on ASUS PRIME Z390-P)
3. **Disable Secure Boot** (or see Section below for enabling it)
4. Set boot priority to USB
5. Boot — Talos will start in "maintenance mode"

### Step 5: Apply Config and Install

```bash
# Find the GPU node's temporary IP (check DHCP leases or use nmap)
GPU_TEMP_IP="192.168.1.101"  # or whatever DHCP assigned

# Apply worker config
talosctl apply-config \
  --nodes "$GPU_TEMP_IP" \
  --file /tmp/talos-gpu-node/worker.yaml \
  --insecure   # first time, no cert yet

# Talos installs to /dev/sdc and reboots
# After reboot, add to cluster:
talosctl bootstrap --nodes 192.168.1.10  # only needed once, already done
```

### Step 6: Join the Cluster

```bash
# Wait for node to come up
kubectl get nodes -w

# Label the GPU node
kubectl label node gpu-node \
  kubernetes.io/role=worker \
  nvidia.com/gpu=present

# Taint if you want GPU-only workloads there
kubectl taint node gpu-node nvidia.com/gpu=present:NoSchedule
```

### Step 7: NVIDIA GPU Support on Talos

```bash
# Talos needs a system extension for NVIDIA
# Reference: https://github.com/siderolabs/extensions/tree/main/nvidia-gpu

# In the machine config, add system extension:
# extensions:
#   - image: ghcr.io/siderolabs/nvidia-container-toolkit:560.35.05
#   - image: ghcr.io/siderolabs/nvidia-open-gpu-kernel-modules:560.35.05

# Then apply NVIDIA device plugin:
kubectl apply -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.17.0/deployments/static/nvidia-device-plugin.yml
```

---

## PART 3: Install Windows 11 on ADATA SU650 (sda)

### After Talos is running (so you don't need the current Debian OS anymore)

### Step 1: Create Windows 11 USB

On Mac:
```bash
# Option 1: Use UUP dump (free, legal) — https://uupdump.net
# Download ISO for Windows 11 24H2

# Option 2: Download from Microsoft:
# https://www.microsoft.com/en-us/software-download/windows11

# Flash with:
brew install wimlib coreutils
# OR just use: Rufus on Windows, or Ventoy (supports Windows 11 ISOs)
```

> **Ventoy is easiest**: format USB with Ventoy, copy the .iso file, done. Boots automatically.

### Step 2: Bypass TPM 2.0 Check (if needed)

ASUS PRIME Z390-P doesn't have TPM 2.0 by default. Windows 11 requires it.

Options:
- **Enable fTPM in BIOS**: BIOS → Advanced → PCH-FW Configuration → PTT → Enable
- **Registry bypass during install** (if that doesn't work):
  1. During Windows install, press Shift+F10 to open CMD
  2. Run: `regedit`
  3. Navigate to `HKEY_LOCAL_MACHINE\SYSTEM\Setup`
  4. Create key `LabConfig` with DWORD values:
     - `BypassTPMCheck = 1`
     - `BypassSecureBootCheck = 1`
     - `BypassRAMCheck = 1`

### Step 3: Install Process

1. Enter BIOS → set boot priority to Windows USB
2. **Select `sda` (ADATA SU650)** as installation target
   - Delete all existing partitions on `sda` first
   - Let Windows create fresh partitions
3. Install Windows 11

### Step 4: After Install — GRUB/Boot Coexistence

Once Talos is on `sdc` and Windows is on `sda`:
- BIOS boot order: `sdc` (Talos) first by default
- Hold **F8** at boot to select Windows from `sda`
- Or configure BIOS to show boot menu

---

## Secure Boot on Minisforum M2 (Talos)

The Minisforum M2 (192.168.1.10) currently has Talos installed **without secure boot**. To enable it properly:

### Option 1: Disable Secure Boot (Current State — Fine for Homelab)

If secure boot is currently disabled or causing issues, the simplest fix is to ensure it stays disabled:
1. BIOS → Security → Secure Boot → **Disabled**
2. Done. Talos boots fine without secure boot.

### Option 2: Enable Secure Boot with Talos (Advanced)

Talos v1.13.2 supports secure boot via UKI (Unified Kernel Image). Steps:

```bash
# 1. Generate a Talos UKI image with secure boot support
docker run --rm -v /tmp/secureboot:/secureboot \
  ghcr.io/siderolabs/imager:v1.13.2 \
  secureboot-installer \
  --arch amd64

# 2. The output includes a secure boot signing certificate
# 3. Enroll the certificate in BIOS:
#    BIOS → Security → Secure Boot → Key Management → Enroll Custom Key
#    (import the generated .cer file from a USB drive)

# 4. Reinstall Talos using the UKI image
# 5. Boot with Secure Boot enabled
```

This requires physical access to enroll the key. Only worth doing if you need secure boot for compliance reasons.

---

## GPU Node BIOS Reference

| Field | Value |
|-------|-------|
| Vendor | American Megatrends Inc. (AMI) |
| Version | 3006 |
| Release Date | October 12, 2021 |
| Motherboard | ASUS PRIME Z390-P |
| CPU Socket | LGA1151 (Intel 8th/9th gen) |
| PCIe x16 | GPU: RTX 3080 Ti (slot 1) |
| M.2 slots | M2_1: PCIe + SATA; M2_2: PCIe only |
| USB BIOS Flashback | Yes (port near I/O shield) |
| UEFI/Legacy | UEFI |

**To enter BIOS:** Press **Del** or **F2** during POST  
**Boot menu:** Press **F8** during POST  
**USB flashback:** See ASUS manual for BIOS update via USB without CPU  

---

## Hardware Summary

### GPU Node (192.168.1.101 — current hostname: steve-gpu-node on Debian 12, will become: gpu after Talos migration)

| Component | Spec |
|-----------|------|
| CPU | Intel Core i9-9900K @ 3.60 GHz (8C/16T, Coffee Lake) |
| RAM | 32 GB |
| GPU | NVIDIA GeForce RTX 3080 Ti 12 GB (GA102, ASUS) |
| GPU Driver | 560.35.05 (CUDA 12.6) |
| Motherboard | ASUS PRIME Z390-P |
| BIOS | AMI v3006 (Oct 2021) |
| OS (current) | Debian 12 Bookworm |
| OS (target) | Talos Linux v1.13.2 (sdc) + Windows 11 (sda) |

### Minisforum M2 (m2, 192.168.1.10)

| Component | Spec |
|-----------|------|
| CPU | Intel Core Ultra 7 356H (16C, Meteor Lake) |
| RAM | 32 GB DDR5-4800 (Corsair CMSX32GX5M1A4800C40) |
| Storage | 1 TB Crucial NVMe P3 Plus (CT1000P3PSSD8) |
| OS | Talos Linux v1.13.2 |
| K8s | v1.36.0 |
