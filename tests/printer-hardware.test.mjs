import test from "node:test";
import assert from "node:assert/strict";
import { parseIppPrinterAttributes } from "../src/lib/server/printer-hardware.mjs";

test("detects idle state with warnings", () => {
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
  assert.equal(res.isOutOfPaper, true);
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

test("detects cover open state", () => {
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
