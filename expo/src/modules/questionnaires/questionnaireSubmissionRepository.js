import { eligibleWomanIdentified, promoteFormSubmission } from "@dynamic/event-core";
import {
  buildHouseholdIdFromHhqData,
  extractHouseholdRegistryFields,
  normalizeIdPart,
} from "../households/householdIds.js";

const STORAGE_KEY = "dynamic_questionnaire_submissions_v1";
const WEB_SQLITE_STORAGE_KEY = "dynamic_web_sqlite_v2";
const HOUSEHOLD_STORAGE_KEY = "dynamic_households_v4";
const MEMBER_STORAGE_KEY = "dynamic_household_members_v4";

function getStorage() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage;
}

function readStorageArray(storage, key) {
  try {
    const rows = JSON.parse(storage.getItem(key) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function readWebSqliteState(storage) {
  try {
    return {
      sync_meta: {},
      follow_up_tasks: [],
      task_attempts: [],
      form_responses: [],
      eligible_women: [],
      pregnancies: [],
      domain_events_outbox: [],
      ...JSON.parse(storage.getItem(WEB_SQLITE_STORAGE_KEY) || "{}"),
    };
  } catch {
    return {
      sync_meta: {},
      follow_up_tasks: [],
      task_attempts: [],
      form_responses: [],
      eligible_women: [],
      pregnancies: [],
      domain_events_outbox: [],
    };
  }
}

function createSubmissionId(formCode, householdId, timestamp) {
  const suffix = householdId || "response";
  return `${formCode}-${suffix}-${timestamp}`;
}

function createLocalUuid(prefix) {
  const uuid =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
          (
            Number(char) ^
            (Math.random() * 16) >> (Number(char) / 4)
          ).toString(16),
        );
  return `${prefix}-${uuid}`;
}

function parseHouseholdScope(householdId) {
  if (!householdId) return {};
  const [siteId, localityCode] = String(householdId).split("-");
  const parsedSiteId = Number(siteId);
  return {
    site_id: Number.isFinite(parsedSiteId) ? parsedSiteId : undefined,
    locality_code: localityCode || undefined,
  };
}

function buildQuestionnaireResponse({
  formCode,
  formVersion,
  payload,
  taskId,
  taskContext,
  deviceId,
  submittedAt,
}) {
  const householdId =
    formCode === "HHQ"
      ? buildHouseholdIdFromHhqData(payload || "")
      : taskContext?.household_id || taskContext?.subject_id || payload?.household_id || "";
  const householdScope = parseHouseholdScope(householdId);
  const siteId =
    payload?.hhq_site_id !== undefined && payload?.hhq_site_id !== null && payload?.hhq_site_id !== ""
      ? Number(payload.hhq_site_id)
      : householdScope.site_id;
  const localityCode =
    formCode === "HHQ" && payload?.hhq_locality_code
      ? normalizeIdPart(payload.hhq_locality_code, "00", 2)
      : householdScope.locality_code;
  const subjectType = taskContext?.subject_type || (householdId ? "household" : null);
  const subjectId = taskContext?.subject_id || householdId || null;
  const responseId = createSubmissionId(formCode, householdId, submittedAt);

  return {
    id: responseId,
    submission_id: responseId,
    task_id: taskId || taskContext?.id || null,
    form_code: formCode,
    form_version: formVersion,
    household_id: householdId || null,
    site_id: siteId,
    locality_code: localityCode,
    subject_type: subjectType,
    subject_id: subjectId,
    answers_json: payload || {},
    json_payload: payload || {},
    submitted_at: submittedAt,
    sync_status: "pending",
    device_id: deviceId || "unknown",
    created_at: submittedAt,
    updated_at: submittedAt,
  };
}

function saveWebFormResponse(response) {
  const storage = getStorage();
  if (!storage) return;
  const state = readWebSqliteState(storage);
  const row = {
    id: response.id,
    task_id: response.task_id,
    form_code: response.form_code,
    form_version: response.form_version,
    household_id: response.household_id,
    site_id: response.site_id,
    locality_code: response.locality_code,
    subject_type: response.subject_type,
    subject_id: response.subject_id,
    answers_json: JSON.stringify(response.answers_json || {}),
    submitted_at: response.submitted_at,
    sync_status: response.sync_status,
    device_id: response.device_id,
    created_at: response.created_at,
  };
  state.form_responses = [row, ...(state.form_responses || []).filter((item) => item.id !== row.id)];
  if (response.task_id) {
    state.follow_up_tasks = (state.follow_up_tasks || []).map((task) =>
      task.id === response.task_id
        ? { ...task, status: "completed", updated_at: response.submitted_at }
        : task,
    );
  }
  storage.setItem(WEB_SQLITE_STORAGE_KEY, JSON.stringify(state));
}

async function saveCanonicalFormResponse(response) {
  let taskRepository = null;
  try {
    taskRepository = await import("../tasks/taskRepository.js");
  } catch {
    // Node tests do not load the Metro-resolved expo-sqlite module.
  }
  if (typeof taskRepository?.saveFormResponse === "function") {
    await taskRepository.saveFormResponse(response);
    return;
  }
  saveWebFormResponse(response);
}

function mergeById(newRows, existingRows, idKey) {
  const seen = new Set();
  const merged = [];
  for (const row of [...newRows, ...existingRows]) {
    const id = row?.[idKey];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(row);
  }
  return merged;
}

function saveWebPromotedHousehold(record) {
  const storage = getStorage();
  if (!storage) return;
  const { raw_hhq_json: _raw, members = [], ...householdOnly } = record;
  const households = readStorageArray(storage, HOUSEHOLD_STORAGE_KEY);
  storage.setItem(
    HOUSEHOLD_STORAGE_KEY,
    JSON.stringify(
      mergeById(
        [householdOnly],
        households.filter((row) => row.household_id !== record.household_id),
        "household_id",
      ),
    ),
  );

  const currentMembers = readStorageArray(storage, MEMBER_STORAGE_KEY);
  storage.setItem(
    MEMBER_STORAGE_KEY,
    JSON.stringify(
      mergeById(
        members,
        currentMembers.filter((row) => row.household_id !== record.household_id),
        "individual_id",
      ),
    ),
  );
}

function isWqEligible(member) {
  return (
    member.woman_questionnaire_eligible === true ||
    member.woman_questionnaire_eligible === 1 ||
    member.woman_questionnaire_eligible === "1"
  );
}

function toLocalTask(descriptor, { submittedAt, subjectName, localityCode, sourceFormResponseId }) {
  return {
    id: createLocalUuid("local-task"),
    task_key: descriptor.task_key,
    household_id: descriptor.household_id,
    subject_type: descriptor.subject_type,
    subject_id: descriptor.subject_id,
    subject_name: subjectName,
    woman_id: descriptor.woman_id,
    pregnancy_id: descriptor.pregnancy_id,
    task_type: descriptor.task_type,
    form_code: descriptor.form_code,
    protocol_visit_label: descriptor.protocol_visit_label,
    target_date: descriptor.target_date,
    window_start: descriptor.window_start,
    window_end: descriptor.deadline_date,
    status: "open",
    lifecycle_status: "open",
    failed_attempt_count: 0,
    max_failed_attempts: descriptor.max_failed_attempts,
    requires_final_close_reason: descriptor.requires_final_close_reason,
    form_availability: descriptor.form_availability || "available",
    disabled_reason: descriptor.disabled_reason || null,
    assigned_locality_code: String(localityCode || ""),
    rules_version: descriptor.rules_version,
    generation_source: descriptor.generation_source,
    source_event_id: descriptor.source_event_id,
    source_form_response_id: sourceFormResponseId || null,
    sync_status: "pending",
    created_at: submittedAt,
    updated_at: submittedAt,
  };
}

function buildEligibleWoman({ householdId, household, member, interviewDate, submittedAt }) {
  return {
    woman_id: member.individual_id,
    household_member_id: member.individual_id,
    household_id: householdId,
    site_id: Number(household.site_id),
    locality_code: String(household.locality_code || ""),
    eligibility_start_date: interviewDate,
    wq_status: "pending",
    tracking_status: "not_tracked",
    current_eligibility_status: "eligible",
    eligibility_basis: "baseline_hhq",
    sync_status: "pending",
    created_at: submittedAt,
    updated_at: submittedAt,
  };
}

function buildPregnancyId(response, taskContext) {
  return (
    taskContext?.pregnancy_id ||
    response.answers_json?.pregnancy_id ||
    `local-pregnancy:${response.subject_id}:1`
  );
}

function saveWebDomainEvent(event, createdAt) {
  const storage = getStorage();
  if (!storage) return;
  const state = readWebSqliteState(storage);
  const row = {
    id: event.event_id,
    event_type: event.event_type,
    payload: JSON.stringify(event),
    created_at: createdAt,
    sync_status: "pending",
  };
  state.domain_events_outbox = mergeById(
    [row],
    state.domain_events_outbox || [],
    "id",
  );
  storage.setItem(WEB_SQLITE_STORAGE_KEY, JSON.stringify(state));
}

async function saveDomainEvent(event, createdAt) {
  let taskRepository = null;
  try {
    taskRepository = await import("../tasks/taskRepository.js");
  } catch {
    // Node tests do not load the Metro-resolved expo-sqlite module.
  }
  if (typeof taskRepository?.saveDomainEvent === "function") {
    taskRepository.saveDomainEvent(event, createdAt);
    return;
  }

  saveWebDomainEvent(event, createdAt);
}

function buildHhqDerivedWorkflow(record, response) {
  const householdId = record.household_id;
  const interviewDate = record.interview_date || response.submitted_at.split("T")[0];
  const eligibleMembers = (record.members || []).filter(isWqEligible);
  return eligibleMembers.map((member) => {
    const event = eligibleWomanIdentified.buildEvent({
      event_id: `hhq:${householdId}:${member.individual_id}`,
      site_id: Number(record.site_id),
      locality_code: normalizeIdPart(record.locality_code, "00", 2),
      household_id: householdId,
      woman_id: member.individual_id,
      eligibility_start_date: interviewDate,
      recorded_at: response.submitted_at,
      task_id: response.task_id,
      form_response_id: response.id,
      device_id: response.device_id,
    });
    const [taskDescriptor] = eligibleWomanIdentified.planWorkflow({ event });
    return {
      eligibleWoman: buildEligibleWoman({
        householdId,
        household: record,
        member,
        interviewDate,
        submittedAt: response.submitted_at,
      }),
      wqTask: toLocalTask(taskDescriptor, {
        submittedAt: response.submitted_at,
        subjectName: member.member_name,
        localityCode: record.locality_code,
        sourceFormResponseId: response.id,
      }),
    };
  });
}

function saveWebHhqDerivedWorkflow(derivedRows) {
  const storage = getStorage();
  if (!storage) return;
  const state = readWebSqliteState(storage);
  const eligibleWomen = derivedRows.map((row) => row.eligibleWoman);
  const wqTasks = derivedRows.map((row) => row.wqTask);

  state.eligible_women = mergeById(eligibleWomen, state.eligible_women || [], "woman_id");
  state.follow_up_tasks = mergeById(wqTasks, state.follow_up_tasks || [], "task_key");
  storage.setItem(WEB_SQLITE_STORAGE_KEY, JSON.stringify(state));
}

async function saveHhqDerivedWorkflow(record, response) {
  const derivedRows = buildHhqDerivedWorkflow(record, response);
  if (derivedRows.length === 0) return;

  let taskWorklist = null;
  try {
    taskWorklist = await import("../worklist/taskWorklistRepository.js");
  } catch {
    // Node tests do not load the Metro-resolved expo-sqlite module.
  }
  if (typeof taskWorklist?.saveEligibleWomanWorkflow === "function") {
    taskWorklist.saveEligibleWomanWorkflow(derivedRows);
    return;
  }

  saveWebHhqDerivedWorkflow(derivedRows);
}

function saveWebPefDerivedWorkflow(pregnancy, tasks) {
  const storage = getStorage();
  if (!storage) return;
  const state = readWebSqliteState(storage);
  state.pregnancies = mergeById([pregnancy], state.pregnancies || [], "pregnancy_id");
  state.follow_up_tasks = mergeById(tasks, state.follow_up_tasks || [], "task_key");
  storage.setItem(WEB_SQLITE_STORAGE_KEY, JSON.stringify(state));
}

function saveWebTasks(tasks) {
  const storage = getStorage();
  if (!storage || tasks.length === 0) return;
  const state = readWebSqliteState(storage);
  state.follow_up_tasks = mergeById(tasks, state.follow_up_tasks || [], "task_key");
  storage.setItem(WEB_SQLITE_STORAGE_KEY, JSON.stringify(state));
}

async function saveTasks(tasks) {
  if (tasks.length === 0) return;
  let taskWorklist = null;
  try {
    taskWorklist = await import("../worklist/taskWorklistRepository.js");
  } catch {
    // Node tests do not load the Metro-resolved expo-sqlite module.
  }
  if (typeof taskWorklist?.saveProvisionalTasks === "function") {
    taskWorklist.saveProvisionalTasks(tasks);
    return;
  }

  saveWebTasks(tasks);
}

async function savePefDerivedWorkflow(pregnancy, tasks) {
  let taskWorklist = null;
  try {
    taskWorklist = await import("../worklist/taskWorklistRepository.js");
  } catch {
    // Node tests do not load the Metro-resolved expo-sqlite module.
  }
  if (typeof taskWorklist?.saveProvisionalPregnancyWorkflow === "function") {
    taskWorklist.saveProvisionalPregnancyWorkflow({ pregnancy, tasks });
    return;
  }

  saveWebPefDerivedWorkflow(pregnancy, tasks);
}

async function promoteHhqLocally(response) {
  if (response.form_code !== "HHQ" || !response.household_id) return;
  const sourceFields = {
    sync_status: "pending",
    source_form_response_id: response.id,
    source_form_code: response.form_code,
    source_submitted_at: response.submitted_at,
    source_sync_status: response.sync_status,
    promoted_at: response.submitted_at,
  };
  const record = extractHouseholdRegistryFields(response.answers_json || {});
  const promotedRecord = {
    ...record,
    ...sourceFields,
    members: (record.members || []).map((member) => ({
      ...member,
      ...sourceFields,
    })),
  };
  const promotion = promoteFormSubmission({
    form_code: response.form_code,
    event_id: `local-hhq-baseline:${promotedRecord.household_id}:${response.id}`,
    site_id: Number(promotedRecord.site_id),
    locality_code: normalizeIdPart(promotedRecord.locality_code, "00", 2),
    household_id: promotedRecord.household_id,
    answers_json: response.answers_json,
    recorded_at: response.submitted_at,
    task_id: response.task_id,
    form_response_id: response.id,
    device_id: response.device_id,
    context: {
      household_number: String(promotedRecord.household_number || ""),
      structure_map_id: String(promotedRecord.structure_map_id || promotedRecord.structure_number || ""),
    },
  });
  if (!promotion) return;
  const hrfTasks = promotion.task_descriptors.map((descriptor) =>
    toLocalTask(descriptor, {
      submittedAt: response.submitted_at,
      localityCode: promotedRecord.locality_code,
      sourceFormResponseId: response.id,
    }),
  );

  await saveDomainEvent(promotion.event, response.submitted_at);

  let householdRepository = null;
  try {
    householdRepository = await import("../households/householdRepository.js");
  } catch {
    // Node tests do not load React Native/SQLite modules directly.
  }
  if (typeof householdRepository?.saveHousehold === "function") {
    await householdRepository.saveHousehold(promotedRecord);
    await saveHhqDerivedWorkflow(promotedRecord, response);
    await saveTasks(hrfTasks);
    return;
  }
  saveWebPromotedHousehold(promotedRecord);
  await saveHhqDerivedWorkflow(promotedRecord, response);
  await saveTasks(hrfTasks);
}

async function promotePefLocally(response, taskContext) {
  if (response.form_code !== "PEF" || !response.household_id || !response.subject_id) return;
  const pregnancyId = buildPregnancyId(response, taskContext);
  const promotion = promoteFormSubmission({
    form_code: response.form_code,
    event_id: `local-pregnancy-enrolled:${pregnancyId}:${response.id}`,
    site_id: Number(response.site_id),
    locality_code: String(response.locality_code || ""),
    household_id: response.household_id,
    subject_id: response.subject_id,
    answers_json: response.answers_json,
    recorded_at: response.submitted_at,
    task_id: response.task_id,
    task_key: taskContext?.task_key,
    form_response_id: response.id,
    device_id: response.device_id,
    context: {
      pregnancy_id: pregnancyId,
      woman_id: taskContext?.woman_id || response.subject_id,
      household_member_id: response.subject_id,
    },
  });
  if (!promotion) return;
  const projection = promotion.projection || {};
  const pregnancy = {
    ...projection,
    pregnancy_sequence: taskContext?.pregnancy_sequence || 1,
    source_form_response_id: response.id,
    source_sync_status: response.sync_status,
    sync_status: "pending",
    created_at: response.submitted_at,
    updated_at: response.submitted_at,
  };
  const tasks = promotion.task_descriptors.map((descriptor) =>
    toLocalTask(descriptor, {
      submittedAt: response.submitted_at,
      localityCode: response.locality_code,
      sourceFormResponseId: response.id,
    }),
  );

  await saveDomainEvent(promotion.event, response.submitted_at);
  await savePefDerivedWorkflow(pregnancy, tasks);
}

export async function listQuestionnaireSubmissions(formCode) {
  const storage = getStorage();
  if (!storage) return [];
  const rows = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
  return rows.filter((row) => row.form_code === formCode);
}

export async function saveQuestionnaireSubmission({
  formCode,
  formVersion,
  payload,
  taskId,
  taskContext,
  deviceId,
}) {
  const storage = getStorage();
  const now = new Date().toISOString();
  const response = buildQuestionnaireResponse({
    formCode,
    formVersion,
    payload,
    taskId,
    taskContext,
    deviceId,
    submittedAt: now,
  });
  const submission = { ...response };

  await saveCanonicalFormResponse(response);
  await promoteHhqLocally(response);
  await promotePefLocally(response, taskContext);

  if (!storage) {
    return submission;
  }

  const rows = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
  storage.setItem(STORAGE_KEY, JSON.stringify([submission, ...rows]));

  return submission;
}
