import assert from "node:assert/strict";

import {
  buildSubmissionDisplayItems,
  getHhqVisitResultLabel,
  getSubmissionResultLabel,
} from "../modules/questionnaires/formSubmissionHistory.js";

const responses = [
  {
    id: "hhq-visit-2",
    form_code: "HHQ",
    household_id: "2-02-0002-01",
    submitted_at: "2026-08-12T07:30:28.000Z",
    server_response_status: "superseded_revisit",
  },
  {
    id: "hhq-visit-1",
    form_code: "HHQ",
    household_id: "2-02-0002-01",
    submitted_at: "2026-08-06T07:22:30.000Z",
    server_response_status: "revisit_needed",
  },
  {
    id: "hhq-visit-3",
    form_code: "HHQ",
    household_id: "2-02-0002-01",
    submitted_at: "2026-08-12T07:31:26.000Z",
    server_response_status: "excluded_after_revisits",
  },
  {
    id: "wq-person-1",
    form_code: "WQ",
    household_id: "2-02-0002-01",
    subject_id: "2-02-0002-01-01",
    submitted_at: "2026-08-13T08:00:00.000Z",
  },
];

const items = buildSubmissionDisplayItems(responses);
assert.equal(items.length, 2);
assert.equal(items[0].type, "submission");
assert.equal(items[1].type, "hhq-history");
assert.deepEqual(
  items[1].responses.map((response) => response.id),
  ["hhq-visit-1", "hhq-visit-2", "hhq-visit-3"],
);
assert.equal(getSubmissionResultLabel(items[1].responses[0]), "Revisit needed");
assert.equal(getSubmissionResultLabel(items[1].responses[1]), "Previous revisit");
assert.equal(getSubmissionResultLabel(items[1].responses[2]), "Excluded after visit 3");
assert.equal(getHhqVisitResultLabel({ sync_status: "synced" }, 0, 2), "Previous revisit");

console.log("Form submission history validation passed");
