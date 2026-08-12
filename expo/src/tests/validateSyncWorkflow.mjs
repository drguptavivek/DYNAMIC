import assert from "node:assert/strict";

const {
  collectAssignedLocalityCodes,
  buildPushRecords,
  buildClockDriftAlert,
  collectAcceptedSyncIds,
  countOpenPulledTasks,
  formatClockDelta,
  selectChangedFormCodes,
  selectNextPullCursor,
  summarizeClockStatus,
  summarizePendingSyncData,
  formatSyncCompletionMessage,
} = await import("../modules/sync/syncWorkflow.js");

const user = {
  site_id: 2,
  area_assignments: [
    { locality_code: "01", active_to: null },
    { locality_code: "02", active_to: "2026-12-31" },
    { locality_code: "01", active_to: null },
    { locality_code: "999", active_to: "2026-01-01" },
  ],
};

assert.deepEqual(collectAssignedLocalityCodes(user, "2026-06-04"), ["01", "02"]);

const records = buildPushRecords({
  formResponses: [{ id: "response-1" }],
  domainEvents: [
    {
      id: "event-1",
      event_type: "household_baseline_confirmed",
      created_at: "2026-06-04T00:00:00.000Z",
      payload: {
        household_id: "1-02-0042-03",
        task_id: "task-1",
        timestamp: "2026-06-04T01:00:00.000Z",
      },
    },
  ],
});

assert.deepEqual(records, [
  { type: "form_response", data: { id: "response-1" } },
  {
    type: "domain_event",
    data: {
      id: "event-1",
      event_type: "household_baseline_confirmed",
      household_id: "1-02-0042-03",
      task_id: "task-1",
      timestamp: "2026-06-04T01:00:00.000Z",
      created_offline_at: "2026-06-04T00:00:00.000Z",
      event_datetime: "2026-06-04T01:00:00.000Z",
    },
  },
]);

assert.deepEqual(
  [
    ...collectAcceptedSyncIds({
      accepted_records: ["response-1", "event-1"],
      duplicates: ["response-2"],
    }),
  ].sort(),
  ["event-1", "response-1", "response-2"],
);

assert.deepEqual(
  summarizePendingSyncData({
    formResponses: [{ id: "response-1" }, { id: "response-2" }],
    domainEvents: [{ id: "event-1" }],
  }),
  {
    responses: 2,
    events: 1,
    total: 3,
  },
);

assert.deepEqual(
  selectChangedFormCodes(
    [
      { form_code: "HHQ", checksum: "new-hhq" },
      { form_code: "WQ", checksum: "same-wq" },
      { form_code: "PEF", checksum: "new-pef" },
    ],
    [
      { form_code: "HHQ", checksum: "old-hhq" },
      { form_code: "WQ", checksum: "same-wq" },
    ],
  ),
  ["HHQ", "PEF"],
);

assert.equal(
  selectNextPullCursor({ sync_cursor: "2026-06-04T09:29:42.012Z" }, "2026-06-03T00:00:00.000Z"),
  "2026-06-04T09:29:42.012Z",
);
assert.equal(selectNextPullCursor({}, "2026-06-03T00:00:00.000Z"), "2026-06-03T00:00:00.000Z");
assert.equal(selectNextPullCursor({ sync_cursor: "server-cursor" }, "2026-06-03T00:00:00.000Z"), null);

assert.equal(
  countOpenPulledTasks([
    { status: "open", lifecycle_status: "planned" },
    { status: "completed", lifecycle_status: "cancelled" },
    { status: "open", lifecycle_status: "cancelled" },
  ]),
  1,
);

assert.equal(
  formatSyncCompletionMessage({
    pulled: 4,
    pulledOpenTasks: 1,
    pulledHouseholds: 500,
    pulledMembers: 500,
    pulledEligibleWomen: 12,
    pushed: 2,
    events: 1,
    uploadErrors: 1,
    formsUpdated: 3,
  }),
  "Sync complete: 1 open task available, 500 households pulled, 500 members pulled, 12 eligible women pulled, 2 responses pushed, 1 event pushed, 1 upload error saved, 3 questionnaires refreshed",
);

assert.deepEqual(
  summarizeClockStatus({
    server_time_utc: "2026-06-10T10:00:00.000Z",
    device_time_utc: "2026-06-10T09:56:00.000Z",
    server_device_delta_ms: 240000,
    clock_status: "ok",
    warning_threshold_ms: 300000,
  }),
  {
    status: "ok",
    deltaMs: 240000,
    shouldWarn: false,
    message: "Device clock is within 4 min of server time.",
  },
);

assert.deepEqual(
  summarizeClockStatus({
    server_time_utc: "2026-06-10T10:00:00.000Z",
    device_time_utc: "2026-06-10T09:54:30.000Z",
    server_device_delta_ms: 330000,
    clock_status: "warning",
    warning_threshold_ms: 300000,
  }),
  {
    status: "warning",
    deltaMs: 330000,
    shouldWarn: true,
    message: "Device clock differs from server by 5 min 30 sec. Sync will continue, but correct the device time before field work.",
  },
);

assert.equal(formatClockDelta(-90500), "1 min 31 sec");
assert.equal(formatClockDelta(0), "0 sec");

assert.equal(
  buildClockDriftAlert({
    shouldWarn: false,
    message: "Device clock is within 4 min of server time.",
  }),
  null,
);

assert.deepEqual(
  buildClockDriftAlert({
    shouldWarn: true,
    message: "Device clock differs from server by 5 min 30 sec. Sync will continue, but correct the device time before field work.",
  }),
  {
    title: "Correct device date and time",
    message: "Device clock differs from server by 5 min 30 sec. Sync will continue, but correct the device time before field work.",
  },
);

console.log("Validated sync workflow helpers.");
