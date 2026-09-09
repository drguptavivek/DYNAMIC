import { formCatalog } from "../../data/formMetadata.js";
import { getFormDisplayCode } from "../../lib/formDisplayCodes.js";

const FORM_TITLES_BY_CODE = new Map(
  (formCatalog || []).map((form) => [String(form.form_code).toUpperCase(), form.title])
);

export function listStandardTaskTypeOptions() {
  return formCatalog
    .map((form) => ({
      value: String(form.form_code || "").toUpperCase(),
      label: getTaskTypeLabel(form.form_code),
    }))
    .filter((option) => option.value)
    .sort((left, right) => left.value.localeCompare(right.value));
}

export function getTaskTypeLabel(taskType) {
  const code = String(taskType || "").trim().toUpperCase();
  if (!code) return "";
  const display = getFormDisplayCode(code);
  const title = FORM_TITLES_BY_CODE.get(code);
  return title ? `${display} · ${title}` : display;
}
export function buildTaskTypeOptions(tasks) {
  const values = new Set();
  for (const task of tasks || []) {
    const value = String(task?.task_type || "").trim().toUpperCase();
    if (!value) continue;
    values.add(value);
  }
  return Array.from(values)
    .sort()
    .map((value) => ({ value, label: getTaskTypeLabel(value) }));
}

export function filterTasksByType(tasks, taskType) {
  const list = tasks || [];
  const normalized = String(taskType || "").trim().toUpperCase();
  if (!normalized) return list;
  return list.filter((task) => String(task?.task_type || "").trim().toUpperCase() === normalized);
}
