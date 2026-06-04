/**
 * Domain event generators - creates domain events when forms are submitted
 * Based on task type and form answers
 */

import { recordEvent } from "./eventOutbox.js";

/**
 * Generate domain event(s) for form submission
 * @param {object} task - The task being completed
 * @param {object} answersJson - The form answers (parsed JSON)
 */
export function generateEventForSubmission(task, answersJson) {
  if (!task) {
    return;
  }

  const answers = typeof answersJson === "string" ? JSON.parse(answersJson) : answersJson;

  switch (task.task_type) {
    case "HHQ":
      // Household enrolled event
      recordEvent("household_enrolled", {
        household_id: task.household_id,
        task_id: task.id,
        timestamp: new Date().toISOString(),
      });
      break;

    case "WQ":
      // Woman questionnaire completed
      recordEvent("wq_completed", {
        household_id: task.household_id,
        woman_id: task.subject_id,
        task_id: task.id,
        timestamp: new Date().toISOString(),
      });

      // Check if pregnancy was detected
      if (
        answers.wq_pregnant === 1 ||
        answers.wq_currently_pregnant === "1" ||
        answers.wq_currently_pregnant === 1
      ) {
        recordEvent("pregnancy_detected", {
          household_id: task.household_id,
          woman_id: task.subject_id,
          task_id: task.id,
          timestamp: new Date().toISOString(),
        });
      }
      break;

    case "PEF":
      // Pregnancy enrolled
      recordEvent("pregnancy_enrolled", {
        household_id: task.household_id,
        woman_id: task.subject_id,
        task_id: task.id,
        timestamp: new Date().toISOString(),
      });
      break;

    case "POF":
      // Pregnancy outcome recorded
      recordEvent("pregnancy_outcome_recorded", {
        household_id: task.household_id,
        woman_id: task.subject_id,
        task_id: task.id,
        timestamp: new Date().toISOString(),
      });
      break;

    case "BAF":
      // Birth assessment completed
      recordEvent("birth_assessment_completed", {
        household_id: task.household_id,
        woman_id: task.subject_id,
        task_id: task.id,
        timestamp: new Date().toISOString(),
      });
      break;

    case "NFF":
      // Neonatal follow-up completed
      recordEvent("nff_completed", {
        household_id: task.household_id,
        child_id: task.subject_id,
        visit_label: task.protocol_visit_label,
        task_id: task.id,
        timestamp: new Date().toISOString(),
      });
      break;

    case "CDF":
      // Child death recorded
      recordEvent("child_death_recorded", {
        household_id: task.household_id,
        child_id: task.subject_id,
        task_id: task.id,
        timestamp: new Date().toISOString(),
      });
      break;

    case "VAF":
      // Verbal autopsy recorded
      recordEvent("verbal_autopsy_completed", {
        household_id: task.household_id,
        deceased_id: task.subject_id,
        task_id: task.id,
        timestamp: new Date().toISOString(),
      });
      break;

    default:
      // Generic form submitted event
      recordEvent("form_submitted", {
        household_id: task.household_id,
        task_type: task.task_type,
        task_id: task.id,
        timestamp: new Date().toISOString(),
      });
  }
}
