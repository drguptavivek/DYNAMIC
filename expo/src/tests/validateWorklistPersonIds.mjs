/** Render the actual worklist card so household labels cannot masquerade as person IDs. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "esbuild";

const source = fs.readFileSync(new URL("../modules/worklist/WorklistScreen.js", import.meta.url), "utf8");
const start = source.indexOf("const TaskRow = memo(");
const end = source.indexOf("\nexport function WorklistScreen", start);
assert.ok(start >= 0 && end > start);
const module = { exports: {} };
const host = (tag) => ({ children, accessibilityLabel }) => React.createElement(tag,
  accessibilityLabel ? { "aria-label": accessibilityLabel } : null, children);
vm.runInNewContext(transformSync(`${source.slice(start, end)}\nmodule.exports = TaskRow;`, {
  loader: "jsx", format: "cjs",
}).code, {
  module, React, memo: React.memo, View: host("div"), Text: host("span"), Pressable: host("button"),
  styles: {}, BADGE_COLORS: {}, MaterialCommunityIcons: () => null,
  getTaskOpenBlockReason: () => null, getTaskVisitNo: () => 1, getFormDisplayCode: (code) => code,
});

const householdId = "1-01-0001-01";
const base = { household_id: householdId, target_date: "2026-10-26", status: "open" };
function card(task) {
  return renderToStaticMarkup(React.createElement(module.exports, { task: { ...base, ...task } }));
}
for (const [index, name] of ["Sunita Rawat", "Kumari Sheela", "Baby Rawat"].entries()) {
  const id = `${householdId}-0${index + 1}`;
  const html = card({ task_type: "WQ", subject_type: "person", subject_id: id, woman_name: name });
  assert.ok(html.includes(name));
  assert.ok(html.includes(`Individual ID: ${id}`));
  assert.ok(html.includes(`Household ID: ${householdId}`));
}
const womanId = `${householdId}-04`;
assert.ok(card({ task_type: "PEF", subject_type: "woman", subject_id: womanId })
  .includes(`Individual ID: ${womanId}`));
const pregnancy = card({ task_type: "PFF", subject_type: "pregnancy",
  subject_id: "pregnancy-1", woman_id: womanId });
assert.ok(pregnancy.includes(`Individual ID: ${womanId}`));
assert.ok(!pregnancy.includes("Individual ID: pregnancy-1"));
const unlinkedPregnancy = card({ task_type: "PFF", subject_type: "pregnancy", subject_id: "pregnancy-1" });
assert.ok(!unlinkedPregnancy.includes("Individual ID:"));
for (const task of [
  { task_type: "HHQ", subject_type: "household", subject_id: householdId },
  { task_type: "HRF", subject_type: "household", subject_id: householdId },
  { task_type: "NFF", subject_type: "child", subject_id: "child-1", child_id: "child-1", woman_id: womanId },
]) {
  const html = card(task);
  assert.ok(html.includes(`Household ID: ${householdId}`));
  assert.ok(!html.includes("Individual ID:"), "A child's mother's ID must not be presented as the child's ID");
}
assert.doesNotMatch(source.slice(start, end), /taskSubjectName\} numberOfLines=/,
  "Full person IDs must wrap rather than truncate their distinguishing suffix on narrow screens");
console.log("Worklist cards show separate individual and household IDs without confusing pregnancy or child identity.");
