# Prometheus Monitoring Stack

This directory contains the Kubernetes manifests for deploying Prometheus Operator, Prometheus, Alertmanager, node-exporter, blackbox-exporter, prometheus-adapter, kube-state-metrics, and Grafana using the [kube-prometheus](https://github.com/prometheus-operator/kube-prometheus) project.

**Version:** 0.16.0 (latest release)

## Setup

Download the kube-prometheus v0.16.0 manifests and place them into the appropriate directories as defined in the kustomization (`manifests/setup` and `manifests`).

Deploy the entire stack using kustomize with:

```sh
kubectl apply -k .
```

This command will create the required namespace, CRDs, and deploy all resources as specified in the kustomization file.

After deployment, verify that all pods are running in the `monitoring` namespace:

```sh
kubectl get pods -n monitoring
```

## Deployment and Verification

After making any updates to the kustomized files, deploy the changes by running:

```sh
kubectl apply -k .
```

This command uses kustomize to build and apply the entire stack. Once applied, verify the deployment with:

```sh
kubectl get pods -n monitoring
```

Ensure that the namespace `monitoring` is created and all pods are running as expected.

## Notes

- Ensure your kubelet is configured with `--authentication-token-webhook=true` and `--authorization-mode=Webhook`.
- This stack comes with a default set of Grafana dashboards and Prometheus rules.

Happy monitoring!
