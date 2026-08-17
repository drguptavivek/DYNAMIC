import assert from "node:assert/strict";

import { getTaskOpenBlockReason, canOpenTaskForm } from "../modules/worklist/taskOpenPolicy.js";

const openHhq = {
  status: "open",
  task_type: "HHQ",
  form_availability: "available",
};

const disabledTask = {
  status: "open",
  task_type: "PEF",
  form_availability: "disabled",
  disabled_reason: "Requires review",
};

const staleVaTask = {
  status: "open",
  task_type: "VA",
  form_availability: "available",
};

const vaTaskWithPayload = {
  status: "open",
  task_type: "VA",
  form_availability: "available",
  va_json: JSON.stringify({ form: "va" }),
};

const futurePlannedTask = {
  status: "open",
  lifecycle_status: "planned",
  task_type: "HRF",
  form_availability: "available",
  window_start: "2099-01-01",
};

const currentPlannedTask = {
  status: "open",
  lifecycle_status: "planned",
  task_type: "WQ",
  form_availability: "available",
  window_start: "2000-01-01",
};

const futureBaselineTask = {
  status: "open",
  lifecycle_status: "planned",
  task_type: "HHQ",
  form_availability: "available",
  window_start: "2099-01-01",
};

assert.equal(canOpenTaskForm(openHhq), true);
assert.equal(getTaskOpenBlockReason(disabledTask), "Requires review");
assert.equal(canOpenTaskForm(staleVaTask), false);
assert.match(getTaskOpenBlockReason(staleVaTask), /VA form is not available/i);
assert.equal(canOpenTaskForm(vaTaskWithPayload), true);
assert.equal(canOpenTaskForm(futurePlannedTask), false);
assert.match(getTaskOpenBlockReason(futurePlannedTask), /opens on 2099-01-01/i);
assert.equal(canOpenTaskForm(currentPlannedTask), true);
assert.equal(canOpenTaskForm(futureBaselineTask), true);

console.log("Task open policy validation passed");
