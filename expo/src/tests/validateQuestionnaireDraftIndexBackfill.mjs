/**
 * Verifies runQuestionnaireDraftIndexBackfill() (taskSchema.js): it only
 * touches questionnaire_drafts rows whose household_id/woman_id/answer_count
 * columns are still null, runs inside a single BEGIN/COMMIT transaction,
 * sets the sync_meta guard key exactly once, and a second call is a no-op.
 *
 * This is deliberately NOT wired into initTaskDb() (see taskSchema.js) --
 * initTaskDb()/getDb() is shared by every table on the offline database, so
 * running the backfill there would add an extra SELECT to every caller, not
 * just questionnaire-draft ones (this used to be exercised via initTaskDb();
 * it broke unrelated batch-write tests in validateSyncBatchWrites.mjs that
 * assert an exact getAllSync call count after loading taskRepository.js).
 * questionnaireDraftRepository.js instead calls the exported function
 * directly, once, the first time its native code path touches the database.
 */
import assert from "node:assert/strict";

import { stubOfflineDatabase } from "./helpers/stubOfflineDatabase.mjs";

// A small stateful fake that actually tracks questionnaire_drafts rows and a
// sync_meta table, unlike the shared createFakeSqliteDb() helper (which just
// records calls against a canned result set) -- the backfill logic needs
// real SELECT/UPDATE round-tripping to verify against.
class FakeBackfillDb {
  constructor(seedDraftRows = []) {
    this.draftRows = seedDraftRows.map((row) => ({ ...row }));
    this.meta = new Map();
    this.calls = [];
    this.txnActive = false;
  }

  runSync(sql, params = []) {
    this.calls.push({ method: "runSync", sql, params });
    const trimmed = sql.trim();

    if (/^BEGIN\b/i.test(trimmed)) {
      this.txnActive = true;
      return { changes: 0 };
    }
    if (/^COMMIT\b/i.test(trimmed)) {
      this.txnActive = false;
      return { changes: 0 };
    }
    if (/^ROLLBACK\b/i.test(trimmed)) {
      this.txnActive = false;
      return { changes: 0 };
    }
    if (/^CREATE TABLE|^CREATE INDEX|^ALTER TABLE/i.test(trimmed)) {
      return { changes: 0 };
    }
    if (/^INSERT OR REPLACE INTO sync_meta/i.test(trimmed)) {
      const [key, value] = params;
      this.meta.set(key, value);
      return { changes: 1 };
    }
    const updateMatch = trimmed.match(/^UPDATE questionnaire_drafts SET\s+(.+?)\s+WHERE draft_id = \?$/is);
    if (updateMatch) {
      const columns = updateMatch[1]
        .split(",")
        .map((part) => part.trim().match(/^(\w+)\s*=\s*\?$/)[1]);
      const draftId = params[columns.length];
      const row = this.draftRows.find((candidate) => candidate.draft_id === draftId);
      assert.ok(row, `backfill UPDATE referenced unknown draft_id ${draftId}`);
      assert.ok(this.txnActive, "backfill UPDATE must run inside BEGIN/COMMIT");
      columns.forEach((column, index) => {
        row[column] = params[index];
      });
      return { changes: 1 };
    }
    throw new Error(`FakeBackfillDb: unsupported statement "${sql}"`);
  }

  getFirstSync(sql, params = []) {
    this.calls.push({ method: "getFirstSync", sql, params });
    if (/FROM\s+sync_meta/i.test(sql)) {
      const key = params[0];
      return this.meta.has(key) ? { value: this.meta.get(key) } : null;
    }
    throw new Error(`FakeBackfillDb: unsupported getFirstSync "${sql}"`);
  }

  getAllSync(sql, _params = []) {
    this.calls.push({ method: "getAllSync", sql, params: _params });
    if (/FROM\s+questionnaire_drafts/i.test(sql)) {
      if (/WHERE household_id IS NULL AND woman_id IS NULL AND answer_count IS NULL/i.test(sql)) {
        return this.draftRows
          .filter((row) => row.household_id == null && row.woman_id == null && row.answer_count == null)
          .map((row) => ({ ...row }));
      }
      return this.draftRows.map((row) => ({ ...row }));
    }
    return [];
  }
}

function draftRow(overrides = {}) {
  return {
    draft_id: "draft-1",
    draft_key: "key-1",
    form_code: "HHQ",
    form_version: "v1",
    task_id: "task-1",
    subject_type: "household",
    subject_id: "1-01-0001-01",
    device_id: "device-1",
    user_id: "user-1",
    json_payload: JSON.stringify({}),
    completion_state: JSON.stringify({}),
    draft_status: "active",
    submitted_form_response_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    household_id: null,
    site_id: null,
    locality_code: null,
    woman_id: null,
    structure_map_id: null,
    household_number: null,
    answer_count: null,
    respondent_label: null,
    ...overrides,
  };
}

// A legacy HHQ row that predates the index columns (all null) and a row that
// already has its columns populated (e.g. written by the new persistDraft
// after this migration shipped, before the backfill ran) -- the backfill
// must update only the former.
const legacyHhqRow = draftRow({
  draft_id: "legacy-hhq",
  json_payload: JSON.stringify({
    hhq_site_id: 6,
    hhq_locality_code: "6",
    hhq_structure_map_id: "12",
    hhq_household_number: "3",
  }),
});
const legacyWqRow = draftRow({
  draft_id: "legacy-wq",
  form_code: "WQ",
  subject_id: "6-06-0012-03-01",
  json_payload: JSON.stringify({ wq_enter_structure_id_woman: "6-06-0012-03-01" }),
});
const alreadyIndexedRow = draftRow({
  draft_id: "already-indexed",
  household_id: "9-09-0009-09",
  site_id: "9",
  locality_code: "09",
  structure_map_id: "0009",
  household_number: "09",
  answer_count: 0,
  respondent_label: "9-09-0009-09",
});

const fakeDb = new FakeBackfillDb([legacyHhqRow, legacyWqRow, alreadyIndexedRow]);
const require = stubOfflineDatabase(fakeDb, import.meta.url);
const { runQuestionnaireDraftIndexBackfill } = require("../modules/tasks/taskSchema.js");

runQuestionnaireDraftIndexBackfill(fakeDb);

// --- the backfill only touched rows with null household_id/woman_id/answer_count ---
const updateCalls = fakeDb.calls.filter(
  (call) => call.method === "runSync" && /^UPDATE questionnaire_drafts/i.test(call.sql),
);
assert.equal(updateCalls.length, 2, "expected exactly the two legacy rows to be updated");
assert.ok(
  updateCalls.every((call) => call.params.at(-1) === "legacy-hhq" || call.params.at(-1) === "legacy-wq"),
  "backfill must not touch a row that already has its index columns populated",
);

const updatedHhq = fakeDb.draftRows.find((row) => row.draft_id === "legacy-hhq");
assert.equal(updatedHhq.household_id, "6-06-0012-03");
assert.equal(updatedHhq.site_id, "6");
assert.equal(updatedHhq.locality_code, "06");
assert.equal(updatedHhq.structure_map_id, "12");
assert.equal(updatedHhq.household_number, "3");
assert.equal(updatedHhq.answer_count, 4);

const updatedWq = fakeDb.draftRows.find((row) => row.draft_id === "legacy-wq");
assert.equal(updatedWq.woman_id, "6-06-0012-03-01");
assert.equal(updatedWq.household_id, "6-06-0012-03");
assert.equal(updatedWq.answer_count, 1);

const untouched = fakeDb.draftRows.find((row) => row.draft_id === "already-indexed");
assert.equal(untouched.household_id, "9-09-0009-09");
assert.equal(untouched.answer_count, 0);

// --- ran inside a single BEGIN/COMMIT transaction ---------------------------
const beginIndex = fakeDb.calls.findIndex((call) => /^BEGIN\b/i.test(call.sql));
const commitIndex = fakeDb.calls.findIndex((call) => /^COMMIT\b/i.test(call.sql));
assert.ok(beginIndex !== -1 && commitIndex !== -1, "backfill must run inside BEGIN/COMMIT");
const firstUpdateIndex = fakeDb.calls.findIndex(
  (call) => call.method === "runSync" && /^UPDATE questionnaire_drafts/i.test(call.sql),
);
assert.ok(beginIndex < firstUpdateIndex && firstUpdateIndex < commitIndex);

// --- the sync_meta guard key was set exactly once ---------------------------
assert.equal(fakeDb.meta.get("questionnaire_drafts_index_backfill_v1"), "1");
const metaWriteCalls = fakeDb.calls.filter(
  (call) => call.method === "runSync" && /INSERT OR REPLACE INTO sync_meta/i.test(call.sql),
);
assert.equal(metaWriteCalls.length, 1);

// --- a second call is a no-op (guarded by the sync_meta key) ----------------
const callCountAfterFirstRun = fakeDb.calls.length;
runQuestionnaireDraftIndexBackfill(fakeDb);
assert.equal(
  fakeDb.calls.length,
  callCountAfterFirstRun + 1,
  "a second run should only re-check the sync_meta guard (one getFirstSync call) and do nothing else",
);
assert.equal(fakeDb.calls[fakeDb.calls.length - 1].method, "getFirstSync");

// --- safe to call on an empty table -----------------------------------------
const emptyDb = new FakeBackfillDb([]);
runQuestionnaireDraftIndexBackfill(emptyDb);
assert.equal(emptyDb.meta.get("questionnaire_drafts_index_backfill_v1"), "1");
assert.equal(emptyDb.calls.some((call) => /^UPDATE/i.test(call.sql)), false);

console.log("Validated questionnaire_drafts index-column backfill.");
