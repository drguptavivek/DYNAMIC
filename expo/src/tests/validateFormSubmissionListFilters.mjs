import assert from "node:assert/strict";

import {
  filterResponses,
  getSubmissionCorrectionCandidates,
  getSubmissionCorrectionClock,
  normalizeFormResponse,
  uniqueOptions,
} from "../modules/questionnaires/formSubmissionHistory.js";
import {
  WQ_VISITOR_CORRECTION_DRAFT_STATUS_PREFIX,
  WQ_VISITOR_EXCLUDED_STATUS,
} from "../modules/questionnaires/wqVisitorExclusion.js";

// A large history is scanned only when loaded; clock work includes live corrections
// and linked drafts needing expiry cleanup, not ordinary or old excluded forms.
{
  const submittedAt = Date.parse("2026-10-16T10:00:00.000Z");
  const nowMs = submittedAt + 9 * 60 * 1000;
  const live = {
    id: "live", form_code: "WQ", sync_status: "pending",
    submitted_at: new Date(submittedAt).toISOString(),
    server_response_status: WQ_VISITOR_EXCLUDED_STATUS,
  };
  const liveDraft = {
    ...live, id: "live-draft",
    server_response_status: `${WQ_VISITOR_CORRECTION_DRAFT_STATUS_PREFIX}draft-1`,
  };
  const expiredDraft = {
    ...liveDraft, id: "expired-draft", submitted_at: "2026-10-15T10:00:00.000Z",
  };
  const largeHistory = Array.from({ length: 100_001 }, (_, index) => ({
    ...live, id: `old-${index}`, submitted_at: "2026-10-15T10:00:00.000Z",
  }));
  const rows = [...largeHistory, live, liveDraft, expiredDraft,
    { ...live, id: "synced", sync_status: "synced" },
    { ...live, id: "invalid-date", submitted_at: "bad date" }];
  const candidates = getSubmissionCorrectionCandidates(rows, nowMs);
  assert.deepEqual(candidates.map((row) => row.id), ["live", "live-draft", "expired-draft"]);
  assert.deepEqual(getSubmissionCorrectionClock(candidates, nowMs), {
    hasLiveCorrection: true, expiredCorrectionKey: "expired-draft",
  });
  assert.deepEqual(getSubmissionCorrectionClock(candidates, submittedAt + 10 * 60 * 1000), {
    hasLiveCorrection: false, expiredCorrectionKey: "expired-draft|live-draft",
  });
  assert.deepEqual(getSubmissionCorrectionClock([], nowMs), {
    hasLiveCorrection: false, expiredCorrectionKey: "",
  });
  assert.equal(getSubmissionCorrectionCandidates(rows, submittedAt + 10 * 60 * 1000).length, 2);
  assert.equal(rows.length, 100_006);
  assert.equal(liveDraft.server_response_status, `${WQ_VISITOR_CORRECTION_DRAFT_STATUS_PREFIX}draft-1`);
}

// normalizeFormResponse defaults
{
  const normalized = normalizeFormResponse({});
  assert.equal(normalized.id, undefined);
  assert.equal(normalized.form_code, "-");
  assert.equal(normalized.form_version, "");
  assert.equal(normalized.household_id, "");
  assert.equal(normalized.subject_type, "");
  assert.equal(normalized.subject_id, "");
  assert.equal(normalized.site_id, "");
  assert.equal(normalized.locality_code, "");
  assert.equal(normalized.submitted_at, "");
  assert.equal(normalized.sync_status, "pending");
  assert.equal(normalized.sync_error, "");
  assert.equal(normalized.sync_error_at, "");
  assert.equal(normalized.server_response_status, "");
  assert.equal(normalized.search_text, "- pending");
}

// normalizeFormResponse falls back to submission_id / created_at
{
  const normalized = normalizeFormResponse({
    submission_id: "sub-1",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(normalized.id, "sub-1");
  assert.equal(normalized.submitted_at, "2026-01-01T00:00:00.000Z");
}

// search_text is lowercase and includes id/household_id/form_code/sync_error
{
  const normalized = normalizeFormResponse({
    id: "SUB-42",
    form_code: "HHQ",
    household_id: "HH-100",
    sync_status: "upload_error",
    sync_error: "Duplicate Submission",
  });
  assert.equal(normalized.search_text, normalized.search_text.toLowerCase());
  assert.ok(normalized.search_text.includes("sub-42"));
  assert.ok(normalized.search_text.includes("hh-100"));
  assert.ok(normalized.search_text.includes("hhq"));
  assert.ok(normalized.search_text.includes("duplicate submission"));
}

// uniqueOptions dedupes, sorts, and drops blanks
{
  const rows = [
    { site_id: "S2" },
    { site_id: "S1" },
    { site_id: "S2" },
    { site_id: "" },
    { site_id: undefined },
    { site_id: "  " },
    { site_id: "S10" },
  ];
  assert.deepEqual(uniqueOptions(rows, "site_id"), ["S1", "S10", "S2"]);
}

const responses = [
  normalizeFormResponse({
    id: "r1",
    form_code: "HHQ",
    household_id: "HH-1",
    site_id: 1,
    locality_code: "LOC-A",
    sync_status: "pending",
  }),
  normalizeFormResponse({
    id: "r2",
    form_code: "WQ",
    household_id: "HH-2",
    site_id: 2,
    locality_code: "LOC-B",
    sync_status: "upload_error",
    sync_error: "Server rejected",
  }),
  normalizeFormResponse({
    id: "r3",
    form_code: "hhq",
    household_id: "HH-3",
    site_id: "3",
    locality_code: "LOC-A",
    sync_status: "synced",
  }),
];

// search filter, case-insensitive
{
  const result = filterResponses(responses, { search: "server rejected" });
  assert.deepEqual(result.map((r) => r.id), ["r2"]);
}
{
  const result = filterResponses(responses, { search: "HH-1" });
  assert.deepEqual(result.map((r) => r.id), ["r1"]);
}

// siteId filter, string vs number
{
  const result = filterResponses(responses, { siteId: 1 });
  assert.deepEqual(result.map((r) => r.id), ["r1"]);
}
{
  const result = filterResponses(responses, { siteId: "3" });
  assert.deepEqual(result.map((r) => r.id), ["r3"]);
}

// formId filter, case-insensitive
{
  const result = filterResponses(responses, { formId: "hhq" });
  assert.deepEqual(
    result.map((r) => r.id).sort(),
    ["r1", "r3"],
  );
}
{
  const result = filterResponses(responses, { formId: "WQ" });
  assert.deepEqual(result.map((r) => r.id), ["r2"]);
}

// localityCode filter
{
  const result = filterResponses(responses, { localityCode: "LOC-A" });
  assert.deepEqual(
    result.map((r) => r.id).sort(),
    ["r1", "r3"],
  );
}

// combined filters
{
  const result = filterResponses(responses, { formId: "hhq", localityCode: "LOC-A", siteId: "3" });
  assert.deepEqual(result.map((r) => r.id), ["r3"]);
}
{
  const result = filterResponses(responses, { formId: "hhq", localityCode: "LOC-B" });
  assert.deepEqual(result, []);
}

console.log("Form submission list filters validation passed");
