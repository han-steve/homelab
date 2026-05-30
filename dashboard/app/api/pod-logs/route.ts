import { exec } from "child_process";
import { promisify } from "util";
import { NextRequest } from "next/server";

const execAsync = promisify(exec);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const namespace = searchParams.get("namespace");
  const pod = searchParams.get("pod");
  const container = searchParams.get("container"); // optional

  if (!namespace || !pod) {
    return Response.json({ error: "namespace and pod are required" }, { status: 400 });
  }

  // Sanitize inputs to prevent command injection: only allow alphanumeric, dash, underscore, dot
  const safeNs = namespace.replace(/[^a-zA-Z0-9\-_.]/g, "");
  const safePod = pod.replace(/[^a-zA-Z0-9\-_.]/g, "");
  const safeCtr = container ? container.replace(/[^a-zA-Z0-9\-_.]/g, "") : null;

  if (safeNs !== namespace || safePod !== pod || (container && safeCtr !== container)) {
    return Response.json({ error: "Invalid characters in namespace, pod, or container" }, { status: 400 });
  }

  try {
    const containerFlag = safeCtr ? ` -c ${safeCtr}` : "";
    const cmd = `kubectl logs -n ${safeNs} ${safePod}${containerFlag} --tail=60 --timestamps 2>&1`;
    const { stdout } = await execAsync(cmd, { maxBuffer: 512 * 1024 });
    const lines = stdout.trim().split("\n").filter(Boolean);
    return Response.json({ lines, pod: safePod, namespace: safeNs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to get logs";
    const shortMsg = message.split("\n")[0].slice(0, 200);
    return Response.json({ lines: [`Error: ${shortMsg}`], pod: safePod, namespace: safeNs });
  }
}
