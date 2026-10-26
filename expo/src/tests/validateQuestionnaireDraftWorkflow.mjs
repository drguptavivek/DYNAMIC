import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

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
  listQuestionnaireDraftsForSync,
  mergeServerQuestionnaireDrafts,
  removeQuestionnaireDraft,
  saveQuestionnaireDraft,
  markQuestionnaireDraftSubmitted,
  toDraftSyncRecord,
} = await import("../modules/questionnaires/questionnaireDraftRepository.js");
const {
  draftMatchesTask,
  filterDraftsForTaskCandidates,
  filterDraftsForUserSite,
  getDraftComparableIds,
  getDraftHouseholdId,
  getDraftSiteId,
  getDraftSubjectId,
} = await import("../modules/questionnaires/draftPendingForms.js");
const { getDraftSavedMessage } = await import("../modules/questionnaires/draftSaveMessages.js");
const { shouldPersistHhqDraft } = await import(
  "../modules/households/hhqDraftPersistence.js"
);

assert.equal(shouldPersistHhqDraft({ currentPageName: "page_01_identification" }), false);
assert.equal(shouldPersistHhqDraft({
  currentPageName: "page_01_identification",
  reason: "next",
}), false);
assert.equal(shouldPersistHhqDraft({
  currentPageName: "page_02_household_schedule",
  reason: "next",
}), true);
assert.equal(shouldPersistHhqDraft({
  currentPageName: "page_01_identification",
  manual: true,
}), true);
assert.equal(shouldPersistHhqDraft({
  currentPageName: "page_01_identification",
  hasPersistedDraft: true,
}), true);
assert.equal(shouldPersistHhqDraft({
  currentPageName: "page_01_identification",
  reason: "final-submit",
}), true);

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
assert.equal(reopenedByPreferredDraftId, null, "a preferred ID cannot override the task household");
await markQuestionnaireDraftSubmitted({ draftId: draftWithoutGeneratedHouseholdId.draft_id });

const mixedSiteDrafts = [
  { draft_id: "site-1", subject_id: "1-01-0001-01", json_payload: { hhq_site_id: 1 } },
  { draft_id: "site-2-payload", subject_id: "1-01-0001-01", json_payload: { hhq_site_id: 2 } },
  { draft_id: "site-2-household", subject_id: "2-02-0002-01", json_payload: {} },
  { draft_id: "unknown-site", subject_id: "", json_payload: {} },
];

assert.equal(getDraftSiteId(mixedSiteDrafts[2]), 2);
const wqDraft = {
  draft_id: "wq-draft",
  form_code: "WQ",
  task_id: "task-wq-1",
  subject_id: "2-02-0003-01-01",
  json_payload: { wq_enter_structure_id_woman: "2-02-0003-01-01" },
};
assert.equal(getDraftSubjectId(wqDraft), "2-02-0003-01-01");
assert.equal(getDraftHouseholdId(wqDraft), "2-02-0003-01");
assert.deepEqual([...getDraftComparableIds(wqDraft)].sort(), [
  "2-02-0003-01-01",
  "task-wq-1",
  "wq-draft",
].sort());
const wqTaskCandidate = {
  id: "task-wq-1",
  task_type: "WQ",
  household_id: "2-02-0003-01",
  subject_id: "2-02-0003-01-01",
};
const orphanDraft = {
  draft_id: "orphan-hhq",
  form_code: "HHQ",
  subject_id: "2-00-0000-00",
  json_payload: { hhq_household_id: "2-00-0000-00" },
};
assert.equal(draftMatchesTask(wqDraft, wqTaskCandidate), true);
assert.equal(draftMatchesTask(wqDraft, { ...wqTaskCandidate, id: "task-wq-2", subject_id: "2-02-0003-01-02" }), false);
assert.equal(draftMatchesTask({ ...wqDraft, subject_id: "2-02-0003-01-02" }, wqTaskCandidate), false,
  "a stale task ID cannot override a different participant");
assert.deepEqual(
  filterDraftsForTaskCandidates([wqDraft, orphanDraft], [wqTaskCandidate]).map(
    (draft) => draft.draft_id,
  ),
  ["wq-draft"],
);

// Keep the indexed bulk matcher identical to the individual matcher, including
// legacy payload fallbacks, untrimmed form codes and case-sensitive identities.
const matchingDrafts = [
  null,
  undefined,
  {},
  wqDraft,
  wqDraft,
  orphanDraft,
  { form_code: "wq", task_id: "  task-wq-1  " },
  { form_code: " WQ ", task_id: "task-wq-1" },
  { form_code: "WQ", task_id: "TASK-WQ-1" },
  { form_code: "HHQ", draft_key: "legacy-key" },
  { form_code: "PEF", woman_id: " woman-id ", subject_id: "fallback-subject" },
  { form_code: "PFF", json_payload: { pff_pregnancy_id: "local-pregnancy:2-02-0003-01-01" } },
  { form_code: "HHQ", json_payload: {
    hhq_site_id: 2, hhq_locality_code: 2, hhq_structure_map_id: "3", hhq_household_number: 1,
  } },
  { form_code: "", draft_id: "blank-form" },
  { form_code: "WQ", task_id: 0, subject_id: false },
];
const matchingTasks = [
  null,
  undefined,
  {},
  wqTaskCandidate,
  { task_type: "wq", task_key: " task-wq-1 " },
  { task_type: " WQ ", task_id: "task-wq-1" },
  { task_type: "HHQ", task_key: " legacy-key " },
  { task_type: "PEF", subject_id: "woman-id" },
  { task_type: "PFF", household_id: "2-02-0003-01" },
  { task_type: "HHQ", household_id: "2-02-0003-01" },
  { id: "blank-form" },
  { task_type: "WQ", id: 0, subject_id: false },
];
for (const candidates of [[], matchingTasks, ...matchingTasks.map((task) => [task])]) {
  assert.deepEqual(
    filterDraftsForTaskCandidates(matchingDrafts, candidates),
    matchingDrafts.filter((draft) => candidates.some((task) => draftMatchesTask(draft, task))),
  );
}
assert.deepEqual(filterDraftsForTaskCandidates(), []);

const largeTaskCandidates = Array.from({ length: 120_000 }, (_, index) => ({
  id: `large-task-${index}`,
  task_type: index % 2 ? "WQ" : "HHQ",
}));
const largeDraftCandidates = Array.from({ length: 10_000 }, (_, index) => ({
  draft_id: `large-draft-${index}`,
  task_id: `large-task-${110_000 + index}`,
  form_code: index % 2 ? "wq" : "hhq",
}));
const unmatchedLargeDraft = { draft_id: "unmatched", form_code: "HHQ" };
const matchingStartedAt = performance.now();
const largeMatches = filterDraftsForTaskCandidates(
  [...largeDraftCandidates, unmatchedLargeDraft], largeTaskCandidates,
);
assert.equal(largeMatches.length, largeDraftCandidates.length);
assert.equal(largeMatches[0], largeDraftCandidates[0]);
assert.equal(largeMatches.at(-1), largeDraftCandidates.at(-1));
console.log(`Draft matching host benchmark: 120000 tasks / 10001 drafts in ${(performance.now() - matchingStartedAt).toFixed(1)} ms.`);
assert.deepEqual(
  filterDraftsForUserSite(mixedSiteDrafts, { site_id: 2 }).map((draft) => draft.draft_id),
  ["site-2-payload", "site-2-household"],
);
assert.equal(getDraftSavedMessage("hi"), "फॉर्म ड्राफ्ट के रूप में सेव हो गया है।");
assert.equal(getDraftSavedMessage("unknown"), "Form saved as draft.");

const crossDeviceDraft = await saveQuestionnaireDraft({
  ...context,
  taskId: "task-cross-device",
  subjectId: "2-02-0009-01",
  payload: {
    hhq_site_id: 2,
    hhq_locality_code: "02",
    hhq_structure_map_id: "0009",
    hhq_household_number: "01",
    hhq_household_head_name: "Recovered Head",
  },
});
const syncRecord = toDraftSyncRecord(crossDeviceDraft);
assert.equal(syncRecord.household_id, "2-02-0009-01");
assert.equal(syncRecord.site_id, 2);
assert.equal(syncRecord.locality_code, "02");
const legacyPffDraft = toDraftSyncRecord({
  ...crossDeviceDraft,
  form_code: "PFF",
  household_id: null,
  subject_id: "pregnancy-without-household-prefix",
  json_payload: { pff_pregnancy_id: "pregnancy-without-household-prefix" },
}, { household_id: "2-02-0009-01" });
assert.equal(legacyPffDraft.household_id, "2-02-0009-01");
assert.equal(legacyPffDraft.site_id, 2);
assert.equal(legacyPffDraft.locality_code, "02");
const offlinePffDraft = toDraftSyncRecord({
  ...crossDeviceDraft,
  form_code: "PFF",
  household_id: null,
  site_id: null,
  locality_code: null,
  subject_id: "local-pregnancy:2-02-0009-01-02:1",
  json_payload: { pff_pregnancy_id: "local-pregnancy:2-02-0009-01-02:1" },
});
assert.equal(offlinePffDraft.household_id, "2-02-0009-01");
assert.equal(offlinePffDraft.site_id, 2);
assert.equal(offlinePffDraft.locality_code, "02");
const offlinePefDraft = toDraftSyncRecord({
  ...crossDeviceDraft,
  form_code: "PEF",
  household_id: null,
  site_id: null,
  locality_code: null,
  subject_id: "2-02-0009-01-02",
  json_payload: {},
});
assert.equal(offlinePefDraft.household_id, "2-02-0009-01");
assert.equal(offlinePefDraft.locality_code, "02");
assert.equal(getDraftHouseholdId({ subject_id: "pregnancy-without-household-prefix" }), "");
const attachmentDraftSyncRecord = toDraftSyncRecord({
  ...crossDeviceDraft,
  form_code: "PEF",
  json_payload: {
    household_id: "2-02-0009-01",
    pef_ultrasound_reports: {
      report_count: 1,
      reports: [{
        report_id: "report-1",
        ultrasound_date: "2026-09-14",
        images: [{
          attachment_id: "attachment-1",
          local_uri: "file:///private/device-only.jpg",
          original_name: "camera.jpg",
          mime_type: "image/jpeg",
          file_size: 100,
        }],
      }],
    },
    pef_anc_card_image: {
      attachment_id: "anc-attachment-1",
      local_uri: "file:///private/anc-card.jpg",
      original_name: "anc-card.jpg",
      mime_type: "image/jpeg",
      file_size: 200,
    },
  },
});
assert.equal(
  attachmentDraftSyncRecord.json_payload.pef_ultrasound_reports.reports[0].images[0].local_uri,
  undefined,
  "device-local attachment paths must not be copied into server draft backups",
);
assert.equal(
  attachmentDraftSyncRecord.json_payload.pef_ultrasound_reports.reports[0].ultrasound_date,
  "2026-09-14",
  "ultrasound dates must be included in server draft backups",
);
assert.equal(
  attachmentDraftSyncRecord.json_payload.pef_anc_card_image.local_uri,
  undefined,
  "device-local ANC card paths must not be copied into server draft backups",
);
assert.equal(
  attachmentDraftSyncRecord.json_payload.pef_anc_card_image.attachment_id,
  "anc-attachment-1",
);
assert.equal((await listQuestionnaireDraftsForSync("fdc-1")).some(
  (draft) => draft.draft_id === crossDeviceDraft.draft_id,
), true);

await markQuestionnaireDraftSubmitted({ draftId: crossDeviceDraft.draft_id });
const restoredCount = await mergeServerQuestionnaireDrafts(
  [{ ...syncRecord, draft_status: "active", updated_at: "2099-01-01T00:00:00.000Z" }],
  { userId: "fdc-1", deviceId: "replacement-device" },
);
assert.equal(restoredCount, 1);
const restoredDraft = await getActiveQuestionnaireDraft({
  ...context,
  taskId: "task-cross-device",
  subjectId: "2-02-0009-01",
  deviceId: "replacement-device",
});
assert.equal(restoredDraft.json_payload.hhq_household_head_name, "Recovered Head");
assert.equal(restoredDraft.device_id, "replacement-device");
assert.equal(await removeQuestionnaireDraft(restoredDraft.draft_id), true);
assert.equal(
  (await listQuestionnaireDraftsForSync("fdc-1")).some(
    (draft) => draft.draft_id === restoredDraft.draft_id,
  ),
  false,
);
assert.equal(await removeQuestionnaireDraft("missing-draft"), false);

const gpsDraft = await saveQuestionnaireDraft({
  ...context, taskId: "gps-storage-test", subjectId: "2-02-0099-01",
  payload: { hhq_gps_latitude: 28.1, hhq_gps_longitude: 77.2,
    hhq_gps_accuracy_m: 12, hhq_gps_captured_at: "old" },
  completionState: { prefill: { hhq_gps_accuracy_m: 11, hhq_gps_captured_at: "old", keep: 1 } },
});
assert.deepEqual(gpsDraft.json_payload, { hhq_gps_latitude: 28.1, hhq_gps_longitude: 77.2 });
assert.deepEqual(gpsDraft.completion_state, { prefill: { keep: 1 } });
const gpsStored = JSON.parse(store.get("dynamic_questionnaire_drafts_v1"))
  .find((draft) => draft.draft_id === gpsDraft.draft_id);
assert.deepEqual(gpsStored.json_payload, gpsDraft.json_payload);
assert.deepEqual(gpsStored.completion_state, gpsDraft.completion_state);
const legacyGps = { ...gpsDraft, json_payload: { ...gpsDraft.json_payload,
  hhq_gps_accuracy_m: 10, hhq_gps_captured_at: "legacy" },
  completion_state: { prefill: { hhq_gps_accuracy_m: 10, keep: 1 } } };
const gpsSync = toDraftSyncRecord(legacyGps);
assert.deepEqual(gpsSync.json_payload, gpsDraft.json_payload);
assert.deepEqual(gpsSync.completion_state, { prefill: { keep: 1 } });
assert.equal(legacyGps.json_payload.hhq_gps_accuracy_m, 10);
console.log("Validated questionnaire draft workflow helpers.");

const womanContext = { ...context, formCode: "WQ", subjectType: "person",
  householdId: "2-02-0098-01", subjectId: "2-02-0098-01-02", taskId: "wq-woman-a" };
const womanA = await saveQuestionnaireDraft({ ...womanContext,
  payload: { wq_enter_structure_id_woman: womanContext.subjectId, woman_name: "Woman A" } });
const otherWomanContext = { ...womanContext, subjectId: "2-02-0098-01-03", taskId: "wq-woman-b" };
assert.equal(await getActiveQuestionnaireDraft({ ...otherWomanContext, preferredDraftId: womanA.draft_id }), null);
await assert.rejects(saveQuestionnaireDraft({ ...otherWomanContext,
  payload: { wq_enter_structure_id_woman: womanContext.subjectId } }), /does not match/);
const womanB = await saveQuestionnaireDraft({ ...otherWomanContext,
  payload: { wq_enter_structure_id_woman: otherWomanContext.subjectId, woman_name: "Woman B" } });
assert.notEqual(womanA.draft_id, womanB.draft_id);
assert.equal((await getActiveQuestionnaireDraft(womanContext)).json_payload.woman_name, "Woman A");
assert.equal((await getActiveQuestionnaireDraft(otherWomanContext)).json_payload.woman_name, "Woman B");
assert.equal((await listActiveQuestionnaireDrafts()).filter((row) => [womanA.draft_id, womanB.draft_id].includes(row.draft_id)).length, 2);
await markQuestionnaireDraftSubmitted({ draftId: womanA.draft_id, submittedFormResponseId: "woman-a-response" });
assert.equal((await getActiveQuestionnaireDraft(otherWomanContext)).draft_id, womanB.draft_id);
assert.equal(await getActiveQuestionnaireDraft({ ...otherWomanContext, userId: "other-user", preferredDraftId: womanB.draft_id }), null);
const damagedRows = JSON.parse(store.get("dynamic_questionnaire_drafts_v1"));
damagedRows.find((row) => row.draft_id === womanB.draft_id).json_payload.wq_enter_structure_id_woman = womanContext.subjectId;
store.set("dynamic_questionnaire_drafts_v1", JSON.stringify(damagedRows));
assert.equal(await getActiveQuestionnaireDraft({ ...otherWomanContext, preferredDraftId: womanB.draft_id }), null,
  "legacy drafts with another woman's readonly ID must remain stored but never restore");
