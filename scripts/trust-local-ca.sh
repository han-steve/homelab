#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# trust-local-ca.sh
# Installs the homelab root CA into the Mac system keychain and optionally
# prepares an installation package for iPhone/iPad.
#
# USAGE:
#   bash scripts/trust-local-ca.sh              # Mac only
#   bash scripts/trust-local-ca.sh --iphone     # Mac + create iPhone profile
#   bash scripts/trust-local-ca.sh --remove     # Remove from Mac keychain
#
# REQUIREMENTS (Mac):
#   - kubectl access to the cluster
#   - sudo / admin password (prompted)
#
# PHONE TRUST (after running with --iphone):
#   1. AirDrop ~/Downloads/homelab-ca.crt to your iPhone
#   2. iPhone: Settings > Downloaded Profile > Install (enter passcode)
#   3. iPhone: Settings > General > About > Certificate Trust Settings
#              Toggle "Homelab Root CA" to ON
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step()  { echo -e "\n${BLUE}══ $* ══${NC}"; }

IPHONE=0
REMOVE=0
for arg in "$@"; do
  case "$arg" in
    --iphone) IPHONE=1 ;;
    --remove) REMOVE=1 ;;
  esac
done

CA_TMP="/tmp/homelab-root-ca.crt"
CERT_NAME="Homelab Root CA"

# ── Remove mode ───────────────────────────────────────────────────────────────
if [[ "$REMOVE" == "1" ]]; then
  step "Removing homelab CA from Mac keychain"
  if security find-certificate -c "$CERT_NAME" /Library/Keychains/System.keychain &>/dev/null; then
    sudo security delete-certificate -c "$CERT_NAME" /Library/Keychains/System.keychain
    info "✓ Removed '$CERT_NAME' from System.keychain"
  else
    warn "Certificate '$CERT_NAME' not found in System.keychain"
  fi
  exit 0
fi

# ── Wait for cert-manager to create the root CA ───────────────────────────────
step "Fetching root CA from cluster"

MAX_WAIT=120
ELAPSED=0
while true; do
  if kubectl get secret homelab-root-ca -n cert-manager &>/dev/null 2>&1; then
    break
  fi
  if [[ "$ELAPSED" -ge "$MAX_WAIT" ]]; then
    error "Timed out waiting for homelab-root-ca secret. Did you apply clusterissuers.yaml?"
  fi
  info "Waiting for cert-manager to generate root CA (${ELAPSED}s)..."
  sleep 5
  ELAPSED=$((ELAPSED + 5))
done

# Extract the CA cert
kubectl get secret homelab-root-ca -n cert-manager \
  -o jsonpath='{.data.tls\.crt}' | base64 -d > "$CA_TMP"

if [[ ! -s "$CA_TMP" ]]; then
  error "Root CA cert is empty — something went wrong"
fi

# Show cert info
info "Root CA details:"
openssl x509 -in "$CA_TMP" -noout -subject -issuer -dates 2>/dev/null || true

# ── Install on Mac ────────────────────────────────────────────────────────────
step "Installing root CA in Mac System Keychain"

# Check if already installed
if security find-certificate -c "$CERT_NAME" /Library/Keychains/System.keychain &>/dev/null 2>&1; then
  warn "Certificate '$CERT_NAME' already exists. Removing old version first..."
  sudo security delete-certificate -c "$CERT_NAME" /Library/Keychains/System.keychain 2>/dev/null || true
fi

sudo security add-trusted-cert \
  -d \
  -r trustRoot \
  -k /Library/Keychains/System.keychain \
  "$CA_TMP"

info "✓ Homelab Root CA trusted in Mac System Keychain"
info "  All certs signed by homelab-ca ClusterIssuer are now trusted in:"
info "  - Safari, Chrome, curl, all system apps"
info "  - curl -sk will now work without -k for homelab certs"

# ── iPhone package ────────────────────────────────────────────────────────────
if [[ "$IPHONE" == "1" ]]; then
  step "Preparing iPhone trust package"

  PHONE_CA="$HOME/Downloads/homelab-ca.crt"
  cp "$CA_TMP" "$PHONE_CA"

  info "✓ Saved to $PHONE_CA"
  info ""
  info "  To install on iPhone/iPad:"
  info "  1. Open AirDrop and send $PHONE_CA to your phone"
  info "  2. On iPhone: Settings → General → VPN & Device Management"
  info "     → 'Homelab Root CA' → Install → (enter passcode)"
  info "  3. Settings → General → About → Certificate Trust Settings"
  info "     → Toggle 'Homelab Root CA' to ENABLED (full trust)"
  info ""
  info "  Alternative: Email the .crt file to yourself and open it on the iPhone"

  # Try to open AirDrop
  open "file://$PHONE_CA" 2>/dev/null || true
fi

echo ""
info "═══════════════════════════════════════"
info "Done. Homelab CA is now trusted on Mac."
info "═══════════════════════════════════════"
info ""
info "Cert stored at: $CA_TMP"
info "To re-run:      bash scripts/trust-local-ca.sh"
info "To remove:      bash scripts/trust-local-ca.sh --remove"
info "For iPhone:     bash scripts/trust-local-ca.sh --iphone"
