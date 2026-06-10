import assert from "node:assert/strict";
import test from "node:test";
import { buildSyncClockMetadata } from "./syncClock";

test("buildSyncClockMetadata captures server-device delta and warns after five minutes", () => {
  const serverNow = new Date("2026-06-10T10:00:00.000Z");

  assert.deepEqual(
    buildSyncClockMetadata("2026-06-10T09:56:00.000Z", serverNow),
    {
      server_time_utc: "2026-06-10T10:00:00.000Z",
      device_time_utc: "2026-06-10T09:56:00.000Z",
      server_device_delta_ms: 240000,
      clock_status: "ok",
      warning_threshold_ms: 300000,
    },
  );

  assert.deepEqual(
    buildSyncClockMetadata("2026-06-10T09:54:59.999Z", serverNow),
    {
      server_time_utc: "2026-06-10T10:00:00.000Z",
      device_time_utc: "2026-06-10T09:54:59.999Z",
      server_device_delta_ms: 300001,
      clock_status: "warning",
      warning_threshold_ms: 300000,
    },
  );
});

test("buildSyncClockMetadata treats invalid device time as unavailable", () => {
  assert.deepEqual(buildSyncClockMetadata("not-a-date", new Date("2026-06-10T10:00:00.000Z")), {
    server_time_utc: "2026-06-10T10:00:00.000Z",
    clock_status: "unavailable",
    warning_threshold_ms: 300000,
  });
});
