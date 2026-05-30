import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface ArgoApp {
  name: string;
  sync: string;
  health: string;
  syncedAt?: string | null;
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
    const [argoResult, podResult, nodeResult, metricsResult, eventsResult, longhornResult, certsResult, podMetricsResult, longhornVolsResult] = await Promise.allSettled([
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
      // Pod-level CPU/RAM metrics
      execAsync(`kubectl top pods -A --no-headers 2>/dev/null`),
      // Longhorn volumes
      execAsync(`kubectl get volumes.longhorn.io -n longhorn-system -o json 2>/dev/null`),
    ]);

    const apps: ArgoApp[] = [];
    if (argoResult.status === "fulfilled") {
      const data = JSON.parse(argoResult.value.stdout);
      for (const item of data.items ?? []) {
        const syncedAt = item.status?.operationState?.finishedAt ?? item.status?.reconciledAt ?? null;
        apps.push({
          name: item.metadata?.name ?? "",
          sync: item.status?.sync?.status ?? "Unknown",
          health: item.status?.health?.status ?? "Unknown",
          syncedAt,
        });
      }
    }

    const unhealthyPods: PodStatus[] = [];
    let totalPods = 0;
    const nsPodCounts: Record<string, number> = {};
    const nsCpuRequestsM: Record<string, number> = {}; // millicores per namespace
    const nsMemRequestsMi: Record<string, number> = {}; // MiB per namespace
    // Track pod start times for uptime display
    const podStartTimes: Record<string, string> = {}; // "namespace/name" -> ISO timestamp
    // Track container images per namespace (first container of each pod)
    const nsImages: Record<string, Set<string>> = {};
    if (podResult.status === "fulfilled") {
      const data = JSON.parse(podResult.value.stdout);
      totalPods = (data.items ?? []).length;
      for (const item of data.items ?? []) {
        const ns = item.metadata?.namespace ?? "unknown";
        const podName = item.metadata?.name ?? "";
        nsPodCounts[ns] = (nsPodCounts[ns] || 0) + 1;
        // Track start time
        const startTime = item.status?.startTime ?? item.metadata?.creationTimestamp;
        if (startTime) podStartTimes[`${ns}/${podName}`] = startTime;
        // Track distinct images
        for (const container of item.spec?.containers ?? []) {
          if (container.image) {
            if (!nsImages[ns]) nsImages[ns] = new Set();
            // Strip registry prefix, keep repo:tag
            const img = (container.image as string).replace(/^[^/]+\.[^/]+\//, "");
            nsImages[ns].add(img);
          }
        }
        // Aggregate resource requests
        for (const container of item.spec?.containers ?? []) {
          const cpuReq = container.resources?.requests?.cpu ?? "";
          const memReq = container.resources?.requests?.memory ?? "";
          if (cpuReq) {
            const mcpu = cpuReq.endsWith("m") ? parseInt(cpuReq) : parseFloat(cpuReq) * 1000;
            if (!isNaN(mcpu)) nsCpuRequestsM[ns] = (nsCpuRequestsM[ns] || 0) + mcpu;
          }
          if (memReq) {
            const mi = memReq.endsWith("Mi") ? parseInt(memReq) : memReq.endsWith("Gi") ? parseFloat(memReq) * 1024 : memReq.endsWith("Ki") ? parseFloat(memReq) / 1024 : 0;
            if (mi) nsMemRequestsMi[ns] = (nsMemRequestsMi[ns] || 0) + mi;
          }
        }
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
    // Convert image sets to arrays
    const nsImagesArr: Record<string, string[]> = {};
    for (const [ns, imgs] of Object.entries(nsImages)) {
      nsImagesArr[ns] = Array.from(imgs).slice(0, 8); // limit to 8 distinct images
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
          allocatableCpu: n.status?.allocatable?.cpu,
          allocatableMemory: n.status?.allocatable?.memory,
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

    // Parse pod-level metrics (kubectl top pods)
    // Output: NAMESPACE   NAME   CPU(cores)   MEMORY(bytes)
    const parsedPodMetrics: { namespace: string; name: string; cpu: string; memory: string; cpuM: number; memMi: number; startTime?: string }[] = [];
    if (podMetricsResult.status === "fulfilled" && podMetricsResult.value.stdout.trim()) {
      for (const line of podMetricsResult.value.stdout.trim().split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const cpuM = parts[2].endsWith("m") ? parseInt(parts[2]) : parseFloat(parts[2]) * 1000;
          const memMi = parts[3].endsWith("Mi") ? parseInt(parts[3]) : parts[3].endsWith("Gi") ? parseFloat(parts[3]) * 1024 : parts[3].endsWith("Ki") ? parseFloat(parts[3]) / 1024 : 0;
          const key = `${parts[0]}/${parts[1]}`;
          parsedPodMetrics.push({
            namespace: parts[0],
            name: parts[1],
            cpu: parts[2],
            memory: parts[3],
            cpuM: isNaN(cpuM) ? 0 : cpuM,
            memMi: isNaN(memMi) ? 0 : memMi,
            startTime: podStartTimes[key],
          });
        }
      }
    }
    // Top 10 by CPU usage (for overview chart)
    const topCpuPods = parsedPodMetrics
      .sort((a, b) => b.cpuM - a.cpuM)
      .slice(0, 10);

    // Parse Longhorn volumes
    interface LonghornVol { name: string; state: string; robustness: string; sizeGiB: number; pvc?: string }
    const longhornVolumes: LonghornVol[] = [];
    if (longhornVolsResult.status === "fulfilled" && longhornVolsResult.value.stdout.trim()) {
      try {
        const volData = JSON.parse(longhornVolsResult.value.stdout);
        for (const vol of volData.items ?? []) {
          const sizeBytes = parseInt(vol.spec?.size ?? "0");
          longhornVolumes.push({
            name: vol.metadata?.name ?? "",
            state: vol.status?.state ?? "unknown",
            robustness: vol.status?.robustness ?? "unknown",
            sizeGiB: Math.round(sizeBytes / (1024 ** 3) * 10) / 10,
            pvc: vol.status?.kubernetesStatus?.pvcName,
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
      nsCpuRequestsM,
      nsMemRequestsMi,
      totalCpuRequestsM: Object.values(nsCpuRequestsM).reduce((a, b) => a + b, 0),
      totalMemRequestsMi: Object.values(nsMemRequestsMi).reduce((a, b) => a + b, 0),
      nsImages: nsImagesArr,
      topCpuPods,
      podMetrics: parsedPodMetrics,
      node: nodeInfo,
      nodeMetrics,
      recentEvents,
      longhornStorage,
      longhornVolumes,
      certificates,
    });
  } catch {
    return Response.json(
      { error: "Failed to fetch cluster status" },
      { status: 500 }
    );
  }
}
