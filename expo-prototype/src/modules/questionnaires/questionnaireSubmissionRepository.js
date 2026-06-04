const STORAGE_KEY = "dynamic_questionnaire_submissions_v1";

function getStorage() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage;
}

export async function listQuestionnaireSubmissions(formCode) {
  const storage = getStorage();
  if (!storage) return [];
  const rows = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
  return rows.filter((row) => row.form_code === formCode);
}

export async function saveQuestionnaireSubmission({ formCode, formVersion, payload, taskId }) {
  const storage = getStorage();
  const now = new Date().toISOString();
  const submission = {
    submission_id: `${formCode}-${now}`,
    form_code: formCode,
    form_version: formVersion,
    json_payload: payload,
    sync_status: "local",
    created_at: now,
    updated_at: now,
  };

  if (!storage) {
    // No localStorage, but still try to complete task if taskId provided
    if (taskId) {
      try {
        const { completeTask } = await import("../tasks/taskRepository.js");
        await completeTask(taskId, formCode, formVersion, JSON.stringify(payload), "unknown");
      } catch (error) {
        console.error("Error completing task:", error);
      }
    }
    return submission;
  }

  const rows = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
  storage.setItem(STORAGE_KEY, JSON.stringify([submission, ...rows]));

  // Link to task if taskId provided
  if (taskId) {
    try {
      const { completeTask } = await import("../tasks/taskRepository.js");
      await completeTask(taskId, formCode, formVersion, JSON.stringify(payload), "unknown");
    } catch (error) {
      console.error("Error completing task:", error);
      // Don't throw - submission still saved
    }
  }

  return submission;
}
