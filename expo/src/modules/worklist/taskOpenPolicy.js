function isVaTask(task) {
  return String(task?.task_type || "").toUpperCase() === "VA";
}

function hasVaFormPayload(task) {
  return Boolean(
    task?.va_json ||
      task?.va_form_json ||
      task?.form_json ||
      task?.form_definition_json ||
      task?.va_json_available === true,
  );
}

export function getTaskOpenBlockReason(task) {
  if (!task) return "Task is not available";
  if (task.status !== "open") return "Task is not open";
  if (task.form_availability === "disabled") {
    return task.disabled_reason || "This form is not yet available";
  }
  if (isVaTask(task) && !hasVaFormPayload(task)) {
    return "VA form is not available until verbal autopsy JSON is assigned.";
  }
  return null;
}

export function canOpenTaskForm(task) {
  return getTaskOpenBlockReason(task) === null;
}
