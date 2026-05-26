# Networking Architecture

This document covers the homelab's networking stack: Cilium LB-IPAM, AT&T BGW320 setup, and Tailscale VPN.

---

## Physical Network

```
Internet
   │
AT&T BGW320 (192.168.1.254 gateway)
   │ (2.5 GbE LAN)
   ├── Minisforum M2 (192.168.1.10) — Kubernetes node
   │     ├── enp44s0  ← Cilium LB-IPAM (announces VIPs via L2 ARP)
   │     └── enp45s0  ← free (unused)
   └── GPU Node (192.168.1.101) — pending Talos migration
```

### Static IP Assignment (AT&T BGW320)

Configure DHCP reservations in BGW320 admin (http://192.168.254.254):

| Device | MAC | IP |
|--------|-----|----|
| Minisforum M2 | 84:47:09:6A:91:xx | 192.168.1.10 |
| GPU Node | (check via ARP) | 192.168.1.101 |

---

## Cilium LB-IPAM

Cilium handles LoadBalancer IP allocation (replaces MetalLB):

- **Pool**: `192.168.1.11–20` (10 IPs reserved for services)
- **Interface**: `enp44s0` (2.5 GbE)
- **Mode**: L2 ARP announcement
- **Config**: [`infrastructure/cilium/cilium-lb-pool.yaml`](../infrastructure/cilium/cilium-lb-pool.yaml)

### Current Allocations

| IP | Service |
|----|---------|
| 192.168.1.11 | Jellyfin |
| 192.168.1.12 | Actual Budget |
| 192.168.1.13 | Grafana |
| 192.168.1.14 | ArgoCD |
| 192.168.1.15 | APITable |
| 192.168.1.16–20 | Available |

To assign a specific IP to a service, add this annotation to the Service:
```yaml
annotations:
  lbipam.cilium.io/ips: "192.168.1.16"
```

---

## AT&T BGW320 Configuration

### Port Forwarding for Tailscale Direct P2P

To enable direct Tailscale peer connections (no DERP relay):

1. Open http://192.168.254.254
2. Go to **Firewall → IP Passthrough** or **Firewall → Port Forwarding**
3. Add rule:
   - Protocol: UDP
   - External port: 41641
   - Internal IP: 192.168.1.10
   - Internal port: 41641
4. Verify with: `tailscale status` — should show `direct` not `relay`

### DNS

AT&T BGW320 does not support custom DNS entries. For `.homelab` domain resolution:
- Use **Tailscale + CoreDNS** (see [SPLIT-DNS.md](SPLIT-DNS.md))
- Or add `/etc/hosts` entries on individual devices

---

## Tailscale VPN

Tailscale Operator is deployed as `infrastructure/tailscale-operator/`. It provides:

1. **Remote access**: Access all services from anywhere via Tailscale
2. **Subnet router**: Advertises `192.168.1.0/24` so all LAN IPs are reachable remotely
3. **Split DNS**: Routes `*.homelab` DNS queries through CoreDNS

### Tailscale IP Ranges

Tailscale uses `100.64.0.0/10` (CGNAT range) for its mesh network. Your M2 node will have a `100.x.x.x` Tailscale IP once connected.

### Setup

See [infrastructure/tailscale-operator/values.yaml](../infrastructure/tailscale-operator/values.yaml) for full prerequisites and deployment steps.

---

## DNS Resolution Summary

| Scenario | How DNS Works |
|----------|---------------|
| On LAN | Add `/etc/hosts` or use router DNS if supported |
| Via Tailscale | Tailscale routes `*.homelab` to CoreDNS on K8s |
| CoreDNS config | [infrastructure/coredns-homelab.yaml](../infrastructure/coredns-homelab.yaml) |
