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

---

## 2.5 GbE Apartment Topology Recommendation

**Question**: How to best take advantage of the M2's two 2.5 GbE ports with the AT&T BGW320?

### Recommended Setup

```
Internet (AT&T fiber, up to 5Gbps)
    ↓
AT&T BGW320 (1× 5GbE WAN, 1× 5GbE LAN, 3× 1GbE LAN)
    ↓ 5GbE LAN port (auto-negotiates 2.5 GbE with the switch)
TP-Link TL-SG108-M2 (8-port 2.5 GbE switch, ~$80)
    ├── M2 enp44s0  (2.5 GbE) ← Kubernetes + Cilium LB-IPAM (current)
    ├── M2 enp45s0  (2.5 GbE) ← Bond with enp44s0 OR dedicated storage/VLAN
    ├── GPU node    (1 GbE)   ← After Talos, Longhorn replication node
    ├── Mac         (2.5 GbE via Thunderbolt adapter)
    └── Other devices (1 GbE) ← NAS, IoT hub, etc.
```

### Key Points

| Point | Detail |
|-------|--------|
| **BGW320 5GbE LAN port** | Connects to the 2.5 GbE switch. The switch auto-negotiates 2.5 GbE (not 5 GbE). For home use this is fine — inter-device traffic is LAN-switched (doesn't traverse BGW320), so the 2.5 GbE to BGW320 only matters for internet throughput. |
| **M2 dual 2.5 GbE** | Two options: (a) LACP bond = up to 5 Gbps aggregate to multiple clients simultaneously, or (b) VLAN separation: enp44s0 = services/LAN, enp45s0 = storage VLAN (Longhorn replication). For a single-node homelab, LACP bond is simpler. |
| **GPU node is 1 GbE** | This bottlenecks Longhorn replication between M2 and GPU node to 1 Gbps. For media storage (Jellyfin 100Gi PVC), replication speed is acceptable. |
| **Mac adapter** | Need a Thunderbolt 3/4 or USB-C 2.5 GbE adapter. Recommended: TP-Link UE306 ($35) or Anker USB-C 2.5G ($30). Avoid USB 3.0 adapters — they cap at 1 GbE. |
| **Internet speed** | AT&T residential fiber is typically 1 Gbps down/up. The 2.5 GbE switch doesn't bottleneck internet — you're limited by the WAN contract, not the LAN. |

### Recommended Switch

**TP-Link TL-SG108-M2** — 8-port unmanaged 2.5 GbE, ~$80.
Alternatives: QNAP QSW-308-1C (~$120), Netgear MS308G (~$150).

The unmanaged TP-Link is sufficient unless you need VLANs/port isolation, in which case get a managed 2.5 GbE switch.

### LACP Bond Configuration on Talos

To bond enp44s0 + enp45s0 on the M2:

```yaml
# In talos/machine-config.yaml (or patch file):
network:
  interfaces:
    - interface: bond0
      bond:
        mode: 802.3ad  # LACP
        miimon: 100
        updelay: 200
        downdelay: 200
        lacpRate: fast
        interfaces:
          - enp44s0
          - enp45s0
      dhcp: true  # Or static:
      # addresses: ["192.168.1.10/24"]
      # routes: [{network: "0.0.0.0/0", gateway: "192.168.1.254"}]
```

The BGW320/switch must have LACP enabled on the ports connected to the M2 for 802.3ad mode. For a homelab with TP-Link TL-SG108-M2 (unmanaged), use `balance-alb` or `active-backup` mode instead (no switch config needed).

