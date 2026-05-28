---
sidebar_position: 1
title: Cluster Overview
---

# Architecture Overview

## Hardware

**Minisforum M2** — compact mini PC running the entire stack:
- CPU: AMD Ryzen (8 cores)
- RAM: 32GB DDR5
- Storage: 1TB NVMe
- NICs: 2× 2.5GbE (enp44s0 active, enp45s0 spare)

## Software Stack

```mermaid
graph TB
    subgraph Hardware
        M2[Minisforum M2]
    end
    
    subgraph OS["Talos Linux v1.13.2"]
        K8s[Kubernetes v1.36.0]
    end
    
    subgraph Networking
        Cilium[Cilium v1.19.4<br/>CNI + LB-IPAM]
        Ingress[nginx-ingress]
        CoreDNS[homelab-dns CoreDNS]
        TS[Tailscale Operator]
    end
    
    subgraph Storage
        Longhorn[Longhorn v1.11.2]
        MinIO[MinIO S3]
    end
    
    subgraph Security
        CM[cert-manager v1.20.2]
        CA[homelab-ca<br/>ECDSA P-256]
    end
    
    subgraph GitOps
        Argo[ArgoCD v3.4.2]
        Git[GitHub Repo]
    end
    
    M2 --> K8s
    K8s --> Cilium
    K8s --> Longhorn
    K8s --> CM
    K8s --> Argo
    Argo --> Git
    Cilium --> Ingress
    Cilium --> CoreDNS
    CM --> CA
```

## Design Decisions

### Why Talos Linux?
- **Immutable OS**: No SSH, no shell — all config via API
- **Minimal attack surface**: No package manager, no user accounts
- **Declarative**: Machine config is version-controlled YAML
- **Automatic updates**: `talosctl upgrade` with zero downtime

### Why Single-Node?
- Cost-effective for personal use
- Longhorn still provides volume snapshots (just 1 replica)
- ArgoCD handles declarative state — rebuild from scratch in minutes
- GPU node (192.168.1.101) available for future expansion

### Why ArgoCD App-of-Apps?
All applications are defined as ArgoCD `Application` resources in `app-of-apps/`. A single root Application watches this directory and deploys everything:

```yaml
# ArgoCD watches app-of-apps/ with directory.recurse: true
# Each subdirectory contains an Application manifest
# Changes pushed to GitHub → ArgoCD auto-syncs
```

### Why Cilium over MetalLB?
- Cilium replaces kube-proxy, CNI, and LoadBalancer in one component
- LB-IPAM provides L2 ARP-based VIP advertisement (same as MetalLB L2)
- Single IP pool: `192.168.1.11-30`
- No separate MetalLB deployment needed
