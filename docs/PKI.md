# Homelab PKI — TLS Certificate Management

## Why This Matters

Self-hosted apps deserve real TLS — not "accept this certificate?" warnings every time you open your browser. This setup gives you **browser-trusted HTTPS** on all local services, auto-renewing certs, and no Let's Encrypt rate limits.

---

## Architecture

```
homelab-root-ca  (self-signed, 10 years, ECDSA P-256)
    │
    └─ homelab-ca ClusterIssuer  (cert-manager)
         ├─ actual-budget-tls    → 192.168.1.12, actual-budget.homelab
         ├─ grafana-tls          → 192.168.1.13, grafana.homelab
         ├─ argocd-tls           → 192.168.1.14, argocd.homelab
         ├─ apitable-tls         → 192.168.1.15, apitable.homelab
         └─ jellyfin-tls         → 192.168.1.11, jellyfin.homelab
```

**Why not Let's Encrypt?**
- No public IP / no DNS ownership required
- No rate limits
- Works fully offline / on LAN
- 1-year certs auto-renewed by cert-manager (no manual work ever again)

**Why not Vault PKI?**
Vault PKI is excellent for multi-team, multi-CA, dynamic secrets, and short-lived certs. For a homelab with one person and ≤20 services, cert-manager with a local CA is simpler, already installed in our cluster, and has zero operational overhead.

*Use Vault if:* you add more clusters, need cross-cluster cert issuance, want certificate rotation under 1 hour, or need audit logging of every issued cert.

---

## Components

| Component | Location | Purpose |
|---|---|---|
| cert-manager v1.20.2 | `cert-manager` namespace | Controller, issues/renews all certs |
| `selfsigned-issuer` | ClusterIssuer | Bootstrap only — signs the root CA |
| `homelab-root-ca` | Secret in `cert-manager` | Root CA (tls.crt + tls.key) |
| `homelab-ca` | ClusterIssuer | Issues all service certs |
| Per-service Certificates | Each app namespace | 1-year, auto-renew 30 days before expiry |

---

## Initial Setup (already done)

```bash
# 1. Apply ClusterIssuers + root CA bootstrap
kubectl apply -f infrastructure/cert-manager/clusterissuers.yaml

# 2. Apply service certificates
kubectl apply -f infrastructure/cert-manager/service-certificates.yaml
kubectl apply -f apps/actual-budget/certificate.yaml

# 3. Verify all certs are READY=True
kubectl get cert -A
```

---

## Trust the CA on Your Devices

### Mac (system-wide, all browsers)

```bash
# Quick way — run the helper script:
bash scripts/trust-local-ca.sh

# Manual way:
kubectl get secret homelab-root-ca -n cert-manager \
  -o jsonpath='{.data.tls\.crt}' | base64 -d > /tmp/homelab-root-ca.crt

sudo security add-trusted-cert \
  -d -r trustRoot \
  -k /Library/Keychains/System.keychain \
  /tmp/homelab-root-ca.crt
```

After this, `curl https://actual-budget.homelab:5006` works without `-k`, and Safari/Chrome show a green lock.

### iPhone / iPad

```bash
# Export the CA cert
bash scripts/trust-local-ca.sh --iphone
# This saves ~/Downloads/homelab-ca.crt and opens AirDrop
```

Then on iPhone:
1. Accept AirDrop → `homelab-ca.crt`
2. Settings → General → VPN & Device Management → *Homelab Root CA* → **Install**
3. Settings → General → About → Certificate Trust Settings → Toggle **Homelab Root CA** ON

> The second step (Certificate Trust Settings toggle) is mandatory — iOS installs the cert but doesn't fully trust it for TLS until you explicitly enable it.

### Windows (if needed)

```powershell
# Import the .crt to Trusted Root Certification Authorities
certutil -addstore "Root" homelab-root-ca.crt
```

---

## How Auto-Renewal Works

cert-manager watches all `Certificate` resources. 30 days before expiry:
1. cert-manager creates a new CertificateRequest
2. homelab-ca ClusterIssuer signs it
3. The K8s Secret is updated in-place
4. Pods reading the secret via `secretKeyRef` env vars get the new cert on next restart
   (or immediately if using a volume mount)

No manual work required.

---

## DNS Names for Services

To use `.homelab` names instead of IPs, configure your router/DNS (see `docs/SPLIT-DNS.md`).

| Service | IP | DNS Name |
|---|---|---|
| Jellyfin | 192.168.1.11 | jellyfin.homelab |
| Actual Budget | 192.168.1.12 | actual-budget.homelab |
| Grafana | 192.168.1.13 | grafana.homelab |
| ArgoCD | 192.168.1.14 | argocd.homelab |
| APITable | 192.168.1.15 | apitable.homelab |

---

## Adding a New Service

1. Create a `Certificate` in the app's namespace:

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: my-app-tls
  namespace: my-app
spec:
  secretName: my-app-tls
  issuerRef:
    name: homelab-ca
    kind: ClusterIssuer
  commonName: my-app.homelab
  dnsNames:
    - my-app.homelab
  ipAddresses:
    - 192.168.1.XX   # Your LB IP
  duration: 8760h
  renewBefore: 720h
  privateKey:
    algorithm: ECDSA
    size: 256
```

2. In your deployment, mount the secret:

```yaml
# Via env vars (for apps that read PEM directly):
env:
  - name: TLS_KEY
    valueFrom:
      secretKeyRef:
        name: my-app-tls
        key: tls.key
  - name: TLS_CERT
    valueFrom:
      secretKeyRef:
        name: my-app-tls
        key: tls.crt

# Via volume (for apps that need a file path):
volumes:
  - name: tls
    secret:
      secretName: my-app-tls
volumeMounts:
  - name: tls
    mountPath: /etc/tls
    readOnly: true
# Then point app to /etc/tls/tls.crt and /etc/tls/tls.key
```

---

## Debugging

```bash
# Check certificate status
kubectl describe cert actual-budget-tls -n actual-budget

# Check CertificateRequest (issued by cert-manager)
kubectl get certificaterequest -n actual-budget

# Check cert-manager logs
kubectl logs -l app=cert-manager -n cert-manager --tail=50

# Inspect the actual TLS cert being served
echo | openssl s_client -connect 192.168.1.12:5006 2>/dev/null | openssl x509 -noout -text | grep -E "Issuer|Subject|DNS|IP|Not"
```

---

## Future: Let's Encrypt for Public Access (via Tailscale)

When you want a public Let's Encrypt cert for a service exposed via Tailscale Funnel:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    email: your@email.com
    server: https://acme-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: tailscale   # or nginx/traefik
```

You can run both `homelab-ca` (for LAN) and `letsencrypt-prod` (for public) simultaneously.
