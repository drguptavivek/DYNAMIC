export function isAssignedBaselineHhq(task) {
  return String(task?.task_type || "").toUpperCase() === "HHQ" &&
    task?.protocol_visit_label === "baseline" &&
    ["field_worker_household_assignment", "field_worker_assignment_sync_reconciliation"]
      .includes(task?.generation_source);
}

export function getTaskWorklistDate(task, today) {
  const protocolDate = task?.target_date || task?.window_start || "";
  if (!isAssignedBaselineHhq(task)) return protocolDate;
  const deadline = task?.window_end || task?.target_date || "";
  // Initial BHQ is current throughout its assignment window, not waiting until its deadline.
  if (task?.window_start && task.window_start <= today && deadline && deadline >= today) return today;
  return deadline || protocolDate;
}
