const TERMINAL = new Set(["completed", "missed", "cancelled", "superseded", "closed", "closed_final_reason"]);

export function isDeceasedWoman(woman) {
  return woman?.current_eligibility_status === "deceased";
}

export function isWomanTask(task, womanId, pregnancyIds = new Set()) {
  if (!womanId || task.child_id || ["child", "household"].includes(task.subject_type) || task.task_type === "HHQ") return false;
  return task.woman_id === womanId || task.subject_id === womanId ||
    pregnancyIds.has(task.pregnancy_id) || pregnancyIds.has(task.subject_id);
}

export function cancelWomanTask(task, timestamp) {
  if (TERMINAL.has(task.status) || TERMINAL.has(task.lifecycle_status)) return task;
  return { ...task, status: "cancelled", lifecycle_status: "cancelled",
    closed_reason: "woman_reported_dead", closed_at: timestamp, updated_at: timestamp };
}

export function terminateWomanState(state, { womanId, pregnancyId, householdId, timestamp }) {
  const pregnancies = state.pregnancies || [];
  const pregnancyIds = new Set(pregnancies.filter((row) => row.woman_id === womanId)
    .map((row) => row.pregnancy_id));
  if (pregnancyId) pregnancyIds.add(pregnancyId);
  const existing = (state.eligible_women || []).find((row) => row.woman_id === womanId);
  const woman = { ...existing, woman_id: womanId, household_member_id: womanId,
    household_id: existing?.household_id || householdId, tracking_status: "terminated",
    current_eligibility_status: "deceased", sync_status: "pending",
    created_at: existing?.created_at || timestamp, updated_at: timestamp };
  return { ...state,
    eligible_women: [woman, ...(state.eligible_women || []).filter((row) => row.woman_id !== womanId)],
    pregnancies: pregnancies.map((row) => row.woman_id === womanId && ["active", "enrolled", "detected"].includes(row.pregnancy_status)
      ? { ...row, pregnancy_status: "closed", updated_at: timestamp } : row),
    follow_up_tasks: (state.follow_up_tasks || []).map((task) => isWomanTask(task, womanId, pregnancyIds)
      ? cancelWomanTask(task, timestamp) : task),
  };
}
