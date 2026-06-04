import assert from "node:assert/strict";

const {
  collectAssignedLocalityCodes,
  buildPushRecords,
  collectAcceptedSyncIds,
  selectChangedFormCodes,
  selectNextPullCursor,
  summarizePendingSyncData,
  formatSyncCompletionMessage,
} = await import("../modules/sync/syncWorkflow.js");

const user = {
  site_id: 2,
  area_assignments: [
    { locality_code: "101", active_to: null },
    { locality_code: "102", active_to: "2026-12-31" },
    { locality_code: "101", active_to: null },
    { locality_code: "999", active_to: "2026-01-01" },
  ],
};

assert.deepEqual(collectAssignedLocalityCodes(user, "2026-06-04"), ["101", "102"]);

const records = buildPushRecords({
  formResponses: [{ id: "response-1" }],
  domainEvents: [
    {
      id: "event-1",
      event_type: "household_enrolled",
      created_at: "2026-06-04T00:00:00.000Z",
      payload: {
        household_id: "1-2-0042-03",
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
      event_type: "household_enrolled",
      household_id: "1-2-0042-03",
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

assert.equal(selectNextPullCursor({ sync_cursor: "server-cursor" }, "old-cursor"), "server-cursor");
assert.equal(selectNextPullCursor({}, "old-cursor"), "old-cursor");

assert.equal(
  formatSyncCompletionMessage({
    pulled: 4,
    pushed: 2,
    events: 1,
    formsUpdated: 3,
  }),
  "Sync complete: 4 pulled, 2 responses pushed, 1 event pushed, 3 forms updated",
);

console.log("Validated sync workflow helpers.");
