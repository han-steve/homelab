---
sidebar_position: 2
title: Monitoring (Grafana + Prometheus)
---

# Monitoring Stack

The monitoring stack uses **kube-prometheus-stack** (Helm chart) providing Prometheus, Grafana, and Alertmanager.

## Components

| Component | Purpose |
|-----------|---------|
| Prometheus | Metrics collection & storage |
| Grafana | Dashboards & visualization |
| Alertmanager | Alert routing |
| node-exporter | Host metrics |
| kube-state-metrics | K8s object metrics |

## Access

| Service | IP | Domain |
|---------|-----|--------|
| Grafana | 192.168.1.13 | grafana.homelab |

## Custom Exporters

### SimpleFin Exporter
Financial account balance monitoring via SimpleFin Bridge API. Exports account balances as Prometheus metrics with a custom Grafana dashboard.

- **Location**: `simplefin-exporter/`
- **Schedule**: CronJob runs periodically
- **Metrics**: `simplefin_account_balance`, `simplefin_account_available`

## Helm Values

Custom values are in `prometheus-monitoring/helm-values.yaml`. Key overrides:

- Storage: Longhorn PVC with local-path StorageClass
- Retention: configured for single-node
- Grafana: LoadBalancer service at 192.168.1.13
