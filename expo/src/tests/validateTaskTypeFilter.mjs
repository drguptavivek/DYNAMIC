import assert from "node:assert";
import {
  buildTaskTypeOptions,
  filterTasksByType,
  listStandardTaskTypeOptions,
} from "../modules/worklist/taskTypeFilter.js";

const tasks = [
  { id: 1, task_type: "wq" },
  { id: 2, task_type: "HHQ" },
  { id: 3, task_type: "WQ" },
  { id: 4, task_type: "" },
  { id: 5, task_type: null },
  { id: 6, task_type: "hrf" },
];

// buildTaskTypeOptions: dedupes, uppercases, sorts, drops blank
{
  const options = buildTaskTypeOptions(tasks);
  assert.deepStrictEqual(options, [
    { value: "HHQ", label: "BHQ · Baseline Household Questionnaire" },
    { value: "HRF", label: "HRF · Household Rounds Form" },
    { value: "WQ", label: "BWQ · Baseline Woman's Questionnaire" },
  ]);
}

// Worklist choices come from standard form metadata, even before tasks load.
{
  const options = listStandardTaskTypeOptions();
  assert.ok(options.length >= 12);
  assert.deepStrictEqual(
    options.find((option) => option.value === "HHQ"),
    { value: "HHQ", label: "BHQ · Baseline Household Questionnaire" },
  );
  assert.ok(options.some((option) => option.value === "PSF"));
}

// filterTasksByType: "" returns all tasks
{
  const result = filterTasksByType(tasks, "");
  assert.strictEqual(result.length, tasks.length);
}

// filterTasksByType: "wq" (lowercase) matches WQ/wq case-insensitively
{
  const result = filterTasksByType(tasks, "wq");
  assert.strictEqual(result.length, 2);
  assert.ok(result.every((task) => String(task.task_type).toUpperCase() === "WQ"));
}

// filterTasksByType: "WQ" (uppercase) matches same set
{
  const result = filterTasksByType(tasks, "WQ");
  assert.strictEqual(result.length, 2);
}

// filterTasksByType: unknown type returns empty
{
  const result = filterTasksByType(tasks, "ZZZ");
  assert.deepStrictEqual(result, []);
}

console.log("validateTaskTypeFilter.mjs: all assertions passed");
