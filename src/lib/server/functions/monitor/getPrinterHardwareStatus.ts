import { exec } from "node:child_process";
import dgram from "node:dgram";
import { promisify } from "node:util";
import type { PrintJobsRecord } from "../../pocketbase";
import { jobInitialPageCounters } from "./timestamps";
import {
  parseIppPrinterAttributes,
  parseIppCompletedJobs,
  evaluateIppCompletedJob,
  buildSnmpGetPacket,
  parseSnmpGetResponse,
  type PrinterHwState,
  type PrinterHwStatus,
  type IppCompletedJob,
  type PrinterJobVerification,
} from "./printerHardwareTypes";

const execAsync = promisify(exec);

// Standard Printer-MIB OID: prtMarkerLifeCount.1.1 (total lifetime sheets/impressions printed)
const PRT_MARKER_LIFE_COUNT_OID = "1.3.6.1.2.1.43.10.2.1.4.1.1";

const IPP_GET_COMPLETED_JOBS_TEST = `{
  NAME "Get Completed Jobs"
  OPERATION Get-Jobs
  GROUP operation-attributes-tag
  ATTR charset attributes-charset utf-8
  ATTR language attributes-natural-language en
  ATTR uri printer-uri $uri
  ATTR keyword which-jobs completed
  ATTR integer limit 20
  ATTR keyword requested-attributes job-id,job-name,job-state,job-state-reasons,job-impressions-completed,job-media-sheets-completed
}`;

export {
  parseIppPrinterAttributes,
  parseIppCompletedJobs,
  evaluateIppCompletedJob,
  type PrinterHwState,
  type PrinterHwStatus,
  type IppCompletedJob,
  type PrinterJobVerification,
};

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

/**
 * Queries the printer's recently completed/aborted/canceled jobs via IPP Get-Jobs.
 * Returns null if the printer does not support IPP Get-Jobs or times out.
 */
export async function getPrinterCompletedJobs(
  printerName: string,
): Promise<IppCompletedJob[] | null> {
  const ip = await getPrinterIp(printerName);
  if (!ip) return null;

  try {
    const escapedTest = IPP_GET_COMPLETED_JOBS_TEST.replace(/'/g, `'\\''`);
    const { stdout } = await execAsync(
      `printf '%s\n' '${escapedTest}' | timeout -s KILL 2 ipptool -tv 'ipp://${ip}:631/ipp/print' -`,
      {
        timeout: 3500,
        shell: "/bin/bash",
      },
    );
    return parseIppCompletedJobs(stdout);
  } catch {
    return null;
  }
}

/**
 * Queries the printer's physical lifetime page counter (prtMarkerLifeCount.1.1)
 * via SNMPv2c UDP port 161. Returns null if SNMP is disabled, blocked, or times out.
 */
export async function getPrinterPageCounter(
  printerName: string,
  timeoutMs = 1500,
): Promise<number | null> {
  const ip = await getPrinterIp(printerName);
  if (!ip) return null;

  const requestId = Math.floor(Math.random() * 0x7fff) + 1;
  const packet = buildSnmpGetPacket(PRT_MARKER_LIFE_COUNT_OID, "public", requestId);

  return new Promise<number | null>((resolve) => {
    const socket = dgram.createSocket("udp4");
    let settled = false;

    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // ignore
      }
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    socket.on("error", () => finish(null));
    socket.on("message", (msg) => {
      finish(parseSnmpGetResponse(msg));
    });

    socket.send(packet, 161, ip, (err) => {
      if (err) finish(null);
    });
  });
}

/**
 * Snapshots the printer's physical page counter right before a job is submitted.
 * Non-fatal: silently skips if SNMP is unavailable.
 */
export async function recordInitialPrinterCounter(
  jobId: string,
  printerName: string,
): Promise<void> {
  try {
    const counter = await getPrinterPageCounter(printerName, 1200);
    if (counter !== null) {
      jobInitialPageCounters.set(jobId, counter);
      console.log(
        `[Monitor] Recorded initial SNMP page counter for job ${jobId} on ${printerName}: ${counter}`,
      );
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Verifies whether a print job actually printed sheets at the physical printer,
 * catching silent printer-side cancellations/errors (such as Fujifilm 016-751)
 * that CUPS raw socket://9100 queues never report back.
 *
 * Layer 1: IPP Get-Jobs (which-jobs=completed) matched by unique job.id in job-name.
 * Layer 2: SNMP prtMarkerLifeCount delta (when this is the only active job on the printer).
 */
export async function verifyPrinterJobOutcome(
  job: PrintJobsRecord,
  samePrinterActiveCount: number,
): Promise<PrinterJobVerification> {
  // Layer 1: Query IPP Get-Jobs for the exact job (matched by PB job.id embedded in PJL JOBNAME)
  const completedJobs = await getPrinterCompletedJobs(job.printer_name);
  if (completedJobs && completedJobs.length > 0) {
    const matched = completedJobs.find(
      (j) => j.jobName && j.jobName.includes(job.id),
    );
    if (matched) {
      const evalResult = evaluateIppCompletedJob(matched, job.pages);
      return {
        verified: true,
        failed: evalResult.failed,
        actualPages: evalResult.actualPages,
        errorMessage: evalResult.errorMessage,
      };
    }
  }

  // Layer 2: SNMP physical page counter delta (safe when no other job is concurrently printing on this printer)
  const initialCounter = jobInitialPageCounters.get(job.id);
  if (initialCounter !== undefined && samePrinterActiveCount <= 1) {
    const currentCounter = await getPrinterPageCounter(job.printer_name, 1500);
    if (currentCounter !== null) {
      const delta = currentCounter - initialCounter;
      console.log(
        `[Monitor] Job ${job.id} SNMP counter check: before=${initialCounter}, after=${currentCounter}, delta=${delta}`,
      );
      if (delta <= 0 && job.pages > 0) {
        return {
          verified: true,
          failed: true,
          actualPages: 0,
          errorMessage: `เครื่องพิมพ์ไม่ได้พิมพ์กระดาษออก (0/${job.pages} หน้า — ไฟล์ PDF อาจไม่รองรับ เช่น รหัส 016-751 หรือเครื่องยกเลิกงาน) คืนเครดิตให้แล้ว แนะนำให้ Save เป็น PDF ใหม่แล้วลองอีกครั้ง`,
        };
      }
      return {
        verified: true,
        failed: false,
        actualPages: job.pages,
      };
    }
  }

  // Neither IPP Get-Jobs nor SNMP was able to confirm — fall back to existing behavior
  return {
    verified: false,
    failed: false,
    actualPages: job.pages,
  };
}
