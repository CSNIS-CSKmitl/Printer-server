export type PrintJobStatus =
  "queued" | "printing" | "completed" | "failed" | "cancelled";

export interface PrintJobRecord {
  id: string;
  user: string;
  file_name: string;
  pages: number;
  copies: number;
  color: boolean;
  two_sided: boolean;
  status: PrintJobStatus;
  error_message?: string;
  created?: string;
  updated?: string;
}

export interface SubmitOptions {
  file: Blob | Buffer;
  fileName: string;
  copies?: number;
  twoSided?: boolean;
  color?: boolean;
}

export interface SubmitResult {
  ok: boolean;
  jobId?: string;
  error?: string;
}
