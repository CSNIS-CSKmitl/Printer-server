import { parseIppPrinterAttributes as parseJs } from "../../printer-hardware.mjs";

export type PrinterHwState = "idle" | "processing" | "stopped" | "unknown";

export interface PrinterHwStatus {
  state: PrinterHwState;
  reasons: string[];
  alertMessage?: string;
  isJam: boolean;
  isOutOfPaper: boolean;
  isCoverOpen: boolean;
}

export function parseIppPrinterAttributes(stdout: string): PrinterHwStatus {
  return parseJs(stdout) as PrinterHwStatus;
}
