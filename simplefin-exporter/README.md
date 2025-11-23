# SimpleFIN Bridge Exporter for Homelab

This directory contains the Kubernetes manifests to deploy the SimpleFIN Bridge Exporter as a CronJob that exposes financial account balance metrics to Prometheus.

## Problem Solved

The original SimpleFIN bridge exporter had an issue where the setup token could only be used once. After the first run, subsequent runs would fail because the setup token was already claimed. This modified version solves this by:

1. Using the setup token to get an access URL on first run
2. Saving the access URL to a Kubernetes secret
3. Reading the saved access URL from the secret on subsequent runs

## Overview

The SimpleFIN Bridge Exporter polls your financial accounts via SimpleFIN Bridge and exposes account balances as Prometheus metrics. This allows you to create dashboards tracking your net worth over time.

## Source Code Location

The modified source code is located at:
```
/home/stevehan/repos/simplefin-bridge-exporter-modified/
```

This is a fork of the original repository: `https://github.com/eduser25/simplefin-bridge-exporter`

## Key Modifications Made

1. **Added Kubernetes client functionality** - Can read/write secrets in the cluster
2. **Added persistent access URL storage** - Saves access URL to secret after first successful auth
3. **Fixed account name collision bug** - Added account ID to metrics labels to prevent overwrites
4. **Added account name mapping** - Support for custom account names via configuration file
5. **Added new command line flags**:
   - `-secretName` - Name of the Kubernetes secret to store/read access URL
   - `-secretNamespace` - Namespace of the secret
   - `-accountMappingsFile` - Path to JSON file containing account ID to custom name mappings

## Building and Loading the Image

### Prerequisites
- Go 1.24+ installed
- Docker installed
- Access to Kubernetes cluster with containerd

### Build Steps

1. **Navigate to the modified source**:
   ```bash
   cd /home/stevehan/repos/simplefin-bridge-exporter-modified
   ```

2. **Build the binary for Linux**:
   ```bash
   export PATH=$PATH:/usr/local/go/bin
   CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o simplefin-bridge-exporter-modified ./cmd/main-modified.go
   ```

3. **Build the Docker image**:
   ```bash
   docker build -f Dockerfile.modified -t simplefin-bridge-exporter:modified .
   ```

4. **Save and load into containerd** (for Kubernetes):
   ```bash
   docker save simplefin-bridge-exporter:modified -o /tmp/simplefin-modified.tar
   sudo ctr -n k8s.io images import /tmp/simplefin-modified.tar
   ```

5. **Verify the image is loaded**:
   ```bash
   sudo ctr -n k8s.io images ls | grep simplefin
   ```

## Architecture

### 🔄 Daily Workflow:
1. CronJob runs at 6 AM daily
2. Fetches latest financial data from SimpleFIN
3. Exposes metrics for 1 minute
4. Prometheus scrapes every 30 seconds during that window (10+ scrapes)
5. Pod terminates to save resources
- **ServiceMonitor**: Configures Prometheus to scrape the metrics endpoint
- **Secret**: Stores your SimpleFIN setup token securely

## Building the Docker Image

1. The upstream repository should be cloned to `~/repos/`:
   ```bash
   cd ~/repos
   git clone https://github.com/eduser25/simplefin-bridge-exporter.git
   cd simplefin-bridge-exporter
   ```

2. The modified Dockerfile (includes CA certificates) is already in the repository.

3. Build the image locally:
   ```bash
   docker build -t simplefin-bridge-exporter:latest .
   ```

4. Load the image into containerd (for kubeadm clusters):
   ```bash
   docker save simplefin-bridge-exporter:latest -o /tmp/simplefin-bridge-exporter.tar
   sudo ctr -n k8s.io images import /tmp/simplefin-bridge-exporter.tar
   ```

## Configuration

1. Get your SimpleFIN setup token from [SimpleFIN Bridge](https://beta-bridge.simplefin.org/)

2. Update the secret in `base/simplefin-secret.yaml`:
   ```yaml
   stringData:
     setup-token: "YOUR_ACTUAL_SETUP_TOKEN_HERE"
   ```

   The demo token is already configured for testing:
   ```yaml
   setup-token: "aHR0cHM6Ly9iZXRhLWJyaWRnZS5zaW1wbGVmaW4ub3JnL3NpbXBsZWZpbi9jbGFpbS9ERU1P"
   ```

## Deployment

Deploy using kubectl:
```bash
kubectl apply -k simplefin-exporter/base/
```

Or using ArgoCD with the application manifest in `app-of-apps/simplefin-exporter/base/`.

## Metrics

The exporter provides these raw metrics with enhanced labels including account IDs. In addition, Prometheus recording rules (see `simplefin-recording-rules.yaml`) create *preserved* and *deduplicated* forms that collapse multiple simultaneous CronJob pods (using `without (pod,instance)` aggregation) to avoid double counting:
```
# Account balance (with account ID to prevent collisions)
simplefin_balance{account_name="SimpleFIN Checking",account_id="Demo Checking",currency="USD",domain="beta-bridge.simplefin.org"} 25035.5  # raw
simplefin_balance_preserved{account_name="SimpleFIN Checking",account_id="Demo Checking",currency="USD",domain="beta-bridge.simplefin.org"} 25035.5  # deduped per account

# Available balance (may differ from balance for credit accounts)
simplefin_available_balance{account_name="SimpleFIN Checking",account_id="Demo Checking",currency="USD",domain="beta-bridge.simplefin.org"} 25035.5  # raw
simplefin_available_balance_preserved{account_name="SimpleFIN Checking",account_id="Demo Checking",currency="USD",domain="beta-bridge.simplefin.org"} 25035.5  # deduped

# Last updated timestamp
simplefin_last_updated{account_name="SimpleFIN Checking",account_id="Demo Checking",domain="beta-bridge.simplefin.org"} 1.759815339e+09

### Recording Rules Summary

| Recording Rule | Purpose | Expression |
| -------------- | ------- | ---------- |
| `simplefin_balance_preserved` | Per-account latest balance without pod duplication | `max without (pod,instance) (simplefin_balance)` |
| `simplefin_available_balance_preserved` | Per-account available balance deduped | `max without (pod,instance) (simplefin_available_balance)` |
| `simplefin_net_worth_preserved` | Total net worth (deduped and aggregated across all accounts) | `sum(simplefin_balance_preserved)` |
| `simplefin_account_count_preserved` | Count of unique accounts | `count(simplefin_balance_preserved)` |

### Common Queries (Using Preserved Metrics)
```promql
# Total net worth (deduped)
simplefin_net_worth_preserved

# Current balances table (latest daily max sample)
max_over_time(simplefin_balance_preserved[1d])

# Positive balances only pie chart
max_over_time(simplefin_balance_preserved[1d]) > 0

# Account count (deduped)
simplefin_account_count_preserved

# Last update time (epoch ms)
max(simplefin_last_updated) * 1000
```

Use the raw `simplefin_balance` family only for debugging individual pods; prefer the `*_preserved` and `simplefin_net_worth_preserved` rules for dashboards and alerting.
```

## Account Name Mapping

To customize account display names, create a JSON configuration file:

```json
{
  "mappings": [
    {
      "account_id": "Demo Checking",
      "custom_name": "My Primary Checking Account"
    },
    {
      "account_id": "Demo Savings",
      "custom_name": "Emergency Fund"
    }
  ]
}
```

Mount this file as a ConfigMap and reference it with the `-accountMappingsFile` flag.

## Grafana Dashboard

A comprehensive financial dashboard is automatically deployed via ConfigMap (`simplefin-dashboard.yaml`). The dashboard includes:

### Dashboard Features:
- **Account Balances Table**: Shows all accounts with current balances
- **Account Distribution Pie Chart**: Visual breakdown of account proportions  
- **Total Net Worth**: Large stat panel showing combined balance
- **Account Count**: Number of tracked accounts
- **Last Data Update**: When financial data was last refreshed
- **Net Worth Over Time**: Historical trend line for each account + total
- **Stacked Account Composition**: Shows how account balances change over time

### Dashboard Query Highlights (Improved Dashboard)
Queries now leverage preserved metrics:
```promql
max_over_time(simplefin_balance_preserved[1d])                 # Account balances table
max_over_time(simplefin_balance_preserved[1d]) > 0             # Distribution / composition
simplefin_net_worth_preserved                                  # Total net worth stat & timeseries
simplefin_account_count_preserved                              # Account count stat
max(simplefin_last_updated) * 1000                             # Last data update
```

The dashboard will be automatically discovered by Grafana via the sidecar and available at:
**Dashboards → SimpleFIN Financial Dashboard**

## Security Note

⚠️ **Important**: This application exposes financial information via HTTP metrics. Ensure proper network policies and access controls are in place to prevent unauthorized access to this data.