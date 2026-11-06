import type { RequestEvent } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { getAdminClient } from "./functions/pocketbase/getAdminClient";
import { resolveClientIp } from "./client-ip.mjs";

function sourceIp(event: RequestEvent): string {
  let remoteAddress = "";
  try {
    remoteAddress = event.getClientAddress();
  } catch {
    /* unavailable in some adapters */
  }
  return resolveClientIp({
    headers: Object.fromEntries(event.request.headers.entries()),
    remoteAddress,
    trustProxy: env.TRUST_PROXY === "true",
  });
}

/** Records an admin decision (cancel / delete) on a print job in the central admin_actions collection. Never throws. */
export async function writeAdminAction(input: {
  actorId: string;
  action: "approve" | "reject" | "delete" | "cancel";
  targetId: string;
  targetLabel?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const pb = await getAdminClient();
    await pb.collection("admin_actions").create({
      service: "printer",
      action: input.action,
      actor: input.actorId,
      target_collection: "print_jobs",
      target_id: input.targetId,
      target_label: input.targetLabel?.slice(0, 256),
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    console.warn(
      "[audit] Unable to store admin action:",
      error instanceof Error ? error.message : error,
    );
  }
}

export async function writeServiceAudit(
  event: RequestEvent,
  input: {
    userId?: string | null;
    action: string;
    statusCode?: number;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    const pb = await getAdminClient();
    const clientIp = sourceIp(event);
    await pb.collection("service_access_logs").create({
      service: "printer-server",
      user: input.userId || undefined,
      source_ip: clientIp,
      method: event.request.method,
      path: event.url.pathname,
      action: input.action,
      status_code: input.statusCode,
      user_agent: event.request.headers.get("user-agent") || undefined,
      request_id: event.request.headers.get("x-request-id") || undefined,
      metadata: {
        ...(input.metadata || {}),
        ip_version: clientIp ? (clientIp.includes(":") ? 6 : 4) : null,
      },
    });
  } catch (error) {
    console.warn(
      "[audit] Unable to store printer-server access log:",
      error instanceof Error ? error.message : error,
    );
  }
}
