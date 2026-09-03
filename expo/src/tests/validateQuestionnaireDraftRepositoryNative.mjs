import assert from "node:assert/strict";

// The repository's native branch is selected whenever `window` is undefined,
// so make sure nothing upstream in this process defined it.
delete globalThis.window;

const DRAFT_COLUMNS = [
  "draft_id",
  "draft_key",
  "form_code",
  "form_version",
  "task_id",
  "subject_type",
  "subject_id",
  "device_id",
  "user_id",
  "json_payload",
  "completion_state",
  "draft_status",
  "submitted_form_response_id",
  "created_at",
  "updated_at",
  "household_id",
  "site_id",
  "locality_code",
  "woman_id",
  "structure_map_id",
  "household_number",
  "answer_count",
  "respondent_label",
];

function splitAndClauses(whereSql) {
  return whereSql.split(/\s+AND\s+/i).map((clause) => clause.trim());
}

// Evaluates one AND-joined clause of the narrow WHERE clauses this
// repository is expected to emit against a single row. Throws on anything
// unexpected so a query shape the repository was never supposed to issue
// (e.g. an unfiltered scan) fails loudly instead of silently matching.
function evalClause(clause, row, params, paramIndex) {
  let match = clause.match(/^1=1$/);
  if (match) return { matched: true, consumed: 0 };

  match = clause.match(/^(\w+)\s*=\s*'([^']*)'$/);
  if (match) return { matched: row[match[1]] === match[2], consumed: 0 };

  match = clause.match(/^(\w+)\s*!=\s*\?$/);
  if (match) return { matched: row[match[1]] !== params[paramIndex], consumed: 1 };

  match = clause.match(/^(\w+)\s*=\s*\?$/);
  if (match) return { matched: row[match[1]] === params[paramIndex], consumed: 1 };

  match = clause.match(/^COALESCE\(NULLIF\((\w+), ''\), 'none'\)\s*=\s*\?$/);
  if (match) {
    const raw = row[match[1]];
    const normalized = raw === undefined || raw === null || raw === "" ? "none" : String(raw);
    return { matched: normalized === params[paramIndex], consumed: 1 };
  }

  throw new Error(`FakeDraftDb: unsupported WHERE clause "${clause}"`);
}

function rowMatchesWhere(whereSql, row, params) {
  let paramIndex = 0;
  for (const clause of splitAndClauses(whereSql)) {
    const { matched, consumed } = evalClause(clause, row, params, paramIndex);
    paramIndex += consumed;
    if (!matched) return false;
  }
  return true;
}

function parseSelect(sql) {
  const orderMatch = sql.match(/^(.*?)\s+ORDER BY\s+(.+)$/i);
  const core = orderMatch ? orderMatch[1] : sql;
  const orderBy = orderMatch ? orderMatch[2].trim() : null;
  const whereMatch = core.match(/WHERE\s+(.+)$/i);
  if (!whereMatch) {
    throw new Error(`FakeDraftDb: SELECT is missing a WHERE clause: "${sql}"`);
  }
  return { where: whereMatch[1].trim(), orderBy };
}

class FakeDraftDb {
  constructor() {
    this.rows = [];
    this.log = [];
    this.txnSnapshot = null;
  }

  insertRaw(row) {
    this.rows.push({ ...row });
  }

  runSync(sql, params = []) {
    this.log.push(sql);
    const trimmed = sql.trim();

    if (/^BEGIN\b/i.test(trimmed)) {
      this.txnSnapshot = this.rows.map((row) => ({ ...row }));
      return { changes: 0 };
    }
    if (/^COMMIT\b/i.test(trimmed)) {
      this.txnSnapshot = null;
      return { changes: 0 };
    }
    if (/^ROLLBACK\b/i.test(trimmed)) {
      if (this.txnSnapshot) this.rows = this.txnSnapshot;
      this.txnSnapshot = null;
      return { changes: 0 };
    }

    if (/^INSERT OR REPLACE INTO questionnaire_drafts/i.test(trimmed)) {
      const row = Object.fromEntries(DRAFT_COLUMNS.map((column, index) => [column, params[index] ?? null]));
      const index = this.rows.findIndex((existing) => existing.draft_id === row.draft_id);
      if (index >= 0) this.rows[index] = row;
      else this.rows.push(row);
      return { changes: 1 };
    }

    if (/^UPDATE questionnaire_drafts SET draft_status = \?, updated_at = \? WHERE draft_id = \?/i.test(trimmed)) {
      const [status, updatedAt, draftId] = params;
      let changes = 0;
      this.rows = this.rows.map((row) => {
        if (row.draft_id !== draftId) return row;
        changes += 1;
        return { ...row, draft_status: status, updated_at: updatedAt };
      });
      return { changes };
    }

    if (/^DELETE FROM questionnaire_drafts WHERE draft_id = \?/i.test(trimmed)) {
      const before = this.rows.length;
      this.rows = this.rows.filter((row) => row.draft_id !== params[0]);
      return { changes: before - this.rows.length };
    }

    throw new Error(`FakeDraftDb: unsupported statement "${sql}"`);
  }

  getFirstSync(sql, params = []) {
    this.log.push(sql);
    const { where } = parseSelect(sql);
    return this.rows.find((row) => rowMatchesWhere(where, row, params)) || null;
  }

  getAllSync(sql, params = []) {
    this.log.push(sql);
    const { where, orderBy } = parseSelect(sql);
    let rows = this.rows.filter((row) => rowMatchesWhere(where, row, params));
    if (orderBy) {
      const [column, direction] = orderBy.split(/\s+/);
      const multiplier = direction && direction.toUpperCase() === "DESC" ? -1 : 1;
      rows = [...rows].sort(
        (a, b) => String(a[column] || "").localeCompare(String(b[column] || "")) * multiplier,
      );
    }
    return rows.map((row) => ({ ...row }));
  }
}

function selectCallsSince(db, markIndex) {
  return db.log.slice(markIndex).filter((sql) => /^SELECT/i.test(sql.trim()));
}

const db = new FakeDraftDb();

const {
  __setNativeDatabaseForTests,
  buildDraftKey,
  getActiveQuestionnaireDraft,
  getQuestionnaireDraftById,
  listActiveQuestionnaireDrafts,
  listQuestionnaireDraftsForSync,
  markQuestionnaireDraftSubmitted,
  mergeServerQuestionnaireDrafts,
  saveQuestionnaireDraft,
} = await import("../modules/questionnaires/questionnaireDraftRepository.js");

__setNativeDatabaseForTests(db);

// --- (a) save then getActiveQuestionnaireDraft finds it via draft_key -----
const context = {
  formCode: "HHQ",
  formVersion: "v1",
  taskId: "task-1",
  subjectType: "household",
  subjectId: "1-01-0001-01",
  deviceId: "device-1",
  userId: "user-1",
};

let mark = db.log.length;
const draft1 = await saveQuestionnaireDraft({
  ...context,
  payload: { hhq_site_id: 1 },
  completionState: { currentPageName: "page_01" },
});
const save1Selects = selectCallsSince(db, mark);
assert.ok(
  save1Selects.length <= 2,
  `saveQuestionnaireDraft should issue at most 2 SELECTs, got ${save1Selects.length}`,
);
assert.ok(
  save1Selects.every((sql) => !/^SELECT\s+\*/i.test(sql) && !/\bjson_payload\b/i.test(sql)),
  `saveQuestionnaireDraft native matching must not select json_payload: ${save1Selects.join(" | ")}`,
);
assert.ok(save1Selects.every((sql) => /\btask_id\b/i.test(sql) && /\bsubject_type\b/i.test(sql)));

assert.equal(draft1.draft_status, "active");
assert.deepEqual(draft1.json_payload, { hhq_site_id: 1 });
const firstCreatedAt = draft1.created_at;

mark = db.log.length;
const directlyResaved = await saveQuestionnaireDraft({
  ...context,
  draftId: draft1.draft_id,
  payload: { hhq_site_id: 1, hhq_household_head_name: "Direct ID payload" },
  completionState: { currentPageName: "page_direct" },
});
const directSaveSelects = selectCallsSince(db, mark);
assert.ok(directSaveSelects.length <= 2);
assert.ok(
  directSaveSelects.every((sql) => !/^SELECT\s+\*/i.test(sql) && !/\bjson_payload\b/i.test(sql)),
  `direct-ID save must not select json_payload: ${directSaveSelects.join(" | ")}`,
);
assert.equal(directlyResaved.draft_id, draft1.draft_id);
assert.equal(directlyResaved.created_at, firstCreatedAt);
assert.deepEqual(
  (await getQuestionnaireDraftById(draft1.draft_id)).json_payload,
  { hhq_site_id: 1, hhq_household_head_name: "Direct ID payload" },
);

const activeById = await getQuestionnaireDraftById(draft1.draft_id);
assert.equal(activeById.draft_id, draft1.draft_id);

const active1 = await getActiveQuestionnaireDraft(context);
assert.equal(active1.draft_id, draft1.draft_id);
assert.equal(active1.draft_status, "active");
assert.equal(
  buildDraftKey(context),
  "HHQ|v1|task-1|household|1-01-0001-01|device-1|user-1",
);

// --- (b) saving with a different draftId but same form/household/user -----
// supersedes the older duplicate; only one remains active. saveQuestionnaireDraft's
// own "existing" resolution already dedupes on identity/household key (so a
// normal save just updates draft1 in place), so to exercise supersede we
// simulate the kind of leftover duplicate row it exists to clean up: another
// active row under a different draft_id that shares draft1's identity key.
db.insertRaw({
  draft_id: "leftover-duplicate",
  draft_key: "HHQ|v1|task-leftover|household|1-01-0001-01|device-1|user-1",
  form_code: "HHQ",
  form_version: "v1",
  task_id: "task-leftover",
  subject_type: "household",
  subject_id: "1-01-0001-01",
  device_id: "device-1",
  user_id: "user-1",
  json_payload: JSON.stringify({ hhq_site_id: 1 }),
  completion_state: JSON.stringify({}),
  draft_status: "active",
  submitted_form_response_id: null,
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-01T00:00:00.000Z",
});
assert.equal(db.rows.filter((row) => row.draft_status === "active").length, 2);

mark = db.log.length;
const draft2 = await saveQuestionnaireDraft({
  ...context,
  taskId: "task-2",
  payload: { hhq_site_id: 1 },
  completionState: { currentPageName: "page_02" },
});
const save2Selects = selectCallsSince(db, mark);
assert.ok(
  save2Selects.length <= 2,
  `saveQuestionnaireDraft should issue at most 2 SELECTs, got ${save2Selects.length}`,
);
assert.ok(save2Selects.every((sql) => !/\bjson_payload\b/i.test(sql)));

// The identity-key match reuses draft1's row rather than minting a new one...
assert.equal(draft2.draft_id, draft1.draft_id);
// ...and the leftover duplicate (a genuinely different draft_id) gets superseded.
const activeAfterSupersede = await listActiveQuestionnaireDrafts();
assert.equal(activeAfterSupersede.length, 1);
assert.equal(activeAfterSupersede[0].draft_id, draft2.draft_id);
assert.equal(await getQuestionnaireDraftById("leftover-duplicate"), null);

// --- (c) markQuestionnaireDraftSubmitted flips status ----------------------
const submitted = await markQuestionnaireDraftSubmitted({
  draftId: draft2.draft_id,
  submittedFormResponseId: "HHQ-resp-1",
});
assert.equal(submitted.draft_status, "submitted");
assert.equal(submitted.submitted_form_response_id, "HHQ-resp-1");
assert.equal(await getActiveQuestionnaireDraft(context), null);
assert.deepEqual(await listActiveQuestionnaireDrafts(), []);

// --- (d) listActiveQuestionnaireDrafts dedupes ------------------------------
// Simulate two leftover active rows sharing the same household/user identity
// (the kind of state supersede is meant to clean up) and confirm only the
// newest survives the dedupe pass.
db.insertRaw({
  draft_id: "dup-old",
  draft_key: "HHQ|v1|task-dup|household|2-02-0002-01|device-1|user-1",
  form_code: "HHQ",
  form_version: "v1",
  task_id: "task-dup",
  subject_type: "household",
  subject_id: "2-02-0002-01",
  device_id: "device-1",
  user_id: "user-1",
  json_payload: JSON.stringify({}),
  completion_state: JSON.stringify({}),
  draft_status: "active",
  submitted_form_response_id: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
});
db.insertRaw({
  draft_id: "dup-new",
  draft_key: "HHQ|v1|task-dup-2|household|2-02-0002-01|device-1|user-1",
  form_code: "HHQ",
  form_version: "v1",
  task_id: "task-dup-2",
  subject_type: "household",
  subject_id: "2-02-0002-01",
  device_id: "device-1",
  user_id: "user-1",
  json_payload: JSON.stringify({}),
  completion_state: JSON.stringify({}),
  draft_status: "active",
  submitted_form_response_id: null,
  created_at: "2026-02-01T00:00:00.000Z",
  updated_at: "2026-02-01T00:00:00.000Z",
});
const deduped = await listActiveQuestionnaireDrafts();
assert.equal(deduped.length, 1);
assert.equal(deduped[0].draft_id, "dup-new");
await markQuestionnaireDraftSubmitted({ draftId: "dup-old" });
await markQuestionnaireDraftSubmitted({ draftId: "dup-new" });

// --- (e) mergeServerQuestionnaireDrafts newer-wins --------------------------
const mergeContext = {
  formCode: "HHQ",
  formVersion: "v1",
  taskId: "task-merge",
  subjectType: "household",
  subjectId: "3-03-0003-01",
  deviceId: "device-3",
  userId: "user-3",
};
const localDraft = await saveQuestionnaireDraft({
  ...mergeContext,
  payload: { hhq_site_id: 3, hhq_household_head_name: "Local Head" },
  completionState: {},
});

const olderIncoming = {
  draft_id: "server-draft-1",
  form_code: "HHQ",
  form_version: "v1",
  task_id: "task-merge",
  subject_type: "household",
  subject_id: "3-03-0003-01",
  user_id: "user-3",
  device_id: "device-3",
  json_payload: { hhq_site_id: 3, hhq_household_head_name: "Stale Server Head" },
  completion_state: {},
  draft_status: "active",
  created_at: "2020-01-01T00:00:00.000Z",
  updated_at: "2020-01-01T00:00:00.000Z",
};
const mergedOlder = await mergeServerQuestionnaireDrafts([olderIncoming], { userId: "user-3" });
assert.equal(mergedOlder, 0);
const stillLocal = await getActiveQuestionnaireDraft(mergeContext);
assert.equal(stillLocal.draft_id, localDraft.draft_id);
assert.equal(stillLocal.json_payload.hhq_household_head_name, "Local Head");

const newerIncoming = {
  ...olderIncoming,
  json_payload: { hhq_site_id: 3, hhq_household_head_name: "Fresh Server Head" },
  updated_at: "2099-01-01T00:00:00.000Z",
};
const mergedNewer = await mergeServerQuestionnaireDrafts([newerIncoming], { userId: "user-3" });
assert.equal(mergedNewer, 1);
const afterMerge = await getActiveQuestionnaireDraft(mergeContext);
// Merge overwrites the existing local row in place; it keeps the pre-existing
// draft_id rather than adopting the incoming server draft_id.
assert.equal(afterMerge.draft_id, localDraft.draft_id);
assert.equal(afterMerge.json_payload.hhq_household_head_name, "Fresh Server Head");

const syncedForUser = await listQuestionnaireDraftsForSync("user-3");
assert.equal(syncedForUser.some((row) => row.draft_id === localDraft.draft_id), true);

// --- (g) identity/household fallback works when draft_key differs but ------
// payload household still matches (e.g. the underlying task id changed).
const householdContext = {
  formCode: "HHQ",
  formVersion: "v1",
  taskId: "task-g-original",
  keyTaskId: null,
  subjectType: "household",
  subjectId: "unselected",
  deviceId: "device-g",
  userId: "user-g",
};
const householdPayload = {
  hhq_site_id: 4,
  hhq_locality_code: "04",
  hhq_structure_map_id: "0009",
  hhq_household_number: "02",
};
const householdDraft = await saveQuestionnaireDraft({
  ...householdContext,
  payload: householdPayload,
});

// draft_key changes (different taskId); identity-key fallback (formCode,
// formVersion, household id, deviceId, userId) still finds it once the
// context's subjectId is the resolved household id.
const reopenedByIdentityKey = await getActiveQuestionnaireDraft({
  ...householdContext,
  taskId: "task-g-recreated",
  subjectId: "4-04-0009-02",
});
assert.equal(reopenedByIdentityKey.draft_id, householdDraft.draft_id);

// Changing the device on top of that defeats the identity-key match (device
// is part of it) but the household-user-key fallback (no device component)
// still finds the draft.
const reopenedByHouseholdKey = await getActiveQuestionnaireDraft({
  ...householdContext,
  taskId: "task-g-recreated-2",
  subjectId: "4-04-0009-02",
  deviceId: "device-other",
});
assert.equal(reopenedByHouseholdKey.draft_id, householdDraft.draft_id);

// --- (h) persistDraft writes the derived index columns ----------------------
// HHQ draft: household_id/site_id/locality_code/structure_map_id/
// household_number are built from the hhq_* payload fields, exactly like
// getDraftHouseholdId()/getDraftSiteId() compute them.
const hhqIndexRow = db.rows.find((row) => row.draft_id === householdDraft.draft_id);
assert.equal(hhqIndexRow.household_id, "4-04-0009-02");
assert.equal(hhqIndexRow.site_id, "4");
assert.equal(hhqIndexRow.locality_code, "04");
assert.equal(hhqIndexRow.structure_map_id, "0009");
assert.equal(hhqIndexRow.household_number, "02");
assert.equal(hhqIndexRow.woman_id, null);
assert.equal(hhqIndexRow.answer_count, Object.keys(householdPayload).length);
assert.equal(hhqIndexRow.respondent_label, "4-04-0009-02");

// WQ draft: woman_id comes from wq_enter_structure_id_woman.
const wqDraft = await saveQuestionnaireDraft({
  formCode: "WQ",
  formVersion: "v1",
  taskId: "task-wq-index",
  subjectType: "individual",
  subjectId: "5-05-0005-01-01",
  deviceId: "device-wq",
  userId: "user-wq",
  payload: { wq_enter_structure_id_woman: "5-05-0005-01-01" },
  completionState: { currentPageName: "page_01" },
});
const wqIndexRow = db.rows.find((row) => row.draft_id === wqDraft.draft_id);
assert.equal(wqIndexRow.woman_id, "5-05-0005-01-01");
assert.equal(wqIndexRow.household_id, "5-05-0005-01");
assert.equal(wqIndexRow.answer_count, 1);
assert.equal(wqIndexRow.respondent_label, "5-05-0005-01");

// Exact task/type identity wins over a newer broader identity candidate. This
// keeps two rows for the same user/form/subject distinguishable when their
// draft keys differ, while preserving the existing household fallback for a
// recreated task key.
db.insertRaw({
  draft_id: "specific-task-a",
  draft_key: "HHQ|v1|task-specific-a|household|6-06-0006-01|device-specific|user-specific",
  form_code: "HHQ",
  form_version: "v1",
  task_id: "task-specific-a",
  subject_type: "household",
  subject_id: "6-06-0006-01",
  device_id: "device-specific",
  user_id: "user-specific",
  draft_status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  household_id: "6-06-0006-01",
});
db.insertRaw({
  draft_id: "specific-task-b",
  draft_key: "HHQ|v1|task-specific-b|individual|6-06-0006-01|device-specific|user-specific",
  form_code: "HHQ",
  form_version: "v1",
  task_id: "task-specific-b",
  subject_type: "individual",
  subject_id: "6-06-0006-01",
  device_id: "device-specific",
  user_id: "user-specific",
  draft_status: "active",
  created_at: "2026-02-01T00:00:00.000Z",
  updated_at: "2099-01-01T00:00:00.000Z",
  household_id: "6-06-0006-01",
});
const specificTaskDraft = await saveQuestionnaireDraft({
  formCode: "HHQ",
  formVersion: "v1",
  taskId: "task-specific-a",
  subjectType: "household",
  subjectId: "6-06-0006-01",
  deviceId: "device-specific",
  userId: "user-specific",
  payload: { hhq_site_id: 6, hhq_household_head_name: "Task A" },
});
assert.equal(specificTaskDraft.draft_id, "specific-task-a");
assert.equal(await getQuestionnaireDraftById("specific-task-b"), null);

// --- (f) every SELECT ever issued against questionnaire_drafts carries a ---
// WHERE clause (parseSelect() above already throws otherwise, but assert
// explicitly against the full log too).
const allSelects = db.log.filter((sql) => /^SELECT/i.test(sql.trim()));
assert.ok(allSelects.length > 0);
for (const sql of allSelects) {
  assert.match(sql, /WHERE/i, `SELECT without WHERE clause: ${sql}`);
}

console.log("Validated questionnaire draft repository native SQLite path.");
