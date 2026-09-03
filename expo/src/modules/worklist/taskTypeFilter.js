import { getFormDisplayCode } from "../../lib/formDisplayCodes.js";
export function buildTaskTypeOptions(tasks) {
  const values = new Set();
  for (const task of tasks || []) {
    const value = String(task?.task_type || "").trim().toUpperCase();
    if (!value) continue;
    values.add(value);
  }
  return Array.from(values)
    .sort()
    .map((value) => ({ value, label: getFormDisplayCode(value) }));
}

export function filterTasksByType(tasks, taskType) {
  const list = tasks || [];
  const normalized = String(taskType || "").trim().toUpperCase();
  if (!normalized) return list;
  return list.filter((task) => String(task?.task_type || "").trim().toUpperCase() === normalized);
}
