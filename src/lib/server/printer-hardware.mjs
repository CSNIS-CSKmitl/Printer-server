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
