#!/usr/bin/env bash
# bootstrap-1password.sh
# Run this ONCE to create the 1Password Connect server and wire it into the cluster.
# Requires: op CLI (brew install 1password-cli), kubectl, 1Password account with "Homelab" vault
#
# Usage: ./scripts/bootstrap-1password.sh
set -euo pipefail

echo "=== 1Password Connect Bootstrap ==="
echo "This creates a Connect Server integration in your 1Password account."
echo "Make sure 1Password desktop app is open and authenticated."
echo ""

# Step 1: Check op CLI is authenticated
if ! op account list &>/dev/null 2>&1; then
  echo "→ Signing in to 1Password..."
  op signin
fi

ACCOUNT=$(op account list --format json | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['url'])")
echo "✓ Authenticated to: $ACCOUNT"

# Step 2: Create Connect server (or re-use if exists)
CONNECT_NAME="homelab-k8s"

if op connect server list --format json 2>/dev/null | python3 -c "import sys,json; servers=json.load(sys.stdin); exit(0 if any(s['name']=='$CONNECT_NAME' for s in servers) else 1)" 2>/dev/null; then
  echo "✓ Connect server '$CONNECT_NAME' already exists"
  # Get existing credentials file location — need to re-download if not present
  if [[ ! -f /tmp/1password-credentials.json ]]; then
    echo "⚠ Re-download the credentials file from 1Password web UI:"
    echo "  1Password > (your name) > Integrations > Connect Servers > homelab-k8s > Generate Credentials File"
    exit 1
  fi
else
  echo "→ Creating Connect server '$CONNECT_NAME'..."
  op connect server create "$CONNECT_NAME" \
    --vaults Homelab \
    --credentials-file /tmp/1password-credentials.json
  echo "✓ Created. Credentials saved to /tmp/1password-credentials.json"
fi

# Step 3: Generate a Connect token
echo "→ Generating Connect token..."
TOKEN=$(op connect token create "homelab-k8s-token" \
  --server "$CONNECT_NAME" \
  --vaults Homelab \
  --format json | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "✓ Token generated"

# Step 4: Create Kubernetes secrets
echo "→ Creating Kubernetes secrets..."

kubectl create namespace external-secrets 2>/dev/null || true

kubectl create secret generic onepassword-connect-secret \
  --namespace external-secrets \
  --from-file=1password-credentials.json=/tmp/1password-credentials.json \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic onepassword-connect-token \
  --namespace external-secrets \
  --from-literal=token="$TOKEN" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "✓ Kubernetes secrets created"

# Step 5: Deploy 1Password Connect server
echo "→ Deploying 1Password Connect server..."
kubectl apply -f infrastructure/external-secrets/1password-connect.yaml

# Step 6: Wait and verify
echo "→ Waiting for Connect server to start..."
kubectl rollout status deployment/onepassword-connect -n external-secrets --timeout=120s

echo ""
echo "✅ 1Password Connect is live!"
echo "   ClusterSecretStore 'onepassword' is ready"
echo "   External Secrets will now sync from 1Password 'Homelab' vault"
echo ""
echo "Required vault items (create if missing):"
echo "  - SimpleFin        → fields: setup-token, access-url"
echo "  - Tailscale OAuth  → fields: clientId, clientSecret"
echo "  - Grafana Admin    → fields: admin-password"
echo "  - Actual Budget    → fields: (none required, app manages auth internally)"
echo ""
echo "Cleanup: rm /tmp/1password-credentials.json"
