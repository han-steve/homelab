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
    const [argoResult, podResult, nodeResult] = await Promise.allSettled([
      execAsync(
        `kubectl get applications -n argocd -o json 2>/dev/null`
      ),
      execAsync(
        `kubectl get pods -A -o json --field-selector=status.phase!=Succeeded 2>/dev/null`
      ),
      execAsync(`kubectl get nodes -o json 2>/dev/null`),
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
    if (podResult.status === "fulfilled") {
      const data = JSON.parse(podResult.value.stdout);
      for (const item of data.items ?? []) {
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
        nodeInfo = {
          name: n.metadata?.name,
          ready: ready?.status === "True",
          kubeletVersion: n.status?.nodeInfo?.kubeletVersion,
          cpu: n.status?.capacity?.cpu,
          memory: n.status?.capacity?.memory,
        };
      }
    }

    return Response.json({
      timestamp: new Date().toISOString(),
      apps,
      unhealthyPods: unhealthyPods.slice(0, 20),
      node: nodeInfo,
    });
  } catch {
    return Response.json(
      { error: "Failed to fetch cluster status" },
      { status: 500 }
    );
  }
}
