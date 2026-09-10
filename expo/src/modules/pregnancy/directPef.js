import { getLocalCalendarDate } from "../../lib/localDate.js";
import { listActiveQuestionnaireDraftSummaries } from "../questionnaires/questionnaireDraftRepository.js";
import {
  listFormResponses,
  listTasksForSubject,
  saveTask,
} from "../tasks/taskRepository.js";

const TERMINAL_TASK_STATUSES = new Set([
  "completed", "missed", "cancelled", "superseded", "closed", "closed_final_reason",
]);

function answerNumber(answers, key) {
  const value = answers?.[key];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAnswers(response) {
  if (!response) return {};
  if (response.answers_json && typeof response.answers_json === "object") return response.answers_json;
  try { return JSON.parse(response.answers_json || "{}"); } catch { return {}; }
}

function isFinalizedWq(response) {
  const answers = parseAnswers(response);
  return answerNumber(answers, "wq_pregnancy_tracking_eligible") === 1 &&
    [2, 98].includes(answerNumber(answers, "wq_pregnant"));
}

function isActiveTask(task) {
  return !TERMINAL_TASK_STATUSES.has(String(task?.status || task?.lifecycle_status || "open").toLowerCase()) &&
    !TERMINAL_TASK_STATUSES.has(String(task?.lifecycle_status || task?.status || "open").toLowerCase());
}

export async function getDirectPefEligibility({ member, householdId } = {}) {
  const womanId = String(member?.individual_id || "").trim();
  const normalizedHouseholdId = String(householdId || member?.household_id || "").trim();
  if (!womanId || !normalizedHouseholdId || Number(member?.woman_questionnaire_eligible) !== 1) {
    return { eligible: false, reason: "woman_not_eligible" };
  }

  const wqResponses = listFormResponses({
    form_code: "WQ",
    household_id: normalizedHouseholdId,
    subject_id: womanId,
  });
  const latestWq = wqResponses.find((response) =>
    response.sync_status !== "upload_error" && isFinalizedWq(response));
  if (!latestWq) return { eligible: false, reason: "wq_not_completed_as_not_pregnant" };

  const pefResponses = listFormResponses({
    form_code: "PEF",
    household_id: normalizedHouseholdId,
    subject_id: womanId,
  });
  if (pefResponses.length > 0) return { eligible: false, reason: "pef_already_recorded" };

  const pefTasks = listTasksForSubject({
    householdId: normalizedHouseholdId,
    subjectId: womanId,
    taskType: "PEF",
  });
  if (pefTasks.some(isActiveTask)) return { eligible: false, reason: "pef_task_already_present" };

  const drafts = await listActiveQuestionnaireDraftSummaries();
  const pefDraft = drafts.find((draft) =>
    String(draft?.form_code || "").toUpperCase() === "PEF" &&
    String(draft?.household_id || "") === normalizedHouseholdId &&
    String(draft?.subject_id || draft?.woman_id || "") === womanId,
  );
  if (pefDraft) return { eligible: false, reason: "pef_draft_already_present" };

  return { eligible: true, wqResponse: latestWq };
}

export async function createDirectPefTask({ member, household } = {}) {
  const householdId = String(household?.household_id || member?.household_id || "").trim();
  const eligibility = await getDirectPefEligibility({ member, householdId });
  if (!eligibility.eligible) return { task: null, ...eligibility };

  const womanId = String(member.individual_id).trim();
  const today = getLocalCalendarDate();
  const taskKey = `${householdId}|person|${womanId}|PEF|direct-pregnancy-detected|${today}|v1`;
  const existing = listTasksForSubject({ householdId, subjectId: womanId, taskType: "PEF" })
    .find((task) => task.task_key === taskKey && isActiveTask(task));
  if (existing) return { task: existing, created: false, eligible: true };

  const task = {
    id: `local-direct-pef-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    task_key: taskKey,
    household_id: householdId,
    subject_type: "person",
    subject_id: womanId,
    subject_name: member.member_name || womanId,
    task_type: "PEF",
    protocol_visit_label: "PEF-pregnancy-detected",
    target_date: today,
    window_start: today,
    window_end: today,
    status: "open",
    lifecycle_status: "open",
    form_availability: "available",
    assigned_locality_code: String(household?.locality_code || ""),
    rules_version: "v1",
    generation_source: "contextual_action",
    sync_status: "local",
  };
  saveTask(task);
  return { task, created: true, eligible: true };
}
