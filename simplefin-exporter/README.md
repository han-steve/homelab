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
3. **Added new command line flags**:
   - `-secretName` - Name of the Kubernetes secret to store/read access URL
   - `-secretNamespace` - Namespace of the secret

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
3. Exposes metrics for 5 minutes 
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

The exporter provides these metrics:
```
# Account balance
simplefin_balance{account_name="SimpleFIN Checking",currency="USD",domain="beta-bridge.simplefin.org"} 25035.5

# Available balance (may differ from balance for credit accounts)
simplefin_available_balance{account_name="SimpleFIN Checking",currency="USD",domain="beta-bridge.simplefin.org"} 25035.5

# Last updated timestamp
simplefin_last_updated{account_name="SimpleFIN Checking",domain="beta-bridge.simplefin.org"} 1.759815339e+09
```

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

### Key Queries Used:
```promql
# Total net worth
sum(simplefin_balance)

# Individual account balances
simplefin_balance

# Positive balances only (for pie chart)
simplefin_balance > 0

# Account count
count(simplefin_balance)

# Last update time
max(simplefin_last_updated) * 1000
```

The dashboard will be automatically discovered by Grafana via the sidecar and available at:
**Dashboards → SimpleFIN Financial Dashboard**

## Security Note

⚠️ **Important**: This application exposes financial information via HTTP metrics. Ensure proper network policies and access controls are in place to prevent unauthorized access to this data.