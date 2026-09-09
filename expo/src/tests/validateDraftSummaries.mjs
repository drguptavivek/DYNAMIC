import assert from "node:assert/strict";

// The repository's native branch is selected whenever `window` is undefined.
delete globalThis.window;

const { deriveDraftIndexFields } = await import(
  "../modules/questionnaires/draftPendingForms.js"
);

// Minimal fake SQLite tailored to the two query shapes this test exercises:
// the existing "SELECT * ... WHERE draft_status = 'active'" full decode, and
// the lightweight "SELECT <index columns> ... WHERE draft_status = 'active'"
// summary query. insertRaw() derives the questionnaire_drafts index columns
// (household_id, site_id, woman_id, etc.) from json_payload the same way
// persistDraft() does, so this fake behaves like a real, migrated+backfilled
// questionnaire_drafts table.
class FakeSummaryDb {
  constructor() {
    this.rows = [];
    this.log = [];
    // When true, any SELECT against questionnaire_drafts throws (simulating
    // an unmigrated/unexpected schema variant missing an index column).
    this.summaryQueryUnsupported = false;
  }

  insertRaw(row) {
    let payload = {};
    try {
      payload = JSON.parse(row.json_payload || "{}") || {};
    } catch {
      payload = {};
    }
    const derived = deriveDraftIndexFields({ ...row, json_payload: payload });
    this.rows.push({ ...row, ...derived });
  }

  runSync(sql) {
    this.log.push(sql);
    throw new Error(`FakeSummaryDb: unsupported statement "${sql}"`);
  }

  getFirstSync(sql, params = []) {
    return this.getAllSync(sql, params)[0] || null;
  }

  getAllSync(sql, _params = []) {
    this.log.push(sql);
    const trimmed = sql.trim();
    assert.match(trimmed, /WHERE\s+draft_status\s*=\s*'active'/i);

    const active = this.rows.filter((row) => row.draft_status === "active");
    const sorted = [...active].sort((a, b) =>
      String(b.updated_at).localeCompare(String(a.updated_at)),
    );

    const selectListMatch = trimmed.match(/^SELECT\s+(.+?)\s+FROM\s+questionnaire_drafts/i);
    assert.ok(selectListMatch, `could not parse SELECT list: ${trimmed}`);
    const selectList = selectListMatch[1];
    const isFullSelect = selectList.trim() === "*";

    if (isFullSelect) {
      return sorted.map((row) => ({ ...row }));
    }

    if (this.summaryQueryUnsupported) {
      throw new Error("no such column: respondent_label");
    }

    // Summary path: the query must select the real index columns directly --
    // never json_extract(...) and never the bare json_payload column.
    assert.doesNotMatch(
      selectList,
      /json_extract/i,
      `summary query must not use json_extract: ${selectList}`,
    );
    assert.doesNotMatch(
      selectList,
      /\bjson_payload\b/i,
      `summary query must not select the json_payload column: ${selectList}`,
    );

    const columns = selectList.split(",").map((part) => part.trim());
    return sorted.map((row) => {
      const projected = {};
      for (const column of columns) {
        projected[column] = row[column] ?? null;
      }
      return projected;
    });
  }
}

function draftRow(overrides = {}) {
  return {
    draft_id: "draft-1",
    draft_key: "key-1",
    form_code: "WQ",
    form_version: "v1",
    task_id: "task-1",
    subject_type: "individual",
    subject_id: "1-01-0001-01-01",
    device_id: "device-1",
    user_id: "user-1",
    json_payload: JSON.stringify({}),
    completion_state: JSON.stringify({}),
    draft_status: "active",
    submitted_form_response_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const {
  __setNativeDatabaseForTests,
  listActiveQuestionnaireDrafts,
  listActiveQuestionnaireDraftSummaries,
} = await import("../modules/questionnaires/questionnaireDraftRepository.js");
const { draftMatchesTask, getDraftComparableIds } = await import(
  "../modules/questionnaires/draftPendingForms.js"
);

const db = new FakeSummaryDb();
__setNativeDatabaseForTests(db);

// A WQ draft matched via wq_enter_structure_id_woman, and an HHQ draft
// matched via household-id payload fields (hhq_site_id/locality/structure/
// number). Both also carry unrelated large "answers" to stand in for a real
// payload the summary path should never need to decode.
db.insertRaw(
  draftRow({
    draft_id: "wq-draft",
    draft_key: "wq-key",
    form_code: "WQ",
    task_id: "wq-task-1",
    subject_id: "wq-subject-1",
    json_payload: JSON.stringify({
      wq_enter_structure_id_woman: "1-01-0001-01-02",
      some_other_large_answer_blob: "x".repeat(2000),
    }),
    updated_at: "2026-01-02T00:00:00.000Z",
  }),
);
db.insertRaw(
  draftRow({
    draft_id: "hhq-draft",
    draft_key: "hhq-key",
    form_code: "HHQ",
    task_id: "hhq-task-1",
    subject_id: "hhq-subject-1",
    json_payload: JSON.stringify({
      hhq_site_id: 1,
      hhq_locality_code: "2",
      hhq_structure_map_id: "9",
      hhq_household_number: "3",
      some_other_large_answer_blob: "y".repeat(2000),
    }),
    updated_at: "2026-01-03T00:00:00.000Z",
  }),
);

const fullList = await listActiveQuestionnaireDrafts();
const summaryList = await listActiveQuestionnaireDraftSummaries();

assert.equal(fullList.length, 2);
assert.equal(summaryList.length, 2);

// --- draft_id / task_id match between full and summary lists ---------------
const fullById = new Map(fullList.map((d) => [d.draft_id, d]));
const summaryById = new Map(summaryList.map((d) => [d.draft_id, d]));
assert.deepEqual(
  [...summaryById.keys()].sort(),
  [...fullById.keys()].sort(),
);
for (const draftId of fullById.keys()) {
  assert.equal(summaryById.get(draftId).task_id, fullById.get(draftId).task_id);
  assert.equal(summaryById.get(draftId).subject_id, fullById.get(draftId).subject_id);
}

// --- summary rows carry the index columns but not the full payload ---------
const wqSummary = summaryById.get("wq-draft");
assert.equal(wqSummary.woman_id, "1-01-0001-01-02");
assert.equal(wqSummary.household_id, "1-01-0001-01");
const hhqSummary = summaryById.get("hhq-draft");
assert.equal(hhqSummary.household_id, "1-02-0009-03");
assert.equal(hhqSummary.site_id, "1");
assert.equal(hhqSummary.locality_code, "02");
for (const draft of summaryList) {
  assert.equal(draft.json_payload.some_other_large_answer_blob, undefined);
}

// --- getDraftComparableIds matches between full and summary rows -----------
for (const draftId of fullById.keys()) {
  const fullIds = getDraftComparableIds(fullById.get(draftId));
  const summaryIds = getDraftComparableIds(summaryById.get(draftId));
  assert.deepEqual([...summaryIds].sort(), [...fullIds].sort(), `mismatch for ${draftId}`);
}

// --- draftMatchesTask gives identical answers for both lists ---------------
const sampleTasks = [
  { id: "wq-task-1", task_type: "WQ", household_id: null, subject_id: "wq-subject-1" },
  { id: "some-other-task", task_type: "WQ", household_id: null, subject_id: "1-01-0001-01-02" },
  { id: "hhq-task-1", task_type: "HHQ", household_id: "1-02-0009-03", subject_id: null },
  { id: "unrelated-task", task_type: "HHQ", household_id: "9-09-0009-09", subject_id: null },
];

for (const task of sampleTasks) {
  for (const draftId of fullById.keys()) {
    const fullMatch = draftMatchesTask(fullById.get(draftId), task);
    const summaryMatch = draftMatchesTask(summaryById.get(draftId), task);
    assert.equal(
      summaryMatch,
      fullMatch,
      `draftMatchesTask mismatch for draft=${draftId} task=${task.id}`,
    );
  }
}

// --- dedupe behaves identically between full and summary lists -------------
db.insertRaw(
  draftRow({
    draft_id: "hhq-draft-dup-older",
    draft_key: "hhq-key-dup-older",
    form_code: "HHQ",
    task_id: "hhq-task-dup-older",
    subject_id: "hhq-subject-1",
    json_payload: JSON.stringify({
      hhq_site_id: 1,
      hhq_locality_code: "2",
      hhq_structure_map_id: "9",
      hhq_household_number: "3",
    }),
    updated_at: "2025-12-01T00:00:00.000Z",
  }),
);

const fullListWithDup = await listActiveQuestionnaireDrafts();
const summaryListWithDup = await listActiveQuestionnaireDraftSummaries();
assert.equal(fullListWithDup.length, 2);
assert.equal(summaryListWithDup.length, 2);
assert.deepEqual(
  fullListWithDup.map((d) => d.draft_id).sort(),
  summaryListWithDup.map((d) => d.draft_id).sort(),
);
assert.ok(fullListWithDup.some((d) => d.draft_id === "hhq-draft"));
assert.ok(summaryListWithDup.some((d) => d.draft_id === "hhq-draft"));
assert.ok(!fullListWithDup.some((d) => d.draft_id === "hhq-draft-dup-older"));
assert.ok(!summaryListWithDup.some((d) => d.draft_id === "hhq-draft-dup-older"));

// --- fallback path: summary query unsupported -------------------------------
const fallbackDb = new FakeSummaryDb();
fallbackDb.summaryQueryUnsupported = true;
for (const row of db.rows) fallbackDb.insertRaw({ ...row, json_payload: row.json_payload });
__setNativeDatabaseForTests(fallbackDb);

const fallbackSummaryList = await listActiveQuestionnaireDraftSummaries();
assert.equal(fallbackSummaryList.length, 2);
assert.ok(
  fallbackSummaryList.some((d) => d.draft_id === "wq-draft"),
  "fallback summary list should still resolve WQ draft via full decode",
);
assert.ok(
  fallbackSummaryList.some((d) => d.draft_id === "hhq-draft"),
  "fallback summary list should still resolve HHQ draft via full decode",
);
// Full payload keys should now be present again (fallback used the full decode path).
const fallbackWqDraft = fallbackSummaryList.find((d) => d.draft_id === "wq-draft");
assert.equal(
  fallbackWqDraft.json_payload.some_other_large_answer_blob,
  "x".repeat(2000),
);
// A second call should not re-attempt (and re-throw) the summary query.
const secondFallbackCallLogMark = fallbackDb.log.length;
await listActiveQuestionnaireDraftSummaries();
const secondFallbackCallLog = fallbackDb.log.slice(secondFallbackCallLogMark);
assert.ok(secondFallbackCallLog.length > 0);
for (const sql of secondFallbackCallLog) {
  assert.match(sql, /SELECT \*/, "once unsupported, summaries should always use the full-decode SELECT *");
}

console.log("Validated listActiveQuestionnaireDraftSummaries matches full decode semantics.");
