import type { ClientResponseError } from "pocketbase";
import type { TypedPocketBase, PrintJobsRecord } from "../../pocketbase";
import { refundQuota } from "../quota/refundQuota";
import {
  inactiveTimestamps,
  missingJobTimestamps,
  jobSpoolTimestamps,
  jobHardwareSeenProcessing,
} from "./timestamps";

export async function updateJobStatus(
  pb: TypedPocketBase,
  job: PrintJobsRecord,
  newStatus: "pending" | "processing" | "completed" | "failed",
  errorMessage?: string,
  refundPages?: number,
  actualPages?: number,
): Promise<void> {
  console.log(
    `[Monitor] Updating job ${job.id} (CUPS #${job.cups_job_id}) from "${job.status}" to "${newStatus}"`,
  );

  try {
    const updatePayload: Partial<PrintJobsRecord> = {
      status: newStatus,
      error_message: errorMessage || null,
    };
    if (actualPages !== undefined) {
      updatePayload.pages = actualPages;
    }
    await pb.collection("print_jobs").update(job.id, updatePayload);
  } catch (dbErr) {
    console.error(
      `[Monitor] Failed to update job status for ${job.id} in DB:`,
      dbErr,
    );
    return;
  }

  const pagesToRefund =
    refundPages !== undefined
      ? refundPages
      : newStatus === "failed"
        ? job.pages
        : 0;

  if (pagesToRefund > 0) {
    try {
      console.log(
        `[Monitor] Refunding ${pagesToRefund} pages to user ${job.user} for job ${job.id}`,
      );
      await refundQuota(pb, job.user, pagesToRefund);
    } catch (refundErr) {
      console.error(
        `[Monitor] Failed to refund user ${job.user} for job ${job.id}:`,
        refundErr,
      );
    }
  }

  if (newStatus === "completed" || newStatus === "failed") {
    inactiveTimestamps.delete(job.id);
    missingJobTimestamps.delete(job.id);
    jobSpoolTimestamps.delete(job.id);
    jobHardwareSeenProcessing.delete(job.id);
  }
}
