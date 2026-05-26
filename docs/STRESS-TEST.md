# CPU Stress Test — Fan / Thermal Validation

Use this to test cooling, fan noise, and thermal behavior at sustained load.  
Runs as a Kubernetes Deployment on the M2 node using `stress-ng` via `debian:latest`.

---

## Quick Run (30 min at 70% CPU)

```bash
kubectl apply -f - <<YAML
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cpu-stress-70pct
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cpu-stress
  template:
    metadata:
      labels:
        app: cpu-stress
    spec:
      containers:
      - name: stress
        image: debian:latest
        command: ["/bin/sh", "-c"]
        args: ["apt-get update -qq && apt-get install -y -qq stress-ng && stress-ng --cpu 16 --cpu-load 70 --timeout 1800"]
        resources:
          requests:
            cpu: "8"
          limits:
            cpu: "14"
YAML
```

Watch it:
```bash
kubectl logs -f deployment/cpu-stress-70pct -n default
```

Stop it:
```bash
kubeckubeckubeckubeckubeckubeckubeckubeckubeckubeckubeckubeckubec# kubeckubeckubeckubeckubeckubeckubeckubeckubeeoutkubeckubeckubeckubeckubeckubeckubeckubeckubeckubeckubeckubeckubec# kubeckube 90kubeckubeckubeckubeckubeckubeckubeckubeckubeckubeckubeckubeckubec# kubeckubeckube1 hour) | 1kubeckubeckubeckubeckubeckubeckserkube- **kubeckubeckubeckubeckuberakubeckubeckubeckubifkubeckubeckubec%
kub*Node tkub*Node tkub*Node tk dmekub*Node tkub*Nod node-expokub*Nodtrics ikub*Node 
- - - - - - - - : c- - - - - - - - : gy_p- - - - -y` - - - - - - es- - - - - - U*- - - - - - - - : c- - d- - -t`

--------------- Res---------------026)


-------------- Res--------n -------------- Res--------n -----):

| Metric | Result |
|--------|--------|
| CPU utilization | 70% sustained across 16 cores |
| Fan behavior | Audible ramp-up, maintained ~50% speed |
| Thermal e| Thermal e| Thermaro| Thermal e|ved) |
| Node stability | 100% — all pods remained healthy |
| Benchmark during stress | Not measured (use idle baseline) |

Idle benchmarks (measured separately):
- CPU: **73,462 events/sec** (sysbench prime, 16 threads, 60s)
- RAM: **9,593 MiB/s** (sysbench memory, 16 threads)
