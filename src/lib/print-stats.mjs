/**
 * @typedef {'today' | '7d' | 'month' | 'year' | 'all'} PrintTimeRange
 * @typedef {'all' | 'pending' | 'printing' | 'active' | 'completed' | 'failed'} PrintDrilldownFilter
 *
 * @typedef {Object} StatUserRecord
 * @property {string} id
 * @property {string} [email]
 * @property {string} [username]
 * @property {string} [name]
 *
 * @typedef {Object} StatPrintJob
 * @property {string} id
 * @property {string} user
 * @property {string} [filename]
 * @property {'pending' | 'processing' | 'printing' | 'completed' | 'failed' | string} status
 * @property {number} pages
 * @property {number} [copies]
 * @property {string} [printer_name]
 * @property {string} created
 * @property {string} [updated]
 * @property {{ user?: StatUserRecord }} [expand]
 */

/** @type {Array<{ id: PrintTimeRange; label: string }>} */
export const PRINT_TIME_RANGES = [
  { id: "today", label: "วันนี้" },
  { id: "7d", label: "7 วัน" },
  { id: "month", label: "เดือนนี้" },
  { id: "year", label: "ปีนี้" },
  { id: "all", label: "ทั้งหมด" },
];

/**
 * Safely parse a PocketBase or ISO date string/number into a millisecond timestamp.
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseSafeDate(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(trimmed)
    ? trimmed.replace(" ", "T")
    : trimmed;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Get the start UTC timestamp for a given time range relative to `now`.
 * @param {PrintTimeRange | string} range
 * @param {number} [now]
 * @returns {number | null}
 */
export function getPrintRangeStart(range, now = Date.now()) {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const d = new Date(safeNow);
  switch (range) {
    case "today":
      return Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        0,
        0,
        0,
        0,
      );
    case "7d":
      return safeNow - 7 * 24 * 60 * 60 * 1000;
    case "month":
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0);
    case "year":
      return Date.UTC(d.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
    case "all":
    default:
      return null;
  }
}

/**
 * Check whether a job's created timestamp falls within the requested range.
 * @param {unknown} dateValue
 * @param {PrintTimeRange | string} range
 * @param {number} [now]
 * @returns {boolean}
 */
export function isJobInRange(dateValue, range, now = Date.now()) {
  if (!range || range === "all") return true;
  const ts = parseSafeDate(dateValue);
  if (ts === null) return false;
  const start = getPrintRangeStart(range, now);
  if (start === null) return true;
  const safeNow = Number.isFinite(now) ? now : Date.now();
  return ts >= start && ts <= safeNow + 365 * 24 * 60 * 60 * 1000;
}

/**
 * Check whether a job matches the selected drill-down status card.
 * @param {StatPrintJob} job
 * @param {PrintDrilldownFilter | string} filter
 * @returns {boolean}
 */
export function matchesJobDrilldown(job, filter) {
  if (!filter || filter === "all") return true;
  if (!job || typeof job !== "object") return false;
  switch (filter) {
    case "pending":
    case "printing":
    case "active":
      return (
        job.status === "pending" ||
        job.status === "processing" ||
        job.status === "printing"
      );
    case "completed":
      return job.status === "completed";
    case "failed":
      return job.status === "failed";
    default:
      return job.status === filter;
  }
}

/**
 * Filter print jobs by time range, status drill-down, and optional search query.
 * @param {StatPrintJob[]} jobs
 * @param {{ range?: PrintTimeRange | string; drilldown?: PrintDrilldownFilter | string; search?: string; now?: number }} [options]
 * @returns {StatPrintJob[]}
 */
export function filterPrintJobs(jobs, options = {}) {
  if (!Array.isArray(jobs)) return [];
  const {
    range = "all",
    drilldown = "all",
    search = "",
    now = Date.now(),
  } = options;
  const q = typeof search === "string" ? search.trim().toLowerCase() : "";
  return jobs.filter((job) => {
    if (!job || typeof job !== "object") return false;
    if (range !== "all" && !isJobInRange(job.created, range, now)) return false;
    if (!matchesJobDrilldown(job, drilldown)) return false;
    if (q) {
      const userName = job.expand?.user?.name || "";
      const userEmail = job.expand?.user?.email || "";
      const hay =
        `${job.id || ""} ${job.filename || ""} ${job.printer_name || ""} ${userName} ${userEmail} ${job.user || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Build monthly trend buckets for the last 6 months.
 * @param {StatPrintJob[]} jobs
 * @param {number} [now]
 * @returns {Array<{ key: string; label: string; jobs: number; completedJobs: number; failedJobs: number; pages: number }>}
 */
export function buildMonthlyPrintTrend(jobs, now = Date.now()) {
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const baseDate = new Date(safeNow);
  const monthNames = [
    "ม.ค.",
    "ก.พ.",
    "มี.ค.",
    "เม.ย.",
    "พ.ค.",
    "มิ.ย.",
    "ก.ค.",
    "ส.ค.",
    "ก.ย.",
    "ต.ค.",
    "พ.ย.",
    "ธ.ค.",
  ];

  /** @type {Array<{ key: string; label: string; start: number; end: number; jobs: number; completedJobs: number; failedJobs: number; pages: number }>} */
  const buckets = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(
      Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() - i, 1),
    );
    const start = d.getTime();
    const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = monthNames[d.getUTCMonth()];
    buckets.push({
      key,
      label,
      start,
      end,
      jobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      pages: 0,
    });
  }

  for (const job of safeJobs) {
    if (!job || typeof job !== "object") continue;
    const ts = parseSafeDate(job.created);
    if (ts === null) continue;
    const pages = Math.max(0, Number(job.pages) || 0);
    for (const b of buckets) {
      if (ts >= b.start && ts < b.end) {
        b.jobs += 1;
        if (job.status === "completed") {
          b.completedJobs += 1;
          b.pages += pages;
        } else if (job.status === "failed") {
          b.failedJobs += 1;
        }
        break;
      }
    }
  }

  return buckets.map(
    ({ key, label, jobs: j, completedJobs, failedJobs, pages }) => ({
      key,
      label,
      jobs: j,
      completedJobs,
      failedJobs,
      pages,
    }),
  );
}

/**
 * Build adaptive trend buckets based on selected time range.
 * @param {StatPrintJob[]} jobs
 * @param {PrintTimeRange | string} range
 * @param {number} [now]
 * @returns {Array<{ key: string; label: string; jobs: number; completedJobs: number; failedJobs: number; pages: number }>}
 */
export function buildPrintTrend(jobs, range = "all", now = Date.now()) {
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const baseDate = new Date(safeNow);

  if (range === "year" || range === "all") {
    return buildMonthlyPrintTrend(safeJobs, safeNow);
  }

  /** @type {Array<{ key: string; label: string; start: number; end: number; jobs: number; completedJobs: number; failedJobs: number; pages: number }>} */
  const buckets = [];

  if (range === "today" || range === "7d") {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(
        Date.UTC(
          baseDate.getUTCFullYear(),
          baseDate.getUTCMonth(),
          baseDate.getUTCDate() - i,
        ),
      );
      const start = d.getTime();
      const end = start + 24 * 60 * 60 * 1000;
      const key = d.toISOString().slice(0, 10);
      const label = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
      buckets.push({
        key,
        label,
        start,
        end,
        jobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        pages: 0,
      });
    }
  } else if (range === "month") {
    const year = baseDate.getUTCFullYear();
    const month = baseDate.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const step = 5;
    for (let day = 1; day <= daysInMonth; day += step) {
      const endDay = Math.min(day + step - 1, daysInMonth);
      const start = Date.UTC(year, month, day, 0, 0, 0);
      const end = Date.UTC(year, month, endDay + 1, 0, 0, 0);
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const label = `${day}-${endDay}/${month + 1}`;
      buckets.push({
        key,
        label,
        start,
        end,
        jobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        pages: 0,
      });
    }
  }

  for (const job of safeJobs) {
    if (!job || typeof job !== "object") continue;
    const ts = parseSafeDate(job.created);
    if (ts === null) continue;
    const pages = Math.max(0, Number(job.pages) || 0);
    for (const b of buckets) {
      if (ts >= b.start && ts < b.end) {
        b.jobs += 1;
        if (job.status === "completed") {
          b.completedJobs += 1;
          b.pages += pages;
        } else if (job.status === "failed") {
          b.failedJobs += 1;
        }
        break;
      }
    }
  }

  return buckets.map(
    ({ key, label, jobs: j, completedJobs, failedJobs, pages }) => ({
      key,
      label,
      jobs: j,
      completedJobs,
      failedJobs,
      pages,
    }),
  );
}

/**
 * Calculate comprehensive statistics for Printer-server.
 * @param {StatPrintJob[]} jobs
 * @param {StatUserRecord[]} [users]
 * @param {{ range?: PrintTimeRange | string; now?: number }} [options]
 */
export function calculatePrintStats(jobs, users = [], options = {}) {
  const safeJobs = Array.isArray(jobs)
    ? jobs.filter((j) => j && typeof j === "object")
    : [];
  const safeUsers = Array.isArray(users)
    ? users.filter((u) => u && typeof u === "object")
    : [];
  const range = options.range || "all";
  const now = Number.isFinite(options.now)
    ? /** @type {number} */ (options.now)
    : Date.now();

  const filteredJobs = filterPrintJobs(safeJobs, { range, now });

  const todayStart = getPrintRangeStart("today", now) ?? 0;
  const monthStart = getPrintRangeStart("month", now) ?? 0;
  const yearStart = getPrintRangeStart("year", now) ?? 0;
  const nowDate = new Date(now);
  const nextMonthStart = Date.UTC(
    nowDate.getUTCFullYear(),
    nowDate.getUTCMonth() + 1,
    1,
  );

  let jobsToday = 0;
  let pagesThisMonth = 0;
  let pagesThisYear = 0;

  for (const job of safeJobs) {
    const ts = parseSafeDate(job.created);
    if (ts === null) continue;
    const pages = Math.max(0, Number(job.pages) || 0);
    if (ts >= todayStart && ts <= now + 24 * 60 * 60 * 1000) {
      jobsToday += 1;
    }
    if (job.status === "completed") {
      if (ts >= monthStart && ts < nextMonthStart) {
        pagesThisMonth += pages;
      }
      if (ts >= yearStart) {
        pagesThisYear += pages;
      }
    }
  }

  let pendingJobs = 0;
  let processingJobs = 0;
  let completedJobs = 0;
  let failedJobs = 0;
  let pagesInPeriod = 0;
  let totalRequestedPages = 0;

  const userById = new Map(safeUsers.map((u) => [u.id, u]));
  /** @type {Map<string, { userId: string; name: string; email: string; pages: number; jobs: number }>} */
  const ranking = new Map();

  for (const job of filteredJobs) {
    const pages = Math.max(0, Number(job.pages) || 0);
    totalRequestedPages += pages;

    if (job.status === "pending") pendingJobs += 1;
    else if (job.status === "processing" || job.status === "printing")
      processingJobs += 1;
    else if (job.status === "completed") {
      completedJobs += 1;
      pagesInPeriod += pages;

      const u = userById.get(job.user) || job.expand?.user;
      const userId = job.user || "unknown";
      const current = ranking.get(userId) ?? {
        userId,
        name:
          u?.name ||
          u?.username ||
          (userId !== "unknown" ? userId : "ไม่ระบุชื่อ"),
        email: u?.email || "",
        pages: 0,
        jobs: 0,
      };
      current.pages += pages;
      current.jobs += 1;
      ranking.set(userId, current);
    } else if (job.status === "failed") {
      failedJobs += 1;
    }
  }

  const totalJobs = filteredJobs.length;
  const activeJobs = pendingJobs + processingJobs;
  const failureRate =
    totalJobs > 0 ? Math.round((failedJobs / totalJobs) * 1000) / 10 : 0;
  const avgPagesPerJob =
    completedJobs > 0
      ? Math.round((pagesInPeriod / completedJobs) * 10) / 10
      : totalJobs > 0
        ? Math.round((totalRequestedPages / totalJobs) * 10) / 10
        : 0;

  const topPrinters = [...ranking.values()]
    .sort((a, b) => b.pages - a.pages || b.jobs - a.jobs)
    .slice(0, 10);
  const topUser = topPrinters[0] ?? null;

  const trend = buildPrintTrend(safeJobs, range, now);
  const monthlyTrend = buildMonthlyPrintTrend(safeJobs, now);

  return {
    users: safeUsers.length,
    jobs: totalJobs,
    jobsToday,
    activeJobs,
    pendingJobs,
    processingJobs,
    completedJobs,
    failedJobs,
    pagesInPeriod,
    pagesThisMonth,
    pagesThisYear,
    failureRate,
    avgPagesPerJob,
    topUser,
    topPrinters,
    trend,
    monthlyTrend,
  };
}
