import assert from "node:assert/strict";

const store = new Map();
globalThis.window = {
  localStorage: {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  },
};

const {
  buildDraftKey,
  getActiveQuestionnaireDraft,
  listActiveQuestionnaireDrafts,
  saveQuestionnaireDraft,
  markQuestionnaireDraftSubmitted,
} = await import("../modules/questionnaires/questionnaireDraftRepository.js");
const {
  filterDraftsForUserSite,
  getDraftHouseholdId,
  getDraftSiteId,
} = await import("../modules/questionnaires/draftPendingForms.js");
const { getDraftSavedMessage } = await import("../modules/questionnaires/draftSaveMessages.js");

const context = {
  formCode: "HHQ",
  formVersion: "9 MAY 2026",
  taskId: "task-hhq-1",
  subjectType: "household",
  subjectId: "1-01-0001-01",
  deviceId: "device-1",
  userId: "fdc-1",
};

assert.equal(
  buildDraftKey(context),
  "HHQ|9 MAY 2026|task-hhq-1|household|1-01-0001-01|device-1|fdc-1",
);

const firstDraft = await saveQuestionnaireDraft({
  ...context,
  payload: { hhq_site_id: 1 },
  completionState: { currentPageName: "page_01_identification" },
});

assert.equal(firstDraft.draft_status, "active");
assert.deepEqual(firstDraft.json_payload, { hhq_site_id: 1 });
assert.deepEqual(firstDraft.completion_state, { currentPageName: "page_01_identification" });

const updatedDraft = await saveQuestionnaireDraft({
  ...context,
  draftId: firstDraft.draft_id,
  payload: { hhq_site_id: 1, hhq_residence_area_type: 2 },
  completionState: { currentPageName: "page_02_household" },
});

assert.equal(updatedDraft.draft_id, firstDraft.draft_id);
assert.deepEqual(updatedDraft.json_payload, {
  hhq_site_id: 1,
  hhq_residence_area_type: 2,
});

const activeDraft = await getActiveQuestionnaireDraft(context);
assert.equal(activeDraft.draft_id, firstDraft.draft_id);
assert.equal(activeDraft.draft_status, "active");
assert.deepEqual(activeDraft.completion_state, { currentPageName: "page_02_household" });
assert.deepEqual((await listActiveQuestionnaireDrafts()).map((draft) => draft.draft_id), [
  firstDraft.draft_id,
]);

const submittedDraft = await markQuestionnaireDraftSubmitted({
  draftId: firstDraft.draft_id,
  submittedFormResponseId: "HHQ-2026-06-07T00:00:00.000Z",
});

assert.equal(submittedDraft.draft_status, "submitted");
assert.equal(submittedDraft.submitted_form_response_id, "HHQ-2026-06-07T00:00:00.000Z");
assert.equal(await getActiveQuestionnaireDraft(context), null);
assert.deepEqual(await listActiveQuestionnaireDrafts(), []);

const stableHhqContext = {
  ...context,
  taskId: "task-hhq-original",
  keyTaskId: null,
  subjectId: "2-02-0002-01",
};
const stableDraft = await saveQuestionnaireDraft({
  ...stableHhqContext,
  payload: {
    hhq_site_id: 2,
    hhq_household_head_name: "Draft Head",
    hhq_household_address: "Draft address",
  },
  completionState: { currentPageName: "page_01_identification" },
});
assert.equal(
  buildDraftKey(stableHhqContext),
  "HHQ|9 MAY 2026|none|household|2-02-0002-01|device-1|fdc-1",
);
const reopenedStableDraft = await getActiveQuestionnaireDraft({
  ...stableHhqContext,
  taskId: "task-hhq-recreated",
});
assert.equal(reopenedStableDraft.draft_id, stableDraft.draft_id);
assert.deepEqual(reopenedStableDraft.json_payload, {
  hhq_site_id: 2,
  hhq_household_head_name: "Draft Head",
  hhq_household_address: "Draft address",
});
const resavedStableDraft = await saveQuestionnaireDraft({
  ...stableHhqContext,
  taskId: "task-hhq-recreated",
  payload: {
    hhq_site_id: 2,
    hhq_household_id: "2-02-0002-01",
    hhq_household_head_name: "Updated Draft Head",
  },
});
assert.equal(resavedStableDraft.draft_id, stableDraft.draft_id);
assert.deepEqual(
  (await listActiveQuestionnaireDrafts()).map((draft) => draft.draft_id),
  [stableDraft.draft_id],
);
const reopenedAfterDeviceRefresh = await getActiveQuestionnaireDraft({
  ...stableHhqContext,
  deviceId: "dev-device",
});
assert.equal(reopenedAfterDeviceRefresh.draft_id, stableDraft.draft_id);
await markQuestionnaireDraftSubmitted({ draftId: stableDraft.draft_id });

const draftWithoutGeneratedHouseholdId = await saveQuestionnaireDraft({
  ...stableHhqContext,
  subjectId: "unselected",
  payload: {
    hhq_site_id: 2,
    hhq_locality_code: "02",
    hhq_structure_map_id: "0002",
    hhq_household_number: "01",
    hhq_household_head_name: "Part-built Head",
  },
});
const reopenedFromTaskHouseholdId = await getActiveQuestionnaireDraft({
  ...stableHhqContext,
  subjectId: "2-02-0002-01",
});
assert.equal(reopenedFromTaskHouseholdId.draft_id, draftWithoutGeneratedHouseholdId.draft_id);
assert.equal(reopenedFromTaskHouseholdId.json_payload.hhq_household_head_name, "Part-built Head");
assert.equal(getDraftHouseholdId(draftWithoutGeneratedHouseholdId), "2-02-0002-01");
const reopenedByPreferredDraftId = await getActiveQuestionnaireDraft({
  ...stableHhqContext,
  subjectId: "different-subject",
  preferredDraftId: draftWithoutGeneratedHouseholdId.draft_id,
});
assert.equal(reopenedByPreferredDraftId.draft_id, draftWithoutGeneratedHouseholdId.draft_id);
await markQuestionnaireDraftSubmitted({ draftId: draftWithoutGeneratedHouseholdId.draft_id });

const mixedSiteDrafts = [
  { draft_id: "site-1", subject_id: "1-01-0001-01", json_payload: { hhq_site_id: 1 } },
  { draft_id: "site-2-payload", subject_id: "1-01-0001-01", json_payload: { hhq_site_id: 2 } },
  { draft_id: "site-2-household", subject_id: "2-02-0002-01", json_payload: {} },
  { draft_id: "unknown-site", subject_id: "", json_payload: {} },
];

assert.equal(getDraftSiteId(mixedSiteDrafts[2]), 2);
assert.deepEqual(
  filterDraftsForUserSite(mixedSiteDrafts, { site_id: 2 }).map((draft) => draft.draft_id),
  ["site-2-payload", "site-2-household"],
);
assert.equal(getDraftSavedMessage("hi"), "फॉर्म ड्राफ्ट के रूप में सेव हो गया है।");
assert.equal(getDraftSavedMessage("unknown"), "Form saved as draft.");

console.log("Validated questionnaire draft workflow helpers.");
