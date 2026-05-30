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
    const [argoResult, podResult, nodeResult, metricsResult, eventsResult, longhornResult, certsResult, podMetricsResult, longhornVolsResult, svcResult, ingressResult, deployResult, cronResult, helmResult, pvcResult] = await Promise.allSettled([
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
      // Services with LoadBalancer/NodePort IPs
      execAsync(`kubectl get svc -A -o json 2>/dev/null`),
      // Traefik IngressRoutes (hostnames)
      execAsync(`kubectl get ingressroutes.traefik.io -A -o json 2>/dev/null`),
      // Deployments for desired vs available replicas
      execAsync(`kubectl get deployments -A -o json 2>/dev/null`),
      // CronJobs for last schedule time and status
      execAsync(`kubectl get cronjobs -A -o json 2>/dev/null`),
      // Helm releases (all namespaces)
      execAsync(`helm ls -A --output json 2>/dev/null`),
      // PersistentVolumeClaims per namespace
      execAsync(`kubectl get pvc -A -o json 2>/dev/null`),
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
    const podStatusCounts = { running: 0, pending: 0, failed: 0, unknown: 0 };
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
        // Count by phase
        const phase = item.status?.phase as string ?? "Unknown";
        if (phase === "Running") podStatusCounts.running++;
        else if (phase === "Pending") podStatusCounts.pending++;
        else if (phase === "Failed") podStatusCounts.failed++;
        else podStatusCounts.unknown++;
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
        const podPhase = item.status?.phase;
        const ready = cs?.ready ?? false;
        const restarts = cs?.restartCount ?? 0;
        const waiting = cs?.state?.waiting?.reason;

        if (!ready || restarts > 5 || waiting) {
          unhealthyPods.push({
            namespace: item.metadata?.namespace ?? "",
            name: item.metadata?.name ?? "",
            ready: ready ? "true" : "false",
            status: waiting ?? podPhase ?? "Unknown",
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
          // Active pressure conditions (MemoryPressure, DiskPressure, PIDPressure)
          pressures: conditions
            .filter((c: { type: string; status: string }) => c.type !== "Ready" && c.status === "True")
            .map((c: { type: string }) => c.type),
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
    interface K8sEvent { namespace: string; name: string; reason: string; message: string; count: number; age: string; lastTimestamp?: string; }
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
            lastTimestamp: last ?? undefined,
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

    // Parse services with external IPs (LoadBalancer)
    interface K8sSvc { namespace: string; name: string; type: string; clusterIP: string; externalIP?: string; ports: string }
    const k8sServices: K8sSvc[] = [];
    if (svcResult.status === "fulfilled" && svcResult.value.stdout.trim()) {
      try {
        const svcData = JSON.parse(svcResult.value.stdout);
        for (const svc of svcData.items ?? []) {
          const type = svc.spec?.type ?? "ClusterIP";
          if (type === "ClusterIP") continue; // skip boring cluster-internal services
          const lbIngress = svc.status?.loadBalancer?.ingress?.[0];
          const externalIP = lbIngress?.ip ?? lbIngress?.hostname ?? svc.spec?.externalIPs?.[0];
          const ports = (svc.spec?.ports ?? []).map((p: { port: number; targetPort: number | string; protocol: string }) => `${p.port}/${p.protocol ?? "TCP"}`).join(",");
          k8sServices.push({
            namespace: svc.metadata?.namespace ?? "",
            name: svc.metadata?.name ?? "",
            type,
            clusterIP: svc.spec?.clusterIP ?? "",
            externalIP,
            ports,
          });
        }
      } catch {}
    }
      timestamp: new Date().toISOString(),
      apps,
      unhealthyPods: unhealthyPods.slice(0, 20),
      totalPods,
      podStatusCounts,
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
      k8sServices,
      nsIngress,
      nsDeployments,
      nsCronJobs,
      nsHelmReleases,
      nsPvcs,
      certificates,
    });
  } catch {    // Parse Traefik IngressRoutes: namespace → [hostname]
    const nsIngress: Record<string, string[]> = {};
    if (ingressResult.status === "fulfilled" && ingressResult.value.stdout.trim()) {
      try {
        const ingData = JSON.parse(ingressResult.value.stdout);
        for (const route of ingData.items ?? []) {
          const ns = route.metadata?.namespace ?? "";
          for (const rule of route.spec?.routes ?? []) {
            // Extract host from match string like "Host(`example.homelab.local`)"
            const match = rule.match as string ?? "";
            const hostMatch = match.match(/Host\(`([^`]+)`\)/i);
            if (hostMatch) {
              if (!nsIngress[ns]) nsIngress[ns] = [];
              if (!nsIngress[ns].includes(hostMatch[1])) nsIngress[ns].push(hostMatch[1]);
            }
          }
        }
      } catch {}
    }    // Parse Deployments: namespace → [{name, desired, available, ready}]
    const nsDeployments: Record<string, { name: string; desired: number; available: number; ready: number }[]> = {};
    if (deployResult.status === "fulfilled" && deployResult.value.stdout.trim()) {
      try {
        const depData = JSON.parse(deployResult.value.stdout);
        for (const dep of depData.items ?? []) {
          const ns = dep.metadata?.namespace ?? "";
          const desired = dep.spec?.replicas ?? 0;
          const available = dep.status?.availableReplicas ?? 0;
          const ready = dep.status?.readyReplicas ?? 0;
          if (!nsDeployments[ns]) nsDeployments[ns] = [];
          nsDeployments[ns].push({ name: dep.metadata?.name ?? "", desired, available, ready });
        }
      } catch {}
    }    // Parse CronJobs: namespace → [{name, schedule, lastSchedule, active, lastSuccess}]
    const nsCronJobs: Record<string, { name: string; schedule: string; lastSchedule?: string; active: number }[]> = {};
    if (cronResult.status === "fulfilled" && cronResult.value.stdout.trim()) {
      try {
        const cronData = JSON.parse(cronResult.value.stdout);
        for (const cj of cronData.items ?? []) {
          const ns = cj.metadata?.namespace ?? "";
          const lastSchedule = cj.status?.lastScheduleTime ?? undefined;
          const active = (cj.status?.active ?? []).length;
          if (!nsCronJobs[ns]) nsCronJobs[ns] = [];
          nsCronJobs[ns].push({
            name: cj.metadata?.name ?? "",
            schedule: cj.spec?.schedule ?? "",
            lastSchedule,
            active,
          });
        }
      } catch {}
    }    // Parse Helm releases: namespace → [{name, chart, appVersion, status, updated}]
    const nsHelmReleases: Record<string, { name: string; chart: string; appVersion: string; status: string; updated: string }[]> = {};
    if (helmResult.status === "fulfilled" && helmResult.value.stdout.trim()) {
      try {
        const helmData: { name: string; namespace: string; chart: string; app_version: string; status: string; updated: string }[] = JSON.parse(helmResult.value.stdout);
        for (const rel of helmData) {
          const ns = rel.namespace ?? "";
          if (!nsHelmReleases[ns]) nsHelmReleases[ns] = [];
          nsHelmReleases[ns].push({
            name: rel.name,
            chart: rel.chart,
            appVersion: rel.app_version || "",
            status: rel.status,
            updated: rel.updated,
          });
        }
      } catch {}
    }

    // Parse PVCs: namespace → [{name, status, capacity, storageClass}]
    const nsPvcs: Record<string, { name: string; status: string; capacity: string; storageClass: string }[]> = {};
    if (pvcResult.status === "fulfilled" && pvcResult.value.stdout.trim()) {
      try {
        const pvcData = JSON.parse(pvcResult.value.stdout);
        for (const pvc of pvcData.items ?? []) {
          const ns = pvc.metadata?.namespace ?? "";
          if (!nsPvcs[ns]) nsPvcs[ns] = [];
          nsPvcs[ns].push({
            name: pvc.metadata?.name ?? "",
            status: pvc.status?.phase ?? "Unknown",
            capacity: pvc.status?.capacity?.storage ?? pvc.spec?.resources?.requests?.storage ?? "?",
            storageClass: pvc.spec?.storageClassName ?? "",
          });
        }
      } catch {}
    }

    return Response.json(
      { error: "Failed to fetch cluster status" },
      { status: 500 }
    );
  }
}
