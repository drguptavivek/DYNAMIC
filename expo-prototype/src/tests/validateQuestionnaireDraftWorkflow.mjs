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
  saveQuestionnaireDraft,
  markQuestionnaireDraftSubmitted,
} = await import("../modules/questionnaires/questionnaireDraftRepository.js");

const context = {
  formCode: "HHQ",
  formVersion: "9 MAY 2026",
  taskId: "task-hhq-1",
  subjectType: "household",
  subjectId: "1-101-0001-01",
  deviceId: "device-1",
  userId: "fdc-1",
};

assert.equal(
  buildDraftKey(context),
  "HHQ|9 MAY 2026|task-hhq-1|household|1-101-0001-01|device-1|fdc-1",
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

const submittedDraft = await markQuestionnaireDraftSubmitted({
  draftId: firstDraft.draft_id,
  submittedFormResponseId: "HHQ-2026-06-07T00:00:00.000Z",
});

assert.equal(submittedDraft.draft_status, "submitted");
assert.equal(submittedDraft.submitted_form_response_id, "HHQ-2026-06-07T00:00:00.000Z");
assert.equal(await getActiveQuestionnaireDraft(context), null);

console.log("Validated questionnaire draft workflow helpers.");
