/**
 * Parses raw ipptool output into a structured PrinterHwStatus object.
 *
 * @param {string | null | undefined} stdout
 * @returns {{
 *   state: "idle" | "processing" | "stopped" | "unknown";
 *   reasons: string[];
 *   alertMessage?: string;
 *   isJam: boolean;
 *   isOutOfPaper: boolean;
 *   isCoverOpen: boolean;
 * }}
 */
export function parseIppPrinterAttributes(stdout) {
  if (!stdout) {
    return {
      state: "unknown",
      reasons: [],
      isJam: false,
      isOutOfPaper: false,
      isCoverOpen: false,
    };
  }

  /** @type {"idle" | "processing" | "stopped" | "unknown"} */
  let state = "unknown";
  /** @type {string[]} */
  const reasons = [];
  /** @type {string | undefined} */
  let alertMessage = undefined;

  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();

    const stateMatch = line.match(/^printer-state\s+\([^)]+\)\s*=\s*(\w+)/);
    if (stateMatch) {
      const s = stateMatch[1].toLowerCase();
      if (s === "idle" || s === "processing" || s === "stopped") {
        state = /** @type {"idle" | "processing" | "stopped"} */ (s);
      }
    }

    const reasonsMatch = line.match(
      /^printer-state-reasons\s+\([^)]+\)\s*=\s*(.+)/,
    );
    if (reasonsMatch) {
      const parsedReasons = reasonsMatch[1]
        .split(",")
        .map((r) => r.trim().toLowerCase());
      reasons.push(...parsedReasons);
    }

    const alertMatch = line.match(
      /^printer-alert-description\s+\([^)]+\)\s*=\s*(.+)/,
    );
    if (alertMatch) {
      alertMessage = alertMatch[1].trim();
    }
  }

  const reasonsStr = reasons.join(" ");
  const alertStr = (alertMessage ?? "").toLowerCase();
  const combined = `${reasonsStr} ${alertStr}`;

  // Only consider fatal jam / out-of-paper / cover-open if printer engine is actually stopped
  const isStopped = state === "stopped";
  const isJam = isStopped && combined.includes("jam");
  const isOutOfPaper =
    isStopped &&
    (combined.includes("media-empty") || combined.includes("out of paper"));
  const isCoverOpen =
    isStopped &&
    (combined.includes("cover-open") || combined.includes("door-open"));

  return {
    state,
    reasons,
    alertMessage,
    isJam,
    isOutOfPaper,
    isCoverOpen,
  };
}

/**
 * Parses `ipptool -tv` output from an IPP Get-Jobs (which-jobs=completed) query
 * into structured job entries.
 *
 * @param {string | null | undefined} stdout
 * @returns {Array<{
 *   jobId: number | null;
 *   jobName: string;
 *   state: "completed" | "aborted" | "canceled" | "pending" | "processing" | "unknown";
 *   reasons: string[];
 *   impressionsCompleted: number | null;
 *   mediaSheetsCompleted: number | null;
 * }>}
 */
export function parseIppCompletedJobs(stdout) {
  if (!stdout) return [];

  /**
   * @type {Array<{
   *   jobId: number | null;
   *   jobName: string;
   *   state: "completed" | "aborted" | "canceled" | "pending" | "processing" | "unknown";
   *   reasons: string[];
   *   impressionsCompleted: number | null;
   *   mediaSheetsCompleted: number | null;
   * }>}
   */
  const jobs = [];
  /** @type {any} */
  let current = null;

  const pushCurrent = () => {
    if (
      current &&
      (current.jobId !== null || current.jobName !== "" || current.state !== "unknown")
    ) {
      jobs.push(current);
    }
  };

  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();

    if (/^job-attributes-tag\b/i.test(line)) {
      pushCurrent();
      current = {
        jobId: null,
        jobName: "",
        state: "unknown",
        reasons: [],
        impressionsCompleted: null,
        mediaSheetsCompleted: null,
      };
      continue;
    }

    // Some ipptool outputs start a new job block directly with job-id without repeating the tag
    const idMatch = line.match(/^job-id\s+\([^)]+\)\s*=\s*(\d+)/);
    if (idMatch) {
      if (!current || current.jobId !== null) {
        pushCurrent();
        current = {
          jobId: null,
          jobName: "",
          state: "unknown",
          reasons: [],
          impressionsCompleted: null,
          mediaSheetsCompleted: null,
        };
      }
      current.jobId = parseInt(idMatch[1], 10);
      continue;
    }

    if (!current) continue;

    const nameMatch = line.match(/^job-name\s+\([^)]+\)\s*=\s*(.+)/);
    if (nameMatch) {
      current.jobName = nameMatch[1].trim();
      continue;
    }

    const stateMatch = line.match(/^job-state\s+\([^)]+\)\s*=\s*(\w+)/);
    if (stateMatch) {
      const s = stateMatch[1].toLowerCase();
      if (
        s === "completed" ||
        s === "aborted" ||
        s === "canceled" ||
        s === "pending" ||
        s === "processing"
      ) {
        current.state = s;
      } else if (s === "7") {
        current.state = "canceled";
      } else if (s === "8") {
        current.state = "aborted";
      } else if (s === "9") {
        current.state = "completed";
      }
      continue;
    }

    const reasonsMatch = line.match(/^job-state-reasons\s+\([^)]+\)\s*=\s*(.+)/);
    if (reasonsMatch) {
      current.reasons.push(
        ...reasonsMatch[1]
          .split(",")
          .map((r) => r.trim().toLowerCase())
          .filter(Boolean),
      );
      continue;
    }

    const impMatch = line.match(
      /^job-impressions-completed\s+\([^)]+\)\s*=\s*(-?\d+)/,
    );
    if (impMatch) {
      const val = parseInt(impMatch[1], 10);
      if (Number.isInteger(val) && val >= 0) {
        current.impressionsCompleted = val;
      }
      continue;
    }

    const sheetsMatch = line.match(
      /^job-media-sheets-completed\s+\([^)]+\)\s*=\s*(-?\d+)/,
    );
    if (sheetsMatch) {
      const val = parseInt(sheetsMatch[1], 10);
      if (Number.isInteger(val) && val >= 0) {
        current.mediaSheetsCompleted = val;
      }
      continue;
    }
  }

  pushCurrent();
  return jobs;
}

/**
 * Evaluates a matched IPP completed job record from the physical printer
 * to determine whether the job failed / was canceled / printed 0 sheets.
 *
 * @param {{
 *   state: string;
 *   reasons: string[];
 *   impressionsCompleted: number | null;
 *   mediaSheetsCompleted: number | null;
 * }} ippJob
 * @param {number} expectedPages
 * @returns {{ failed: boolean; actualPages: number; errorMessage?: string }}
 */
export function evaluateIppCompletedJob(ippJob, expectedPages) {
  const reasonsStr = (ippJob.reasons ?? []).join(", ");
  const hasErrorReason = (ippJob.reasons ?? []).some(
    (r) =>
      r.includes("error") ||
      r.includes("abort") ||
      r.includes("cancel") ||
      r.includes("unsupported") ||
      r.includes("format-error") ||
      r.includes("stopped"),
  );

  // Prefer impressionsCompleted (counts printed sides); fall back to mediaSheetsCompleted
  const reportedOutput =
    ippJob.impressionsCompleted !== null
      ? ippJob.impressionsCompleted
      : ippJob.mediaSheetsCompleted;

  if (ippJob.state === "aborted" || ippJob.state === "canceled" || hasErrorReason) {
    const actualPages =
      reportedOutput !== null ? Math.min(expectedPages, Math.max(0, reportedOutput)) : 0;
    const reasonLabel = reasonsStr || ippJob.state;
    const isFormatError = (ippJob.reasons ?? []).some(
      (r) => r.includes("format-error") || r.includes("unsupported"),
    );

    let errorMessage;
    if (isFormatError) {
      errorMessage = `เครื่องพิมพ์ไม่สามารถอ่านไฟล์ PDF นี้ได้ (${reasonLabel}) — พิมพ์ออก ${actualPages}/${expectedPages} หน้า (คืนเครดิตแล้ว) แนะนำให้ Save/Export เป็น PDF ใหม่แล้วลองอีกครั้ง`;
    } else if (ippJob.state === "canceled") {
      errorMessage = `งานถูกยกเลิกที่เครื่องพิมพ์ (${reasonLabel}) — พิมพ์ออก ${actualPages}/${expectedPages} หน้า (คืนเครดิตแล้ว)`;
    } else {
      errorMessage = `เครื่องพิมพ์ยกเลิกงานเนื่องจากเกิดข้อผิดพลาด (${reasonLabel}) — พิมพ์ออก ${actualPages}/${expectedPages} หน้า (คืนเครดิตแล้ว)`;
    }

    return {
      failed: true,
      actualPages,
      errorMessage,
    };
  }

  if (ippJob.state === "completed" && reportedOutput !== null && reportedOutput === 0 && expectedPages > 0) {
    return {
      failed: true,
      actualPages: 0,
      errorMessage: `เครื่องพิมพ์ไม่ได้พิมพ์กระดาษออก (0/${expectedPages} หน้า — ไฟล์ PDF อาจไม่รองรับ เช่น รหัส 016-751) คืนเครดิตให้แล้ว แนะนำให้ Save เป็น PDF ใหม่แล้วลองอีกครั้ง`,
    };
  }

  return {
    failed: false,
    actualPages: expectedPages,
  };
}

/**
 * Encodes an ASN.1 BER length field.
 * @param {number} len
 * @returns {number[]}
 */
function encodeBerLength(len) {
  if (len < 0x80) return [len];
  const bytes = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}

/**
 * Encodes an ASN.1 TLV (Tag-Length-Value).
 * @param {number} tag
 * @param {number[] | Uint8Array} value
 * @returns {number[]}
 */
function encodeTlv(tag, value) {
  const arr = Array.isArray(value) ? value : Array.from(value);
  return [tag, ...encodeBerLength(arr.length), ...arr];
}

/**
 * Encodes a non-negative integer as ASN.1 INTEGER.
 * @param {number} num
 * @returns {number[]}
 */
function encodeBerInt(num) {
  if (num === 0) return encodeTlv(0x02, [0]);
  const bytes = [];
  let n = num;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  if (bytes[0] & 0x80) bytes.unshift(0x00);
  return encodeTlv(0x02, bytes);
}

/**
 * Encodes a dotted OID string (e.g. "1.3.6.1.2.1.43.10.2.1.4.1.1") as ASN.1 OBJECT IDENTIFIER.
 * @param {string} oidStr
 * @returns {number[]}
 */
function encodeBerOid(oidStr) {
  const parts = oidStr.split(".").map((p) => parseInt(p, 10));
  const out = [parts[0] * 40 + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i];
    if (v === 0) {
      out.push(0);
    } else {
      const chunks = [];
      while (v > 0) {
        chunks.unshift(v & 0x7f);
        v >>= 7;
      }
      for (let j = 0; j < chunks.length - 1; j++) {
        out.push(chunks[j] | 0x80);
      }
      out.push(chunks[chunks.length - 1]);
    }
  }
  return encodeTlv(0x06, out);
}

/**
 * Builds an SNMPv2c GetRequest UDP packet for a single OID (e.g. prtMarkerLifeCount).
 *
 * @param {string} oidStr
 * @param {string} [community="public"]
 * @param {number} [requestId=1]
 * @returns {Buffer}
 */
export function buildSnmpGetPacket(oidStr, community = "public", requestId = 1) {
  const version = encodeBerInt(1); // SNMPv2c = 1
  const commBytes = encodeTlv(0x04, Buffer.from(community, "ascii"));
  const varBind = encodeTlv(0x30, [...encodeBerOid(oidStr), 0x05, 0x00]);
  const varBindList = encodeTlv(0x30, varBind);
  const pduBody = [
    ...encodeBerInt(requestId),
    ...encodeBerInt(0), // error-status
    ...encodeBerInt(0), // error-index
    ...varBindList,
  ];
  const pdu = encodeTlv(0xa0, pduBody); // GetRequest-PDU
  return Buffer.from(encodeTlv(0x30, [...version, ...commBytes, ...pdu]));
}

/**
 * Parses an SNMPv2c GetResponse packet and extracts the first integer/counter value.
 * Returns null if the packet is malformed or contains an SNMP error / noSuchObject.
 *
 * @param {Buffer | Uint8Array | null | undefined} buf
 * @returns {number | null}
 */
export function parseSnmpGetResponse(buf) {
  if (!buf || buf.length < 10) return null;
  let offset = 0;

  const readTlv = () => {
    if (offset >= buf.length) return null;
    const tag = buf[offset++];
    if (offset >= buf.length) return null;
    let len = buf[offset++];
    if (len & 0x80) {
      const numBytes = len & 0x7f;
      if (numBytes === 0 || offset + numBytes > buf.length) return null;
      len = 0;
      for (let i = 0; i < numBytes; i++) {
        len = (len << 8) | buf[offset++];
      }
    }
    if (offset + len > buf.length) return null;
    const start = offset;
    offset += len;
    return { tag, start, end: offset, len };
  };

  // Outer SEQUENCE
  const outer = readTlv();
  if (!outer || outer.tag !== 0x30) return null;
  offset = outer.start;

  const version = readTlv();
  const community = readTlv();
  const pdu = readTlv();
  if (!version || !community || !pdu || pdu.tag !== 0xa2) return null; // 0xa2 = GetResponse-PDU

  offset = pdu.start;
  const reqId = readTlv();
  const errStatus = readTlv();
  const errIndex = readTlv();
  const varBindList = readTlv();
  if (!reqId || !errStatus || !errIndex || !varBindList || varBindList.tag !== 0x30) {
    return null;
  }

  // Check error-status == 0
  let errVal = 0;
  for (let i = errStatus.start; i < errStatus.end; i++) {
    errVal = (errVal << 8) | buf[i];
  }
  if (errVal !== 0) return null;

  offset = varBindList.start;
  const varBind = readTlv();
  if (!varBind || varBind.tag !== 0x30) return null;

  offset = varBind.start;
  const oid = readTlv();
  const val = readTlv();
  if (!oid || !val) return null;

  // Accept INTEGER (0x02), Counter32 (0x41), Gauge32 (0x42), Counter64 (0x46)
  if (val.tag !== 0x02 && val.tag !== 0x41 && val.tag !== 0x42 && val.tag !== 0x46) {
    return null;
  }

  let result = 0;
  for (let i = val.start; i < val.end; i++) {
    result = result * 256 + buf[i];
  }
  return Number.isSafeInteger(result) ? result : null;
}
