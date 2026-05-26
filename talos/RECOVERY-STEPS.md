# Talos Recovery Steps - Minisforum M2

This documents how to recover or rebuild the M2 control-plane node from scratch.
The node runs Talos Linux (no SSH -- all operations via talosctl).

## Prerequisites

- `talosctl` installed on your workstation
- `talos/controlplane.yaml` from 1Password (generated from talos/secrets.yaml)
- `talos/talosconfig` from 1Password
- Talos v1.13.2 secureboot ISO flashed to USB

## Hardware Reference

| Item | Value |
|------|-------|
| Node | Minisforum M2 |
| Static IP | 192.168.1.10 (configured in controlplane.yaml patches) |
| Boot drive | /dev/nvme0n1 (Crucial P3 Plus 1TB NVMe) |
| Schematic | talos/schematic-m2.yaml |

---

## Step 1: Boot from USB

1. Plug USB into M2
2. Power on, press **F7** (or F11/Del) for boot menu
3. Select the USB drive
4. Secure Boot is in Setup Mode: Talos auto-enrolls its signing keys
5. Wait for **Talos maintenance mode** on screen

## Step 2: Find the temporary DHCP IP

```bash
arp -a | grep "84:47"
# Or check AT&T BGW320 at http://192.168.254.254 -> Device List
```

## Step 3: Apply the machine config

```bash
talosctl apply-config \
  --nodes 192.168.1.XXX \
  --endpoints 192.168.1.XXX \
  --file talos/controlplane.yaml \
  --insecure
```

The config contains the static IP patch (192.168.1.10) -- node reconfigures itself.

## Step 4: Watch the install

```bash
talosctl dmesg --nodes 192.168.1.XXX --insecure -f
# Talos installs to /dev/nvme0n1, then reboots automatically
```

## Step 5: Verify node at 192.168.1.10

```bash
# Wait ~60-90 seconds after reboot, then:
talosctl version --nodes 192.168.1.10

# Check etcd status (if re-using existing node, NOT a fresh cluster):
talosctl etcd members --nodes 192.168.1.10
# If it shows a healthy member -> skip bootstrap
# If error/empty -> proceed to bootstrap
```

## Step 6: Bootstrap etcd (ONLY for fresh cluster)

> WARNING: Only run bootstrap once per cluster lifetime.
> Running bootstrap on an existing cluster corrupts etcd.

```bash
talosctl bootstrap --nodes 192.168.1.10
# Wait ~2 minutes for Kubernetes API to come up
kubectl get nodes  # should show m2 as Ready
```

## Step 7: Restore kubeconfig

```bash
talosctl kubeconfig --nodes 192.168.1.10 --force ~/.kube/config
kubectl get nodes
kubectl get pods -A | grep -v Running | grep -v Completed
```

## Step 8: Wait for ArgoCD to sync

ArgoCD auto-syncs all applications from git after the node is healthy:

```bash
kubectl get applications -n argocd
# All should be Synced + Healthy within ~5-10 minutes
```

## Step 9: Troubleshoot stuck services

```bash
# Longhorn pods not Running:
kubectl get pods -n longhorn-system | grep -v Running

# cert-manager certs stuck:
kubectl get certificaterequests -A
kubectl describe certificate <name> -n <namespace>

# Force ArgoCD hard refresh:
kubectl patch application <name> -n argocd \
  -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"hard"}}}' \
  --type merge
```

## AT&T BGW320 Static DHCP Reservation

Ensure M2 always gets 192.168.1.10:

1. Go to http://192.168.254.254
2. Home Network > IP Allocation
3. Add static lease: MAC 84:47:09:6A:91:xx -> 192.168.1.10, Name: m2

## Schematic ID

The Talos image schematic for M2 is in `talos/schematic-m2.yaml`.
Submit to factory.talos.dev to get the installer URL for the extension set:
intel-ucode, iscsi-tools, util-linux-tools.
