import assert from "node:assert/strict";
import test from "node:test";
import { buildMissingAssignedHhqTasks } from "./assignedHhqTasks";

const assignedAt = new Date("2026-09-25T08:00:00.000Z");
const assignedHouseholds = [
  {
    household_id: "1-01-0001-01",
    site_id: 1,
    locality_code: "01",
    baseline_enrollment_status: "pending",
    assigned_at: assignedAt,
  },
  {
    household_id: "1-01-0002-02",
    site_id: 1,
    locality_code: "01",
    baseline_enrollment_status: "completed",
    assigned_at: assignedAt,
  },
];

test("buildMissingAssignedHhqTasks creates an HHQ only for an assigned pending household", () => {
  const tasks = buildMissingAssignedHhqTasks(
    assignedHouseholds,
    [],
    new Date("2026-09-25T09:00:00.000Z"),
  );

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].household_id, "1-01-0001-01");
  assert.equal(tasks[0].anchor_date, "2026-09-25");
  assert.equal(tasks[0].target_date, "2027-03-24");
  assert.equal(tasks[0].status, "planned");
});

test("buildMissingAssignedHhqTasks preserves actionable and finished HHQ tasks", () => {
  for (const status of ["planned", "open", "in_progress", "completed", "missed", "cancelled"]) {
    const tasks = buildMissingAssignedHhqTasks(assignedHouseholds, [
      { household_id: "1-01-0001-01", status },
    ]);
    assert.equal(tasks.length, 0, `status ${status} must block duplicate HHQ creation`);
  }
});

test("buildMissingAssignedHhqTasks repairs a household with only a superseded HHQ", () => {
  const tasks = buildMissingAssignedHhqTasks(assignedHouseholds, [
    { household_id: "1-01-0001-01", status: "superseded" },
  ]);
  assert.equal(tasks.length, 1);
});
