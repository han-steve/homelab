#!/usr/bin/env bash
# Talos Cluster Bootstrap Script - Homelab
# M2 control plane node: Minisforum M2 (Intel Core Ultra 7 356H, 32GB DDR5)
# Target static IP: 192.168.1.10 (configured via patches/m2-node.yaml)
#
# NOTE: This script documents the ORIGINAL cluster setup. For disaster recovery,
# see talos/RECOVERY-STEPS.md instead. Run sections in order. Each section is
# idempotent where possible. NEVER run the entire script at once.
#
# Current stack (as of 2024): Cilium (CNI + LB-IPAM), Longhorn, cert-manager,
# External Secrets Operator (1Password Connect), ArgoCD (GitOps).
# MetalLB was used during initial bootstrap and has since been replaced by Cilium LB-IPAM.

set -euo pipefail
HOMELAB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TALOS_DIR="${HOMELAB_DIR}/talos"
TALOSCONFIG="${TALOS_DIR}/talosconfig"

###############################################################################
# SECTION 1: Gitignore secrets (run first, before any secrets are generated)
###############################################################################
section1_gitignore() {
  echo "=== Section 1: Gitignoring generated secrets and configs ==="
  cd "${HOMELAB_DIR}"
  cat >> .gitignore << 'EOF'

# Talos — generated secrets and configs (store secrets.yaml in 1Password)
talos/secrets.yaml
talos/controlplane.yaml
talos/worker.yaml
talos/talosconfig
EOF
  echo "Done. Verify with: cat .gitignore"
}

###############################################################################
# SECTION 2: Generate secrets bundle
# Store talos/secrets.yaml in 1Password immediately after creation!
###############################################################################
section2_gen_secrets() {
  echo "=== Section 2: Generating secrets bundle ==="
  talosctl gen secrets -o "${TALOS_DIR}/secrets.yaml"
  echo "IMPORTANT: Back up talos/secrets.yaml to 1Password now before continuing!"
  echo "           1Password item: 'Talos Cluster Secrets — homelab'"
  echo ""
  echo "Press Enter once backed up to continue..."
  read -r
}

###############################################################################
# SECTION 3: Get M2 schematic ID from Image Factory
###############################################################################
section3_schematic() {
  echo "=== Section 3: Getting M2 schematic ID from factory.talos.dev ==="
  M2_SCHEMATIC=$(curl -sX POST --data-binary @"${TALOS_DIR}/schematic-m2.yaml" \
    https://factory.talos.dev/schematics | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  echo "M2 Schematic ID: ${M2_SCHEMATIC}"
  # Save for use in later sections
  echo "${M2_SCHEMATIC}" > "${TALOS_DIR}/.m2-schematic-id"
  export M2_SCHEMATIC
}

###############################################################################
# SECTION 4: Generate Talos machine configs
###############################################################################
section4_gen_config() {
  echo "=== Section 4: Generating Talos machine configs ==="
  M2_SCHEMATIC=$(cat "${TALOS_DIR}/.m2-schematic-id")

  talosctl gen config homelab https://192.168.1.10:6443 \
    --with-secrets "${TALOS_DIR}/secrets.yaml" \
    --output "${TALOS_DIR}/" \
    --force \
    --install-image "factory.talos.dev/installer/${M2_SCHEMATIC}:v1.13.2" \
    --config-patch @"${TALOS_DIR}/patches/all-nodes.yaml" \
    --config-patch-control-plane @"${TALOS_DIR}/patches/controlplane.yaml" \
    --config-patch-control-plane @"${TALOS_DIR}/patches/m2-node.yaml"

  echo "Generated: controlplane.yaml, worker.yaml, talosconfig"

  # talosctl gen config adds a HostnameConfig doc with "auto: stable" by default.
  # Replace it with a static hostname so the node is named "m2" (not auto-generated).
  sed -i '' 's/^auto: stable$/hostname: m2/' "${TALOS_DIR}/controlplane.yaml"

  # Verify the config is valid
  talosctl validate --config "${TALOS_DIR}/controlplane.yaml" --mode metal
  echo "Config validation passed."
}

###############################################################################
# SECTION 5: Apply config to M2 node (find temp DHCP IP first)
# This will WIPE nvme0n1 and install Talos. Node reboots to 192.168.1.10.
# REMOVE THE USB AFTER INSTALL COMPLETES (or set NVMe as first boot in BIOS)
###############################################################################
section5_apply_config() {
  # Find temp DHCP IP: arp -a | grep "84:47"  OR check AT&T BGW320 at http://192.168.254.254
  echo "Enter the M2 temporary DHCP IP (from arp -a or AT&T router device list):"
  read -r M2_DHCP_IP
  echo "=== Section 5: Applying controlplane config to M2 at ${M2_DHCP_IP} ==="
  echo "WARNING: This will WIPE /dev/nvme0n1 on the M2 node."
  echo "Press Ctrl+C to abort, or Enter to continue..."
  read -r

  talosctl apply-config \
    --insecure \
    --nodes "${M2_DHCP_IP}" \
    --file "${TALOS_DIR}/controlplane.yaml"

  echo "Config applied. Node is now installing Talos to nvme0n1."
  echo "Monitor install progress: watch -n2 'talosctl dmesg --insecure --nodes ${M2_DHCP_IP} 2>/dev/null | tail -20'"
  echo ""
  echo "Node will reboot and come up at 192.168.1.10 after installation."
  echo ""
  echo "NETWORK DETAILS:"
  echo "  Gateway:     192.168.1.254  (AT&T BGW320 LAN interface)"
  echo "  DNS:         192.168.1.254"
  echo "  Static IP:   192.168.1.10  (configured via patches/m2-node.yaml)"
  echo ""
  echo "IMPORTANT: Remove the USB drive (or BIOS will try to boot from it again)."
}

###############################################################################
# SECTION 6: Configure talosctl client
# Run after node reboots to 192.168.1.10
###############################################################################
section6_configure_talosctl() {
  echo "=== Section 6: Configuring talosctl ==="
  # Merge into default talosconfig
  talosctl config merge "${TALOSCONFIG}"
  talosctl config endpoint 192.168.1.10
  talosctl config node 192.168.1.10

  echo "Waiting for Talos API to be responsive at 192.168.1.10..."
  until talosctl version --nodes 192.168.1.10 &>/dev/null; do
    echo "  Waiting..."
    sleep 5
  done
  echo "Talos API is up."
  talosctl version --nodes 192.168.1.10
}

###############################################################################
# SECTION 7: Bootstrap etcd (run EXACTLY ONCE)
###############################################################################
section7_bootstrap() {
  echo "=== Section 7: Bootstrapping etcd (once) ==="
  echo "This initializes etcd. Run ONCE only — never re-run on an existing cluster."
  echo "Press Ctrl+C to abort, or Enter to continue..."
  read -r

  talosctl bootstrap --nodes 192.168.1.10

  echo "Bootstrap initiated. Waiting for API server to become ready..."
  sleep 30
  until talosctl health --nodes 192.168.1.10 2>&1 | grep -q "waiting to join"; do
    echo "  Cluster coming up... (phase: CNI not yet installed)"
    sleep 10
  done
  echo "etcd bootstrapped. Cluster is in phase: waiting for CNI."
}

###############################################################################
# SECTION 8: Get kubeconfig
###############################################################################
section8_kubeconfig() {
  echo "=== Section 8: Getting kubeconfig ==="
  talosctl kubeconfig --nodes 192.168.1.10 --force
  echo "kubeconfig merged. Current context:"
  kubectl config current-context
  echo ""
  echo "Nodes (expect NotReady — no CNI yet):"
  kubectl get nodes
}

###############################################################################
# SECTION 9: Install Cilium (required before cluster becomes Ready)
# The cluster is stuck in phase 18/19 until a CNI is installed.
###############################################################################
section9_cilium() {
  echo "=== Section 9: Installing Cilium ==="
  helm repo add cilium https://helm.cilium.io/ --force-update
  helm repo update cilium

  CILIUM_VERSION=$(helm search repo cilium/cilium --output json | \
    python3 -c "import sys,json; print(json.load(sys.stdin)[0]['version'])")
  echo "Installing Cilium ${CILIUM_VERSION}..."

  helm install cilium cilium/cilium \
    --version "${CILIUM_VERSION}" \
    --namespace kube-system \
    --values "${TALOS_DIR}/cilium-values.yaml" \
    --wait --timeout 5m

  echo "Cilium installed. Waiting for node to become Ready..."
  kubectl wait node --all --for condition=Ready --timeout=5m
  echo "Node is Ready!"
  kubectl get nodes -o wide
}

###############################################################################
# SECTION 10: Configure Cilium LB-IPAM (replaces MetalLB)
# Cilium v1.19+ handles LoadBalancer IPs via LB-IPAM (L2 ARP mode).
# The IP pool is configured in infrastructure/cilium/cilium-lb-pool.yaml.
# No separate MetalLB installation needed.
###############################################################################
section10_cilium_lbipam() {
  echo "=== Section 10: Configuring Cilium LB-IPAM ==="
  echo "Cilium was already installed in section 9 with LB-IPAM enabled."
  echo "Applying the LB IP pool and L2 announcement policy..."
  kubectl apply -f "${HOMELAB_DIR}/infrastructure/cilium/cilium-lb-pool.yaml"
  echo "LB-IPAM configured. IP pool 192.168.1.11-20 active."
  kubectl get ciliumloadbalancerippool
}

###############################################################################
# SECTION 11: Install Longhorn
###############################################################################
section11_longhorn() {
  echo "=== Section 11: Installing Longhorn ==="
  # Verify prerequisites on each node
  talosctl get extensions --nodes 192.168.1.10 | grep -E "iscsi|util-linux"

  helm repo add longhorn https://charts.longhorn.io --force-update
  helm repo update longhorn

  helm install longhorn longhorn/longhorn \
    --namespace longhorn-system --create-namespace \
    --values "${HOMELAB_DIR}/infrastructure/longhorn/values.yaml" \
    --wait --timeout 10m

  echo "Longhorn installed."
  echo "Verify storage class: kubectl get sc"
  echo "UI: kubectl port-forward -n longhorn-system svc/longhorn-frontend 8080:80"
}

###############################################################################
# SECTION 12: Install cert-manager
###############################################################################
section12_cert_manager() {
  echo "=== Section 12: Installing cert-manager ==="
  helm repo add jetstack https://charts.jetstack.io --force-update
  helm repo update jetstack

  helm install cert-manager jetstack/cert-manager \
    --namespace cert-manager --create-namespace \
    --values "${HOMELAB_DIR}/infrastructure/cert-manager/values.yaml" \
    --wait --timeout 5m

  echo "cert-manager installed."
  kubectl get pods -n cert-manager
}

###############################################################################
# SECTION 13: Install External Secrets Operator
###############################################################################
section13_eso() {
  echo "=== Section 13: Installing External Secrets Operator ==="
  helm repo add external-secrets https://charts.external-secrets.io --force-update
  helm repo update external-secrets

  helm install external-secrets external-secrets/external-secrets \
    --namespace external-secrets --create-namespace \
    --values "${HOMELAB_DIR}/infrastructure/external-secrets/values.yaml" \
    --wait --timeout 5m

  echo "ESO installed."
  echo ""
  echo "Next: Deploy 1Password Connect and ClusterSecretStore."
  echo "      See infrastructure/external-secrets/1password-connect.yaml"
  echo "      You will need 1password-credentials.json from 1Password > Integrations."
}

###############################################################################
# SECTION 14: Install Tailscale Operator
# Requires Tailscale OAuth credentials from 1Password
###############################################################################
section14_tailscale() {
  echo "=== Section 14: Installing Tailscale Operator ==="
  echo "Enter Tailscale OAuth Client ID (from 1Password > 'Tailscale Operator OAuth'):"
  read -r TS_CLIENT_ID
  echo "Enter Tailscale OAuth Client Secret:"
  read -rs TS_CLIENT_SECRET

  helm repo add tailscale https://pkgs.tailscale.com/helmcharts --force-update
  helm repo update tailscale

  helm install tailscale-operator tailscale/tailscale-operator \
    --namespace tailscale --create-namespace \
    --values "${HOMELAB_DIR}/infrastructure/tailscale-operator/values.yaml" \
    --set-string oauth.clientId="${TS_CLIENT_ID}" \
    --set-string oauth.clientSecret="${TS_CLIENT_SECRET}" \
    --wait --timeout 5m

  echo "Tailscale Operator installed."
  echo "Services annotated with 'tailscale.com/expose=true' will appear in Tailnet."
}

###############################################################################
# SECTION 15: Install ArgoCD (GitOps takes over after this)
###############################################################################
section15_argocd() {
  echo "=== Section 15: Installing ArgoCD ==="
  helm repo add argo https://argoproj.github.io/argo-helm --force-update
  helm repo update argo

  helm install argocd argo/argo-cd \
    --namespace argocd --create-namespace \
    --values "${HOMELAB_DIR}/infrastructure/argocd/values.yaml" \
    --wait --timeout 10m

  echo "ArgoCD installed."
  echo ""
  echo "Get initial admin password:"
  echo "  argocd admin initial-password -n argocd"
  echo ""
  echo "Port-forward to access UI:"
  echo "  kubectl port-forward svc/argocd-server -n argocd 8080:80"
  echo ""
  echo "After configuring repo credentials, apply the app-of-apps:"
  echo "  kubectl apply -f infrastructure/argocd/app-of-apps.yaml"
}

###############################################################################
# SECTION 16: Post-install verification
###############################################################################
section16_verify() {
  echo "=== Section 16: Post-install verification ==="
  echo ""
  echo "--- Nodes ---"
  kubectl get nodes -o wide
  echo ""
  echo "--- All pods ---"
  kubectl get pods --all-namespaces
  echo ""
  echo "--- Storage classes ---"
  kubectl get sc
  echo ""
  echo "--- Services (LoadBalancer IPs) ---"
  kubectl get svc --all-namespaces | grep LoadBalancer
  echo ""
  echo "--- Cilium status ---"
  kubectl exec -n kube-system ds/cilium -- cilium status --brief 2>/dev/null || echo "(cilium CLI not in image, use cilium connectivity test)"
}

###############################################################################
# Main
###############################################################################
echo "Homelab Talos Bootstrap Script"
echo "================================"
echo "Run individual sections: section1_gitignore, section2_gen_secrets, ..."
echo "Or source this file and call sections manually."
echo ""
echo "Quick run order:"
echo "  1. section1_gitignore"
echo "  2. section2_gen_secrets    (backs up to 1Password)"
echo "  3. section3_schematic"
echo "  4. section4_gen_config"
echo "  5. section5_apply_config   (WIPES nvme0n1 — point of no return)"
echo "  6. section6_configure_talosctl  (run after node reboots to .200)"
echo "  7. section7_bootstrap      (run EXACTLY ONCE)"
echo "  8. section8_kubeconfig"
echo "  9. section9_cilium"
echo "  10. section10_cilium_lbipam"
echo "  11. section11_longhorn"
echo "  12. section12_cert_manager"
echo "  13. section13_eso"
echo "  14. section14_tailscale"
echo "  15. section15_argocd"
echo "  16. section16_verify"
