import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
  parseIppPrinterAttributes,
  type PrinterHwState,
  type PrinterHwStatus,
} from "./printerHardwareTypes";

const execAsync = promisify(exec);

export { parseIppPrinterAttributes, type PrinterHwState, type PrinterHwStatus };

// In-memory cache of printer name -> IP address to avoid repeating lpstat calls
const printerIpCache = new Map<string, string | null>();

/**
 * Extracts printer IP address from CUPS configuration via `lpstat -v <printerName>`.
 * Returns null if printer is local (e.g. cups-pdf) or destination cannot be resolved.
 */
export async function getPrinterIp(printerName: string): Promise<string | null> {
  const sanitized = printerName.replace(/[^A-Za-z0-9._\-]/g, "");
  if (!sanitized) return null;

  if (printerIpCache.has(sanitized)) {
    return printerIpCache.get(sanitized) ?? null;
  }

  try {
    const { stdout } = await execAsync(`lpstat -v '${sanitized}'`, {
      timeout: 3000,
      shell: "/bin/bash",
    });
    // Expected output format: "device for Fuji_apeos_3560_IP: socket://192.168.1.2:9100"
    const match = stdout.match(
      /(?:socket|ipp|ipps|lpd|http|https):\/\/([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/,
    );
    const ip = match ? match[1] : null;
    printerIpCache.set(sanitized, ip);
    return ip;
  } catch {
    printerIpCache.set(sanitized, null);
    return null;
  }
}

/**
 * Queries physical printer hardware status via IPP attributes.
 * Returns null if printer does not support IPP, is offline, or times out.
 */
export async function getPrinterHardwareStatus(
  printerName: string,
): Promise<PrinterHwStatus | null> {
  const ip = await getPrinterIp(printerName);
  if (!ip) {
    return null;
  }

  try {
    const { stdout } = await execAsync(
      `timeout -s KILL 2 ipptool -tv -d requested-attributes=printer-state,printer-state-reasons,printer-alert-description 'ipp://${ip}:631/ipp/print' /usr/share/cups/ipptool/get-printer-attributes.test`,
      {
        timeout: 3500,
        shell: "/bin/bash",
      },
    );

    return parseIppPrinterAttributes(stdout);
  } catch {
    // Non-fatal fallback if printer does not respond on IPP
    return null;
  }
}
