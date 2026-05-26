# CPU Stress Test — Fan / Thermal Validation

Use this to test cooling, fan noise, and thermal behavior at sustained load.
Runs as a Kubernetes Job on the M2 node using `stress-ng`.

---

## Quick Run (30 min at 70% CPU)

```bash
kubectl apply -f - <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: cpu-stress-70pct
  namespace: default
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: stress
        image: debian:latest
        command: ["/bin/sh", "-c"]
        args:
          - |
            apt-get update -qq && apt-get install -y -qq stress-ng &&
            stress-ng --cpu 16 --cpu-load 70 --timeout 1800 --metrics-brief
        resources:
          requests:
            cpu: "8"
          limits:
            cpu: "14"
EOF
```

Watch it:
```bash
kubectl logs -f job/cpu-stress-70pct -n default
```

Stop it:
```bash
kubectl delete job cpu-stress-70pct -n default
```

---

## Monitoring During Test

Use the Grafana dashboard (http://192.168.1.13) or the node-exporter metrics:

```bash
# CPU temperature (coretemp)
kubectl exec -n monitoring ds/prometheus-node-exporter -- \
  cat /sys/class/thermal/thermal_zone*/temp

# CPU utilization per core
kubectl top nodes
```

---

## Longer Test (1 hour, 90% CPU)

```bash
kubectl apply -f - <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: cpu-stress-90pct-1h
  namespace: default
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: stress
        image: debian:latest
        command: ["/bin/sh", "-c"]
        args:
          - |
            apt-get update -qq && apt-get install -y -qq stress-ng &&
            stress-ng --cpu 16 --cpu-load 90 --timeout 3600 --metrics-brief
        resources:
          requests:
            cpu: "12"
          limits:
            cpu: "15"
EOF
```

---

## Results (Minisforum M2, Intel Core Ultra 7 356H, 32GB DDR5-4800)

Tested: 2025

| Metric | Result |
|--------|--------|
| CPU utilization | 70% sustained across 16 cores |
| Fan behavior | Audible ramp-up, maintained ~50% speed |
| Thermal throttling | None observed |
| Node stability | 100% — all pods remained healthy |

### Idle Benchmarks (measured separately with sysbench)

- CPU: **73,462 events/sec** (prime number test, 16 threads, 60s)
- RAM: **9,593 MiB/s** (memory bandwidth, 16 threads)

> Note: RAM bandwidth is limited by single-channel DDR5-4800. Dual-channel would
> approximately double this to ~19 GB/s.
