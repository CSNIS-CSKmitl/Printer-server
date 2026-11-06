import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePrintStats,
  filterPrintJobs,
  isJobInRange,
  matchesJobDrilldown,
  parseSafeDate,
} from "../src/lib/print-stats.mjs";

const NOW = Date.parse("2026-10-17T12:00:00.000Z");

const sampleUsers = [
  { id: "user_alice", name: "Alice KMITL", email: "alice@kmitl.ac.th" },
  { id: "user_bob", name: "Bob CS", email: "bob@kmitl.ac.th" },
  { id: "user_charlie", name: "Charlie", email: "charlie@kmitl.ac.th" },
];

const sampleJobs = [
  {
    id: "job_today_completed",
    user: "user_alice",
    filename: "thesis.pdf",
    status: "completed",
    pages: 30,
    copies: 1,
    printer_name: "HP-Lab1",
    created: "2026-10-17 04:00:00.000Z",
  },
  {
    id: "job_today_pending",
    user: "user_bob",
    filename: "slides.pdf",
    status: "pending",
    pages: 10,
    copies: 1,
    printer_name: "HP-Lab1",
    created: "2026-10-17 06:00:00.000Z",
  },
  {
    id: "job_week_processing",
    user: "user_bob",
    filename: "report.pdf",
    status: "processing",
    pages: 8,
    copies: 1,
    printer_name: "HP-Lab1",
    created: "2026-10-14 09:00:00.000Z",
  },
  {
    id: "job_month_completed",
    user: "user_bob",
    filename: "handout.pdf",
    status: "completed",
    pages: 50,
    copies: 2,
    printer_name: "HP-Lab1",
    created: "2026-10-03 10:00:00.000Z",
  },
  {
    id: "job_year_failed",
    user: "user_alice",
    filename: "corrupt.pdf",
    status: "failed",
    pages: 15,
    copies: 1,
    printer_name: "HP-Lab1",
    created: "2026-06-12 08:00:00.000Z",
  },
];

test("handles empty data and null/undefined inputs safely without throwing", () => {
  const empty = calculatePrintStats([], [], { range: "all", now: NOW });
  assert.equal(empty.users, 0);
  assert.equal(empty.jobs, 0);
  assert.equal(empty.jobsToday, 0);
  assert.equal(empty.activeJobs, 0);
  assert.equal(empty.completedJobs, 0);
  assert.equal(empty.failedJobs, 0);
  assert.equal(empty.failureRate, 0);
  assert.equal(empty.avgPagesPerJob, 0);
  assert.equal(empty.pagesThisMonth, 0);
  assert.equal(empty.pagesThisYear, 0);
  assert.equal(empty.topUser, null);
  assert.deepEqual(empty.topPrinters, []);
  assert.ok(Array.isArray(empty.trend));
  assert.equal(empty.monthlyTrend.length, 6);

  // @ts-expect-error testing invalid runtime input
  const nullStats = calculatePrintStats(null, undefined, {
    range: "today",
    now: NOW,
  });
  assert.equal(nullStats.jobs, 0);
  assert.equal(nullStats.failureRate, 0);
  assert.equal(nullStats.avgPagesPerJob, 0);
});

test("parses valid and invalid dates safely and filters invalid dates on non-all ranges", () => {
  assert.equal(parseSafeDate(""), null);
  assert.equal(parseSafeDate(null), null);
  assert.equal(parseSafeDate("invalid-date-value"), null);
  assert.equal(
    parseSafeDate("2026-10-17 04:00:00.000Z"),
    Date.parse("2026-10-17T04:00:00.000Z"),
  );

  assert.equal(isJobInRange("invalid-date", "today", NOW), false);
  assert.equal(isJobInRange("invalid-date", "7d", NOW), false);
  assert.equal(isJobInRange("invalid-date", "all", NOW), true);

  const badJobs = [
    {
      id: "bad1",
      user: "user_alice",
      status: "completed",
      pages: -10, // negative pages should clamp to 0
      created: "not-a-date",
    },
  ];
  const allStats = calculatePrintStats(badJobs, sampleUsers, {
    range: "all",
    now: NOW,
  });
  assert.equal(allStats.jobs, 1);
  assert.equal(allStats.pagesInPeriod, 0);
  assert.equal(allStats.avgPagesPerJob, 0);

  const todayStats = calculatePrintStats(badJobs, sampleUsers, {
    range: "today",
    now: NOW,
  });
  assert.equal(todayStats.jobs, 0);
});

test("calculates failure rate, average paper usage, top user, and monthly trend accurately", () => {
  const stats = calculatePrintStats(sampleJobs, sampleUsers, {
    range: "all",
    now: NOW,
  });

  assert.equal(stats.users, 3);
  assert.equal(stats.jobs, 5);
  assert.equal(stats.jobsToday, 2);
  assert.equal(stats.activeJobs, 2); // 1 pending + 1 processing
  assert.equal(stats.pendingJobs, 1);
  assert.equal(stats.processingJobs, 1);
  assert.equal(stats.completedJobs, 2);
  assert.equal(stats.failedJobs, 1);

  // Failure rate: 1 failed out of 5 jobs = 20%
  assert.equal(stats.failureRate, 20);

  // Average pages per completed job: (30 + 50) / 2 = 40
  assert.equal(stats.pagesInPeriod, 80);
  assert.equal(stats.avgPagesPerJob, 40);
  assert.equal(stats.pagesThisMonth, 80);
  assert.equal(stats.pagesThisYear, 80);

  // Top user: Bob has 50 pages, Alice has 30 pages
  assert.ok(stats.topUser);
  assert.equal(stats.topUser.userId, "user_bob");
  assert.equal(stats.topUser.name, "Bob CS");
  assert.equal(stats.topUser.pages, 50);
  assert.equal(stats.topPrinters.length, 2);
  assert.equal(stats.topPrinters[1].userId, "user_alice");
  assert.equal(stats.topPrinters[1].pages, 30);

  // Monthly trend has 6 months and includes June and October 2026
  assert.equal(stats.monthlyTrend.length, 6);
  const octBucket = stats.monthlyTrend.find((m) => m.key === "2026-10");
  assert.ok(octBucket);
  assert.equal(octBucket.pages, 80);
  assert.equal(octBucket.jobs, 4);
});

test("filters print jobs by time range (today, 7d, month, year, all) and drill-down status", () => {
  const todayStats = calculatePrintStats(sampleJobs, sampleUsers, {
    range: "today",
    now: NOW,
  });
  assert.equal(todayStats.jobs, 2); // thesis.pdf + slides.pdf
  assert.equal(todayStats.completedJobs, 1);
  assert.equal(todayStats.avgPagesPerJob, 30);
  assert.equal(todayStats.failureRate, 0);

  const weekStats = calculatePrintStats(sampleJobs, sampleUsers, {
    range: "7d",
    now: NOW,
  });
  assert.equal(weekStats.jobs, 3); // Oct 17 (x2) + Oct 14 (x1)

  const monthStats = calculatePrintStats(sampleJobs, sampleUsers, {
    range: "month",
    now: NOW,
  });
  assert.equal(monthStats.jobs, 4); // Oct 17 (x2) + Oct 14 + Oct 3

  const yearStats = calculatePrintStats(sampleJobs, sampleUsers, {
    range: "year",
    now: NOW,
  });
  assert.equal(yearStats.jobs, 5);

  // Drill-down status checks
  assert.equal(
    filterPrintJobs(sampleJobs, { drilldown: "all", now: NOW }).length,
    5,
  );
  assert.equal(
    filterPrintJobs(sampleJobs, { drilldown: "pending", now: NOW }).length,
    2,
  ); // pending + processing
  assert.equal(
    filterPrintJobs(sampleJobs, { drilldown: "printing", now: NOW }).length,
    2,
  );
  assert.equal(
    filterPrintJobs(sampleJobs, { drilldown: "completed", now: NOW }).length,
    2,
  );
  assert.equal(
    filterPrintJobs(sampleJobs, { drilldown: "failed", now: NOW }).length,
    1,
  );
  assert.equal(matchesJobDrilldown(sampleJobs[2], "pending"), true);
});
