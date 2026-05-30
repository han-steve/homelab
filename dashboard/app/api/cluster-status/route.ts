import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface ArgoApp {
  name: string;
  sync: string;
  health: string;
}

interface PodStatus {
  namespace: string;
  name: string;
  ready: string;
  status: string;
  restarts: number;
}

export async function GET() {
  try {
    const [argoResult, podResult, nodeResult, metricsResult, eventsResult, longhornResult, certsResult] = await Promise.allSettled([
      execAsync(
        `kubectl get applications -n argocd -o json 2>/dev/null`
      ),
      execAsync(
        `kubectl get pods -A -o json --field-selector=status.phase!=Succeeded 2>/dev/null`
      ),
      execAsync(`kubectl get nodes -o json 2>/dev/null`),
      // Node CPU/RAM from kubectl top (needs metrics-server or custom metrics)
      execAsync(`kubectl top nodes --no-headers 2>/dev/null`),
      // Recent warning events across all namespaces
      execAsync(`kubectl get events -A --field-selector=type=Warning --sort-by='.lastTimestamp' -o json 2>/dev/null`),
      // Longhorn storage nodes (disk usage)
      execAsync(`kubectl get nodes.longhorn.io -n longhorn-system -o json 2>/dev/null`),
      // Certificate expiration from cert-manager
      execAsync(`kubectl get certificates -A -o json 2>/dev/null`),
    ]);

    const apps: ArgoApp[] = [];
    if (argoResult.status === "fulfilled") {
      const data = JSON.parse(argoResult.value.stdout);
      for (const item of data.items ?? []) {
        apps.push({
          name: item.metadata?.name ?? "",
          sync: item.status?.sync?.status ?? "Unknown",
          health: item.status?.health?.status ?? "Unknown",
        });
      }
    }

    const unhealthyPods: PodStatus[] = [];
    let totalPods = 0;
    const nsPodCounts: Record<string, number> = {};
    if (podResult.status === "fulfilled") {
      const data = JSON.parse(podResult.value.stdout);
      totalPods = (data.items ?? []).length;
      for (const item of data.items ?? []) {
        const ns = item.metadata?.namespace ?? "unknown";
        nsPodCounts[ns] = (nsPodCounts[ns] || 0) + 1;
        const cs = item.status?.containerStatuses?.[0];
        const phase = item.status?.phase;
        const ready = cs?.ready ?? false;
        const restarts = cs?.restartCount ?? 0;
        const waiting = cs?.state?.waiting?.reason;

        if (!ready || restarts > 5 || waiting) {
          unhealthyPods.push({
            namespace: item.metadata?.namespace ?? "",
            name: item.metadata?.name ?? "",
            ready: ready ? "true" : "false",
            status: waiting ?? phase ?? "Unknown",
            restarts,
          });
        }
      }
    }

    let nodeInfo = null;
    if (nodeResult.status === "fulfilled") {
      const data = JSON.parse(nodeResult.value.stdout);
      const n = data.items?.[0];
      if (n) {
        const conditions = n.status?.conditions ?? [];
        const ready = conditions.find(
          (c: { type: string }) => c.type === "Ready"
        );
        const creationTime = n.metadata?.creationTimestamp;
        let uptime: string | null = null;
        if (creationTime) {
          const uptimeMs = Date.now() - new Date(creationTime).getTime();
          const uptimeDays = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
          const uptimeHrs = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          uptime = uptimeDays > 0 ? `${uptimeDays}d ${uptimeHrs}h` : `${uptimeHrs}h`;
        }
        nodeInfo = {
          name: n.metadata?.name,
          ready: ready?.status === "True",
          kubeletVersion: n.status?.nodeInfo?.kubeletVersion,
          cpu: n.status?.capacity?.cpu,
          memory: n.status?.capacity?.memory,
          uptime,
        };
      }
    }

    // Parse kubectl top output (e.g. "m2   245m   4012Mi   3%   12%")
    let nodeMetrics: { cpuCores: string; memoryi: string; cpuPct: string; memPct: string } | null = null;
    if (metricsResult.status === "fulfilled" && metricsResult.value.stdout.trim()) {
      const line = metricsResult.value.stdout.trim().split("\n")[0];
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        nodeMetrics = { cpuCores: parts[1], memoryi: parts[2], cpuPct: parts[3], memPct: parts[4] };
      }
    }

    // Parse recent warning events
    interface K8sEvent { namespace: string; name: string; reason: string; message: string; count: number; age: string; }
    const recentEvents: K8sEvent[] = [];
    if (eventsResult.status === "fulfilled" && eventsResult.value.stdout.trim()) {
      try {
        const evData = JSON.parse(eventsResult.value.stdout);
        const items = (evData.items ?? []).slice(-10).reverse(); // most recent first
        for (const ev of items) {
          const last = ev.lastTimestamp ?? ev.eventTime;
          let age = "";
          if (last) {
            const ms = Date.now() - new Date(last).getTime();
            const mins = Math.floor(ms / 60000);
            age = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`;
          }
          recentEvents.push({
            namespace: ev.metadata?.namespace ?? "",
            name: ev.involvedObject?.name ?? "",
            reason: ev.reason ?? "",
            message: (ev.message ?? "").slice(0, 80),
            count: ev.count ?? 1,
            age,
          });
        }
      } catch {}
    }

    // Parse Longhorn disk usage from nodes.longhorn.io
    let longhornStorage: { totalGiB: number; usedGiB: number; freeGiB: number; pct: number } | null = null;
    if (longhornResult.status === "fulfilled" && longhornResult.value.stdout.trim()) {
      try {
        const lhData = JSON.parse(longhornResult.value.stdout);
        let totalBytes = 0, usedBytes = 0;
        for (const node of lhData.items ?? []) {
          for (const [, disk] of Object.entries(node.status?.diskStatus ?? {})) {
            const d = disk as { storageAvailable?: number; storageMaximum?: number; storageScheduled?: number };
            if (d.storageMaximum) {
              totalBytes += d.storageMaximum;
              usedBytes += (d.storageMaximum - (d.storageAvailable ?? 0));
            }
          }
        }
        if (totalBytes > 0) {
          const gb = (b: number) => Math.round(b / (1024 ** 3) * 10) / 10;
          longhornStorage = {
            totalGiB: gb(totalBytes),
            usedGiB: gb(usedBytes),
            freeGiB: gb(totalBytes - usedBytes),
            pct: Math.round((usedBytes / totalBytes) * 100),
          };
        }
      } catch {}
    }

    // Parse certificate expiration from cert-manager
    interface CertInfo { name: string; namespace: string; daysLeft: number; ready: boolean; }
    const certificates: CertInfo[] = [];
    if (certsResult.status === "fulfilled" && certsResult.value.stdout.trim()) {
      try {
        const certData = JSON.parse(certsResult.value.stdout);
        for (const cert of certData.items ?? []) {
          const expiry = cert.status?.notAfter;
          const ready = cert.status?.conditions?.some((c: { type: string; status: string }) => c.type === "Ready" && c.status === "True") ?? false;
          let daysLeft = 9999;
          if (expiry) {
            const ms = new Date(expiry).getTime() - Date.now();
            daysLeft = Math.floor(ms / (1000 * 60 * 60 * 24));
          }
          certificates.push({
            name: cert.metadata?.name ?? "",
            namespace: cert.metadata?.namespace ?? "",
            daysLeft,
            ready,
          });
        }
      } catch {}
    }

    return Response.json({
      timestamp: new Date().toISOString(),
      apps,
      unhealthyPods: unhealthyPods.slice(0, 20),
      totalPods,
      nsPodCounts,
      node: nodeInfo,
      nodeMetrics,
      recentEvents,
      longhornStorage,
      certificates,
    });
  } catch {
    return Response.json(
      { error: "Failed to fetch cluster status" },
      { status: 500 }
    );
  }
}
