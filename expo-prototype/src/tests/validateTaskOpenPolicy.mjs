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

assert.equal(canOpenTaskForm(openHhq), true);
assert.equal(getTaskOpenBlockReason(disabledTask), "Requires review");
assert.equal(canOpenTaskForm(staleVaTask), false);
assert.match(getTaskOpenBlockReason(staleVaTask), /VA form is not available/i);
assert.equal(canOpenTaskForm(vaTaskWithPayload), true);

console.log("Task open policy validation passed");
