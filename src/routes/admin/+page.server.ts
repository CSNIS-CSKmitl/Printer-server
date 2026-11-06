import { error, redirect, type Actions } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import type { PrintJobsRecord, UsersRecord } from "$lib/server/pocketbase";
import { adjustRemaining } from "$lib/server/functions/quota/adjustRemaining";
import { listAllQuotas } from "$lib/server/functions/quota/listAllQuotas";
import { resetToDefault } from "$lib/server/functions/quota/resetToDefault";
import { refundQuota } from "$lib/server/functions/quota/refundQuota";
import { clearSession } from "$lib/server/functions/session/clearSession";
import { cancelPrintJob } from "$lib/server/functions/print/cancelPrintJob";
import { getAdminClient } from "$lib/server/functions/pocketbase/getAdminClient";
import { calculatePrintStats, type PrintTimeRange } from "$lib/print-stats";
import { writeAdminAction } from "$lib/server/audit-log";
import { canAccessAdmin } from "$lib/roles";

/**
 * ปรับลำดับคิวพิมพ์ในระบบ
 */
function decorateQueuePositions(
  jobs: PrintJobsRecord[],
): Array<PrintJobsRecord & { queuePosition: number | null }> {
  const active = jobs
    .filter((j) => j.status === "processing" || j.status === "pending")
    .sort((a, b) => a.created.localeCompare(b.created));

  const positionById = new Map<string, number>();
  active.forEach((job, idx) => positionById.set(job.id, idx + 1));

  return jobs.map((j) => ({
    ...j,
    queuePosition: positionById.get(j.id) ?? null,
  }));
}

export const load: PageServerLoad = async ({ locals, url }) => {
  // 🛡️ ป้องกันความปลอดภัย: เช็คว่าล็อกอินและเป็นแอดมินของระบบจริงไหม (super_admin หรือ head)
  if (!locals.user) throw redirect(303, "/login");
  if (!locals.user || !canAccessAdmin(locals.user))
    throw redirect(303, "/user");

  const pb = locals.pb;
  const loadedAt = new Date().toISOString();
  const rawRange = url.searchParams.get("range") || "all";
  const range: PrintTimeRange = [
    "today",
    "7d",
    "month",
    "year",
    "all",
  ].includes(rawRange)
    ? (rawRange as PrintTimeRange)
    : "all";

  try {
    const adminPb = await getAdminClient();

    const [users, jobsResult, allStatJobs, quotasByUser] = await Promise.all([
      adminPb.collection("users").getFullList<UsersRecord>({
        sort: "email",
        expand: "user_type",
      }),
      pb.collection("print_jobs").getList<PrintJobsRecord>(1, 200, {
        sort: "-created",
        expand: "user,created_by,updated_by",
      }),
      adminPb.collection("print_jobs").getFullList<PrintJobsRecord>({
        sort: "-created",
        fields:
          "id,user,filename,status,pages,copies,printer_name,created,updated",
      }),
      listAllQuotas(pb),
    ]);

    const usersWithQuota = users.map((u) => {
      const q = quotasByUser.get(u.id);
      return {
        ...u,
        quota: q ?? {
          userId: u.id,
          remaining: 0,
          total: 0,
          used: 0,
          tierTotal: 0,
        },
      };
    });

    const stats = calculatePrintStats(allStatJobs, users, { range });

    return {
      users: usersWithQuota,
      jobs: decorateQueuePositions(jobsResult.items),
      statJobs: allStatJobs,
      stats,
      range,
      loadedAt,
      statsError: "",
    };
  } catch (err) {
    console.error("[admin/load] failed to load stats:", err);
    const emptyStats = calculatePrintStats([], [], { range });
    return {
      users: [],
      jobs: [],
      statJobs: [],
      stats: emptyStats,
      range,
      loadedAt,
      statsError:
        "โหลดข้อมูลไม่ได้ กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูล PocketBase",
    };
  }
};

export const actions: Actions = {
  adjustQuota: async ({ request, locals }) => {
    if (!locals.user || !canAccessAdmin(locals.user))
      throw error(403, "Forbidden");

    const data = await request.formData();
    const userId = String(data.get("userId") ?? "");
    const delta = Number(data.get("delta") ?? 0);

    if (!userId || !Number.isFinite(delta) || delta === 0) {
      return { ok: false, message: "ข้อมูลไม่ถูกต้อง" };
    }

    const pb = locals.pb;

    try {
      const snapshot = await adjustRemaining(pb, userId, delta);

      return {
        ok: true,
        message: `ปรับโควต้าให้พนักงานรหัส ${userId} เรียบร้อยแล้ว (เหลือ ${snapshot.remaining}/${snapshot.total} หน้า)`,
      };
    } catch (e) {
      console.error("[admin/adjustQuota] failed:", e);
      return { ok: false, message: "ไม่สามารถอัปเดตโควต้าได้" };
    }
  },

  resetQuota: async ({ request, locals }) => {
    if (!locals.user || !canAccessAdmin(locals.user))
      throw error(403, "Forbidden");

    const data = await request.formData();
    const userId = String(data.get("userId") ?? "");
    const userName = String(data.get("userName") ?? userId);

    if (!userId) return { ok: false, message: "ข้อมูลไม่ถูกต้อง" };

    const pb = locals.pb;

    try {
      const snapshot = await resetToDefault(pb, userId);

      return {
        ok: true,
        message: `รีเซ็ตโควต้าให้ ${userName} เป็น ${snapshot.total} หน้าเรียบร้อยแล้ว`,
      };
    } catch (e) {
      console.error("[admin/resetQuota] failed:", e);
      return { ok: false, message: "ไม่สามารถรีเซ็ตโควต้าได้" };
    }
  },

  bulkAdjustQuota: async ({ request, locals }) => {
    if (!locals.user || !canAccessAdmin(locals.user))
      throw error(403, "Forbidden");

    const data = await request.formData();
    const userIds = data
      .getAll("userIds")
      .map((v) => String(v))
      .filter(Boolean);
    const delta = Number(data.get("delta") ?? 0);

    if (userIds.length === 0)
      return { ok: false, message: "ยังไม่ได้เลือกผู้ใช้" };
    if (!Number.isFinite(delta) || delta === 0)
      return { ok: false, message: "จำนวนหน้าไม่ถูกต้อง" };

    const pb = locals.pb;

    const settled = await Promise.allSettled(
      userIds.map((userId) => adjustRemaining(pb, userId, delta)),
    );

    const ok = settled.filter((r) => r.status === "fulfilled").length;
    const failed = settled.length - ok;

    return failed === 0
      ? {
          ok: true,
          message: `เพิ่มโควต้า ${delta >= 0 ? "+" : ""}${delta} หน้า ให้ ${ok} คนเรียบร้อย`,
        }
      : { ok: false, message: `ปรับสำเร็จ ${ok} คน, ล้มเหลว ${failed} คน` };
  },

  bulkResetQuota: async ({ request, locals }) => {
    if (!locals.user || !canAccessAdmin(locals.user))
      throw error(403, "Forbidden");

    const data = await request.formData();
    const userIds = data
      .getAll("userIds")
      .map((v) => String(v))
      .filter(Boolean);

    if (userIds.length === 0)
      return { ok: false, message: "ยังไม่ได้เลือกผู้ใช้" };

    const pb = locals.pb;

    const settled = await Promise.allSettled(
      userIds.map((userId) => resetToDefault(pb, userId)),
    );

    const ok = settled.filter((r) => r.status === "fulfilled").length;
    const failed = settled.length - ok;

    return failed === 0
      ? { ok: true, message: `รีเซ็ตโควต้าให้ ${ok} คนเรียบร้อย` }
      : { ok: false, message: `รีเซ็ตสำเร็จ ${ok} คน, ล้มเหลว ${failed} คน` };
  },

  suspend: async ({ request, locals }) => {
    if (!locals.user || !canAccessAdmin(locals.user))
      throw error(403, "Forbidden");

    const data = await request.formData();
    const jobId = String(data.get("jobId") ?? "");
    if (!jobId) return { ok: false, message: "ข้อมูลไม่ถูกต้อง" };

    try {
      const job = await locals.pb
        .collection("print_jobs")
        .getOne<PrintJobsRecord>(jobId);

      await locals.pb.collection("print_jobs").update(jobId, {
        updated_by: locals.user.id,
        status: "failed",
        error_message: "Suspended by admin",
      });
      await writeAdminAction({
        actorId: locals.user.id,
        action: "cancel",
        targetId: jobId,
        targetLabel: job.printer_name,
        metadata: { pages: job.pages, owner: job.user },
      });

      try {
        await refundQuota(locals.pb, job.user, job.pages);
      } catch (refundErr) {
        console.error("[admin/suspend] refund failed:", refundErr);
      }

      if (job.cups_job_id) {
        await cancelPrintJob(job.cups_job_id, job.printer_name);
      }

      return { ok: true, message: "ระงับงานเรียบร้อย" };
    } catch (e) {
      console.error("[admin/suspend] failed:", e);
      return { ok: false, message: "ไม่สามารถระงับงานได้" };
    }
  },

  remove: async ({ request, locals }) => {
    if (!locals.user || !canAccessAdmin(locals.user))
      throw error(403, "Forbidden");

    const data = await request.formData();
    const jobId = String(data.get("jobId") ?? "");
    if (!jobId) return { ok: false, message: "ข้อมูลไม่ถูกต้อง" };

    try {
      const job = await locals.pb
        .collection("print_jobs")
        .getOne<PrintJobsRecord>(jobId)
        .catch(() => null);
      await locals.pb.collection("print_jobs").delete(jobId);
      await writeAdminAction({
        actorId: locals.user.id,
        action: "delete",
        targetId: jobId,
        targetLabel: job?.printer_name,
        metadata: {
          pages: job?.pages,
          owner: job?.user,
          status_before: job?.status,
        },
      });
      return { ok: true, message: "ลบงานออกจากคิวเรียบร้อย" };
    } catch (e) {
      console.error("[admin/remove] failed:", e);
      return { ok: false, message: "ไม่สามารถลบงานได้" };
    }
  },

  logout: async ({ cookies }) => {
    clearSession(cookies);
    throw redirect(303, "/login");
  },
};
