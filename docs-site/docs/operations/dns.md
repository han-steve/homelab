---
sidebar_position: 2
title: DNS Setup
---

# DNS Configuration

## Local DNS (homelab-dns)

CoreDNS runs at `192.168.1.22` serving the `.homelab` zone.

### Configure Your Devices

**macOS**: System Settings → Network → Wi-Fi → Details → DNS → Add `192.168.1.22` as primary DNS.

**Router-level** (BGW320): Set `192.168.1.22` as primary DNS under LAN → DHCP settings. All devices on the network will automatically use it.

### Tailscale Split DNS

For remote access, Tailscale is configured with a split DNS override:
- Domain: `homelab`
- Nameserver: `192.168.1.10`
- Override local DNS: enabled

This means any Tailscale-connected device resolves `*.homelab` through the cluster's CoreDNS, whether at home or remote.

### Zone Records

```
; homelab zone
jellyfin.homelab.    IN A 192.168.1.11
budget.homelab.      IN A 192.168.1.12
grafana.homelab.     IN A 192.168.1.13
argocd.homelab.      IN A 192.168.1.14
apitable.homelab.    IN A 192.168.1.15
ha.homelab.          IN A 192.168.1.16
ocis.homelab.        IN A 192.168.1.20
```
