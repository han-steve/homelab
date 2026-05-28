---
sidebar_position: 3
title: Troubleshooting
---

# Troubleshooting

## Common Issues

### Pod Stuck in Pending
```bash
kubectl describe pod <pod-name> -n <namespace>
# Check Events section for scheduling failures
# Common cause: Longhorn volume not ready
```

### Service Not Reachable
```bash
# Check if the service has an external IP
kubectl get svc -A | grep LoadBalancer

# Verify Cilium LB-IPAM assigned the IP
kubectl get svc <service> -n <namespace> -o jsonpath='{.status.loadBalancer.ingress[0].ip}'

# Check ARP — does the IP respond?
arping -c 3 192.168.1.XX
```

### Certificate Issues
```bash
# Check cert status
kubectl get certificates -A

# Check cert-manager logs
kubectl logs -n cert-manager deploy/cert-manager

# Force renewal
kubectl delete secret <cert-secret> -n <namespace>
# cert-manager will re-issue automatically
```

### ArgoCD Out of Sync
```bash
# Check app status
kubectl get applications -n argocd

# Force sync
argocd app sync <app-name>

# Check diff
argocd app diff <app-name>
```

### Longhorn Volume Degraded
```bash
# Check volume status
kubectl get volumes -n longhorn-system

# Check node status
kubectl get nodes.longhorn.io -n longhorn-system
```

## Useful Commands

```bash
# Talos node status
talosctl -n 192.168.1.10 dashboard

# All pods by namespace
kubectl get pods -A --sort-by=.metadata.namespace

# Resource usage
kubectl top nodes
kubectl top pods -A --sort-by=memory

# Events (last hour)
kubectl get events -A --sort-by='.lastTimestamp' | tail -30

# ArgoCD password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d

# Longhorn UI
kubectl port-forward -n longhorn-system svc/longhorn-frontend 8080:80
```

## Disaster Recovery

Since everything is GitOps-managed:

1. **Reinstall Talos**: `talosctl apply-config --insecure -n 192.168.1.10 -f controlplane.yaml`
2. **Bootstrap**: `talosctl bootstrap -n 192.168.1.10`
3. **Install ArgoCD**: `kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml`
4. **Apply app-of-apps**: ArgoCD syncs everything from the GitHub repo
5. **Restore data**: Download from Google Drive, `kubectl cp` into pods
