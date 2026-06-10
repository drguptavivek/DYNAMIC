const DEFAULT_CLOCK_WARNING_THRESHOLD_MS = 5 * 60 * 1000;

export interface SyncClockMetadata {
  server_time_utc: string;
  device_time_utc?: string;
  server_device_delta_ms?: number;
  clock_status: "ok" | "warning" | "unavailable";
  warning_threshold_ms: number;
}

export function buildSyncClockMetadata(
  deviceTimeUtc?: unknown,
  serverNow = new Date(),
  warningThresholdMs = DEFAULT_CLOCK_WARNING_THRESHOLD_MS,
): SyncClockMetadata {
  const metadata: SyncClockMetadata = {
    server_time_utc: serverNow.toISOString(),
    clock_status: "unavailable",
    warning_threshold_ms: warningThresholdMs,
  };

  if (typeof deviceTimeUtc !== "string" || !deviceTimeUtc.trim()) {
    return metadata;
  }

  const deviceTime = new Date(deviceTimeUtc);
  if (Number.isNaN(deviceTime.getTime())) {
    return metadata;
  }

  const deltaMs = serverNow.getTime() - deviceTime.getTime();
  return {
    ...metadata,
    device_time_utc: deviceTime.toISOString(),
    server_device_delta_ms: deltaMs,
    clock_status: Math.abs(deltaMs) > warningThresholdMs ? "warning" : "ok",
  };
}
