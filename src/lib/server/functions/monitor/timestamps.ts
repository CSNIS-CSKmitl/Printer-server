// Maps to track print job states and grace periods
export const inactiveTimestamps = new Map<string, number>();
export const missingJobTimestamps = new Map<string, number>();
export const jobSpoolTimestamps = new Map<string, number>();
export const jobHardwareSeenProcessing = new Set<string>();
export const jobHardwareIdleSince = new Map<string, number>();
export const jobInitialPageCounters = new Map<string, number>();
