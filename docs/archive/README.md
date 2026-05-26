# Archive

These files are kept for historical reference and are **no longer in use**.

| File | Why Archived |
|------|-------------|
| `HOMELAB.html` | Old HTML dashboard, superseded by `docs/cluster-dashboard.html` |
| `PROJECT-OVERVIEW-old.md` | Original project notes, superseded by `README.md` |
| `actual-budget-selfhost-old.crt` | Stale self-signed cert (CN=actual-budget.homelab, expired). Superseded by cert-manager ECDSA certs (auto-renewed via ClusterIssuer). |
| `argo-vs-istio.yaml` | Initial design comparison doc. ArgoCD chosen; Istio was evaluated but not deployed. |
| `istio-gateway.yaml` | Istio Gateway config, never deployed. Cilium handles ingress instead. |
| `metallb-ipaddresspool.yaml` | MetalLB IP pool config. MetalLB was replaced by Cilium LB-IPAM (L2 ARP mode). |

Do not deploy any of these files — they reference stale infra that no longer exists.
