import test from "node:test";
import assert from "node:assert/strict";
import {
  parseIppPrinterAttributes,
  parseIppCompletedJobs,
  evaluateIppCompletedJob,
  buildSnmpGetPacket,
  parseSnmpGetResponse,
} from "../src/lib/server/printer-hardware.mjs";

test("detects idle state with warnings (does not flag outOfPaper if idle)", () => {
  const sample = `
        printer-name (nameWithoutLanguage) = 192.168.1.2
        printer-state (enum) = idle
        printer-state-change-time (integer) = 6185
        printer-state-reasons (1setOf keyword) = toner-low-warning,media-empty-report
        printer-alert-description (1setOf textWithoutLanguage) = 071-451 Tray 1 is out of paper. Load paper in Tray 1.
  `;
  const res = parseIppPrinterAttributes(sample);
  assert.equal(res.state, "idle");
  assert.equal(res.isJam, false);
  assert.equal(res.isOutOfPaper, false); // Idle means engine is not stopped
  assert.equal(res.isCoverOpen, false);
  assert.match(res.alertMessage, /Tray 1 is out of paper/);
});

test("detects processing state while printer is physically printing", () => {
  const sample = `
        printer-state (enum) = processing
        printer-state-reasons (1setOf keyword) = none
  `;
  const res = parseIppPrinterAttributes(sample);
  assert.equal(res.state, "processing");
  assert.equal(res.isJam, false);
  assert.equal(res.isOutOfPaper, false);
});

test("detects stopped state with paper jam", () => {
  const sample = `
        printer-state (enum) = stopped
        printer-state-reasons (1setOf keyword) = media-jam
        printer-alert-description (1setOf textWithoutLanguage) = 077-101 Paper jam in Tray 2.
  `;
  const res = parseIppPrinterAttributes(sample);
  assert.equal(res.state, "stopped");
  assert.equal(res.isJam, true);
  assert.equal(res.isCoverOpen, false);
  assert.match(res.alertMessage, /Paper jam/);
});

test("detects stopped state with out of paper", () => {
  const sample = `
        printer-state (enum) = stopped
        printer-state-reasons (1setOf keyword) = media-empty
        printer-alert-description (1setOf textWithoutLanguage) = 071-451 Out of paper.
  `;
  const res = parseIppPrinterAttributes(sample);
  assert.equal(res.state, "stopped");
  assert.equal(res.isOutOfPaper, true);
});

test("detects cover open state when stopped", () => {
  const sample = `
        printer-state (enum) = stopped
        printer-state-reasons (1setOf keyword) = door-open
  `;
  const res = parseIppPrinterAttributes(sample);
  assert.equal(res.state, "stopped");
  assert.equal(res.isCoverOpen, true);
});

test("handles empty or null input safely", () => {
  const resNull = parseIppPrinterAttributes(null);
  assert.equal(resNull.state, "unknown");
  assert.equal(resNull.isJam, false);

  const resEmpty = parseIppPrinterAttributes("");
  assert.equal(resEmpty.state, "unknown");
  assert.equal(resEmpty.isJam, false);
});

test("parseIppCompletedJobs parses aborted and completed jobs from ipptool output", () => {
  const sample = `
    "Get Completed Jobs":
        job-attributes-tag
        job-id (integer) = 5418
        job-name (nameWithoutLanguage) = job_pt36 user@kmitl.ac.th - 69.pdf
        job-state (enum) = aborted
        job-state-reasons (1setOf keyword) = aborted-by-system,document-format-error
        job-impressions-completed (integer) = 0
        job-media-sheets-completed (integer) = 0
        job-attributes-tag
        job-id (integer) = 5419
        job-name (nameWithoutLanguage) = job_ok99 user@kmitl.ac.th - report.pdf
        job-state (enum) = completed
        job-state-reasons (keyword) = job-completed-successfully
        job-impressions-completed (integer) = 2
        job-media-sheets-completed (integer) = 2
  `;
  const jobs = parseIppCompletedJobs(sample);
  assert.equal(jobs.length, 2);

  assert.equal(jobs[0].jobId, 5418);
  assert.equal(jobs[0].jobName, "job_pt36 user@kmitl.ac.th - 69.pdf");
  assert.equal(jobs[0].state, "aborted");
  assert.deepEqual(jobs[0].reasons, ["aborted-by-system", "document-format-error"]);
  assert.equal(jobs[0].impressionsCompleted, 0);
  assert.equal(jobs[0].mediaSheetsCompleted, 0);

  assert.equal(jobs[1].jobId, 5419);
  assert.equal(jobs[1].state, "completed");
  assert.equal(jobs[1].impressionsCompleted, 2);
});

test("evaluateIppCompletedJob flags 016-751 aborted/0-sheet jobs as failed for full refund", () => {
  const aborted = evaluateIppCompletedJob(
    {
      state: "aborted",
      reasons: ["aborted-by-system", "document-format-error"],
      impressionsCompleted: 0,
      mediaSheetsCompleted: 0,
    },
    1,
  );
  assert.equal(aborted.failed, true);
  assert.equal(aborted.actualPages, 0);
  assert.match(aborted.errorMessage, /aborted/);

  const completedWithErrors = evaluateIppCompletedJob(
    {
      state: "completed",
      reasons: ["job-completed-with-errors"],
      impressionsCompleted: 0,
      mediaSheetsCompleted: 0,
    },
    2,
  );
  assert.equal(completedWithErrors.failed, true);
  assert.equal(completedWithErrors.actualPages, 0);

  const zeroOutput = evaluateIppCompletedJob(
    {
      state: "completed",
      reasons: ["job-completed-successfully"],
      impressionsCompleted: 0,
      mediaSheetsCompleted: 0,
    },
    1,
  );
  assert.equal(zeroOutput.failed, true);
  assert.equal(zeroOutput.actualPages, 0);

  const normalOk = evaluateIppCompletedJob(
    {
      state: "completed",
      reasons: ["job-completed-successfully"],
      impressionsCompleted: 3,
      mediaSheetsCompleted: 3,
    },
    3,
  );
  assert.equal(normalOk.failed, false);
  assert.equal(normalOk.actualPages, 3);
});

test("buildSnmpGetPacket and parseSnmpGetResponse handle Counter32 page counters", () => {
  const req = buildSnmpGetPacket("1.3.6.1.2.1.43.10.2.1.4.1.1", "public", 42);
  assert.ok(Buffer.isBuffer(req));
  assert.equal(req[0], 0x30); // ASN.1 SEQUENCE

  // Valid SNMPv2c GetResponse with Counter32 (0x41) = 12345 (0x3039)
  const validResponse = Buffer.from([
    0x30, 0x2d,
    0x02, 0x01, 0x01, // version = SNMPv2c (1)
    0x04, 0x06, 0x70, 0x75, 0x62, 0x6c, 0x69, 0x63, // "public"
    0xa2, 0x20, // GetResponse-PDU
    0x02, 0x01, 0x2a, // request-id = 42
    0x02, 0x01, 0x00, // error-status = 0
    0x02, 0x01, 0x00, // error-index = 0
    0x30, 0x15, // VarBindList
    0x30, 0x13, // VarBind
    0x06, 0x0d, 0x2b, 0x06, 0x01, 0x02, 0x01, 0x2b, 0x0a, 0x02, 0x01, 0x04, 0x01, 0x01, 0x00, // OID
    0x41, 0x02, 0x30, 0x39, // Counter32 = 12345
  ]);
  assert.equal(parseSnmpGetResponse(validResponse), 12345);

  // Non-zero error-status returns null
  const errResponse = Buffer.from(validResponse);
  errResponse[20] = 0x02; // noSuchName
  assert.equal(parseSnmpGetResponse(errResponse), null);

  // Malformed / null returns null
  assert.equal(parseSnmpGetResponse(null), null);
  assert.equal(parseSnmpGetResponse(Buffer.from([0x30, 0x01])), null);
});
