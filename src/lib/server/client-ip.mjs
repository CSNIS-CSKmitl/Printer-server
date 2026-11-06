import { isIP } from "node:net";

/** @param {unknown} value */
function first(value) {
  return String(value || "")
    .split(",")[0]
    .trim();
}
/** @param {unknown} value */
function forwarded(value) {
  const match = /(?:^|[,;])\s*for=(?:"?)(\[[^\]]+\](?::\d+)?|[^;,\s"]+)/i.exec(
    String(value || ""),
  );
  return match?.[1] || "";
}
/** @param {unknown} value */
export function normalizeClientIp(value) {
  let ip = String(value || "")
    .trim()
    .replace(/^"|"$/g, "");
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(ip);
  if (bracketed) ip = bracketed[1];
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip))
    ip = ip.slice(0, ip.lastIndexOf(":"));
  ip = ip.split("%")[0];
  return isIP(ip) ? ip : "";
}
/** @param {{ headers: Record<string, unknown>, remoteAddress?: unknown, trustProxy?: boolean }} input */
export function resolveClientIp({
  headers,
  remoteAddress = "",
  trustProxy = false,
}) {
  if (trustProxy) {
    for (const candidate of [
      headers["cf-connecting-ip"],
      headers["true-client-ip"],
      first(headers["x-forwarded-for"]),
      headers["x-real-ip"],
      forwarded(headers.forwarded),
    ]) {
      const ip = normalizeClientIp(candidate);
      if (ip) return ip;
    }
  }
  return normalizeClientIp(remoteAddress);
}
