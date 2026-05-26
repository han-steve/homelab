# Split DNS + Tailscale Remote Access

## Goal

Access your homelab services by name (`grafana.homelab`) instead of by IP, both:
- **Locally** (on your home network): fast, direct connection
- **Remotely** (over Tailscale): automatic tunneling to your home network

---

## Architecture

```
Local network:
  Browser → grafana.homelab → DNS resolves to 192.168.1.13 → direct TCP

Remote (on mobile data, traveling, etc.):
  Browser → grafana.homelab → Tailscale DNS → routes to 192.168.1.13 via tunnel
              └── No VPN disconnect / reconnect needed, Tailscale handles routing
```

---

## Option A: Tailscale (Primary — Recommended)

Tailscale is already installed and working (`100.98.40.26` on Mac). This approach requires **zero infrastructure changes**.

### Step 1: Enable Tailscale MagicDNS (already on)

In Tailscale Admin → DNS → MagicDNS should be enabled. This lets your devices reach each other by hostname.

### Step 2: Add a Split DNS Override for `.homelab`

In [Tailscale Admin Console](https://login.tailscale.com/admin/dns) → **DNS** → **Add nameserver**:

1. Click **Add nameserver** → choose **Custom**
2. **IP**: `192.168.1.10` (your K8s node, CoreDNS)  
   *or use your router's IP if it handles local DNS*
3. **Restrict to domain**: `homelab`
4. Check **Override local DNS**

Now any device on Tailscale will resolve `*.homelab` via your home CoreDNS.

### Step 3: Add CoreDNS custom rewrite for .homelab

Create a ConfigMap that patches CoreDNS to answer `.homelab` queries:

```bash
kubectl apply -f infrastructure/coredns-homelab.yaml
```

The file at `infrastructure/coredns-homelab.yaml` contains rewrite rules for all services (see file).

### Step 4: How Remote Access Works

When you're away from home:
1. Connect to Tailscale (or it's already connected in the background)
2. Open `https://grafana.homelab` → Tailscale routes DNS via your home network → CoreDNS resolves → Tailscale tunnels the TCP traffic

No port forwarding. No public IP exposure. All traffic encrypted by Tailscale WireGuard.

---

## Option B: Router-Level DNS (LAN Only)

If your router supports custom DNS entries (most do):

### Unifi / pfSense / OPNsense

Add these static DNS entries:

```
actual-budget.homelab  → 192.168.1.12
grafana.homelab        → 192.168.1.13
argocd.homelab         → 192.168.1.14
apitable.homelab       → 192.168.1.15
jellyfin.homelab       → 192.168.1.11
*.homelab              → (wildcard — if supported)
```

### Generic Router (AT&T, etc.)

Most consumer routers don't support custom DNS entries. Use Option A (Tailscale) or Option C instead.

---

## Option C: CoreDNS on K8s as Home DNS Server

Expose CoreDNS as a LoadBalancer service that your router's DHCP points all devices at:

```yaml
# Add this to the CoreDNS service patch
apiVersion: v1
kind: Service
metadata:
  name: coredns-external
  namespace: kube-system
  annotations:
    lbipam.cilium.io/ips: "192.168.1.20"   # Reserve this IP for DNS
spec:
  type: LoadBalancer
  selector:
    k8s-app: kube-dns
  ports:
  - name: dns
    port: 53
    protocol: UDP
    targetPort: 53
  - name: dns-tcp
    port: 53
    protocol: TCP
    targetPort: 53
```

Then configure your router's DHCP to hand out `192.168.1.20` as the DNS server for all devices.

**Pros**: Works on ALL devices, no Tailscale needed for LAN access  
**Cons**: Single point of failure for DNS; if K8s goes down, no DNS

---

## CoreDNS Homelab Config

```yaml
# infrastructure/coredns-homelab.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: coredns-custom
  namespace: kube-system
data:
  homelab.server: |
    homelab {
      hosts {
        192.168.1.11  jellyfin.homelab
        192.168.1.12  actual-budget.homelab
        192.168.1.13  grafana.homelab
        192.168.1.14  argocd.homelab
        192.168.1.15  apitable.homelab
        fallthrough
      }
      log
    }
```

Apply and reload:
```bash
kubectl apply -f infrastructure/coredns-homelab.yaml
kubectl rollout restart deployment/coredns -n kube-system
```

---

## Setting Up /etc/hosts (Quick Manual Option)

For the Mac only, instant no-infra option:

```bash
# Add to /etc/hosts:
192.168.1.11  jellyfin.homelab
192.168.1.12  actual-budget.homelab
192.168.1.13  grafana.homelab
192.168.1.14  argocd.homelab
192.168.1.15  apitable.homelab
```

---

## Tailscale Exit Node (Full Remote Access)

For full LAN access from anywhere (not just DNS):

1. On the K8s node (Talos), set up Tailscale as a subnet router:

```bash
# In Talos machine config, add Tailscale operator (already in infrastructure/tailscale-operator/)
# Then advertise the home subnet:
tailscale up --advertise-routes=192.168.1.0/24
# Approve in Tailscale Admin → Machines → Routes
```

2. On your Mac/phone, enable subnet routes in Tailscale settings.

Now `https://192.168.1.13` (Grafana) works from anywhere over Tailscale. Combined with split DNS, `https://grafana.homelab` also works from anywhere.

---

## TLS on Remote Access

Since all services use `homelab-ca` certs that your Mac/phone already trust (after running `scripts/trust-local-ca.sh`), HTTPS works seamlessly whether you're home or remote via Tailscale. No cert warnings anywhere.

```
Remote access flow:
  https://grafana.homelab
    → Tailscale resolves DNS (via home CoreDNS)
    → Tailscale routes TCP to 192.168.1.13
    → Grafana responds with cert signed by homelab-ca
    → Browser trusts homelab-ca (installed via trust-local-ca.sh)
    → Green lock. ✓
```
