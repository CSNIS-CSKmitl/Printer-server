import {
  parseIppPrinterAttributes as parseJs,
  parseIppCompletedJobs as parseCompletedJobsJs,
  evaluateIppCompletedJob as evaluateCompletedJobJs,
  buildSnmpGetPacket as buildSnmpGetPacketJs,
  parseSnmpGetResponse as parseSnmpGetResponseJs,
} from "../../printer-hardware.mjs";

export type PrinterHwState = "idle" | "processing" | "stopped" | "unknown";

export interface PrinterHwStatus {
  state: PrinterHwState;
  reasons: string[];
  alertMessage?: string;
  isJam: boolean;
  isOutOfPaper: boolean;
  isCoverOpen: boolean;
}

export interface IppCompletedJob {
  jobId: number | null;
  jobName: string;
  state:
    | "completed"
    | "aborted"
    | "canceled"
    | "pending"
    | "processing"
    | "unknown";
  reasons: string[];
  impressionsCompleted: number | null;
  mediaSheetsCompleted: number | null;
}

export interface PrinterJobVerification {
  verified: boolean;
  failed: boolean;
  actualPages: number;
  errorMessage?: string;
}

export function parseIppPrinterAttributes(stdout: string): PrinterHwStatus {
  return parseJs(stdout) as PrinterHwStatus;
}

export function parseIppCompletedJobs(stdout: string): IppCompletedJob[] {
  return parseCompletedJobsJs(stdout) as IppCompletedJob[];
}

export function evaluateIppCompletedJob(
  ippJob: IppCompletedJob,
  expectedPages: number,
): { failed: boolean; actualPages: number; errorMessage?: string } {
  return evaluateCompletedJobJs(ippJob, expectedPages);
}

export function buildSnmpGetPacket(
  oidStr: string,
  community = "public",
  requestId = 1,
): Buffer {
  return buildSnmpGetPacketJs(oidStr, community, requestId);
}

export function parseSnmpGetResponse(
  buf: Buffer | Uint8Array | null | undefined,
): number | null {
  return parseSnmpGetResponseJs(buf);
}
