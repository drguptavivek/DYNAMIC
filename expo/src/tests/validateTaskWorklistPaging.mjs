import assert from "node:assert/strict";

import { stubOfflineDatabase } from "./helpers/stubOfflineDatabase.mjs";

const calls = [];
let total = 205;
const fakeDb = {
  calls,
  runSync(sql, params = []) {
    calls.push({ method: "runSync", sql, params });
    return { changes: 0 };
  },
  getFirstAsync(sql, params = []) {
    calls.push({ method: "getFirstAsync", sql, params });
    return Promise.resolve({ total });
  },
  getAllAsync(sql, params = []) {
    calls.push({ method: "getAllAsync", sql, params });
    const limit = Number(params.at(-2));
    const offset = Number(params.at(-1));
    return Promise.resolve(
      Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, index) => ({
        id: `task-${offset + index + 1}`,
        task_key: `task-key-${offset + index + 1}`,
        task_type: "HRF",
        household_id: `1-01-${String(offset + index + 1).padStart(4, "0")}-01`,
        subject_type: "household",
        subject_id: `household-${offset + index + 1}`,
        status: "open",
        lifecycle_status: "open",
        target_date: "2026-09-04",
      })),
    );
  },
  getAllSync() {
    return [];
  },
  getFirstSync() {
    return null;
  },
};

const require = stubOfflineDatabase(fakeDb, import.meta.url);
const { listTasksPage, saveTask } = require("../modules/tasks/taskRepository.js");

const firstPage = await listTasksPage({ search: "abc", limit: 100, offset: 0 });
assert.equal(firstPage.tasks.length, 100);
assert.equal(firstPage.total, 205);
assert.equal(firstPage.hasMore, true);
assert.equal(firstPage.offset, 0);

const pageQuery = calls.find((call) => call.method === "getAllAsync");
assert.match(pageQuery.sql, /t\.household_id LIKE \? COLLATE NOCASE/);
assert.match(pageQuery.sql, /t\.subject_name LIKE \? COLLATE NOCASE/);
assert.ok(pageQuery.params.includes("abc%"), "search must use a case-insensitive prefix value");

const secondPage = await listTasksPage({ search: "abc", limit: 100, offset: 100 });
assert.equal(secondPage.tasks.length, 100);
assert.equal(secondPage.total, 205);
assert.equal(secondPage.hasMore, true);

const finalPage = await listTasksPage({ search: "abc", limit: 100, offset: 200 });
assert.equal(finalPage.tasks.length, 5);
assert.equal(finalPage.total, 205);
assert.equal(finalPage.hasMore, false);

total = 0;
const emptyStandardFilter = await listTasksPage({ task_type: "VA", limit: 100, offset: 0 });
assert.deepEqual(emptyStandardFilter.tasks, []);
assert.equal(emptyStandardFilter.total, 0);
assert.equal(emptyStandardFilter.hasMore, false);

const callsBeforeLargeDraftSet = calls.length;
await listTasksPage({
  activeDrafts: Array.from({ length: 1200 }, (_, index) => ({
    form_code: "HRF",
    task_id: `draft-task-${index}`,
  })),
  limit: 100,
  offset: 0,
});
const largeDraftCalls = calls.slice(callsBeforeLargeDraftSet);
const largeDraftQuery = largeDraftCalls.find((call) => call.method === "getAllAsync");
assert.match(largeDraftQuery.sql, /json_each\(\?\)/);
assert.ok(
  largeDraftQuery.params.length < 30,
  "large draft sets must use JSON table parameters rather than one bind per identity",
);
assert.equal(
  JSON.parse(largeDraftQuery.params.find((value) => String(value).startsWith("["))).length,
  1200,
);

const beforeSave = calls.length;
saveTask({
  id: "new-task",
  task_key: "new-task-key",
  household_id: "1-01-9999-01",
  subject_type: "household",
  subject_id: "household-9999",
  task_type: "HRF",
  target_date: "2026-09-04",
});
const saveCalls = calls.slice(beforeSave).filter((call) => call.method === "runSync");
assert.equal(saveCalls.length, 1, "creating one task must not rewrite existing task rows");
assert.ok(!saveCalls.some((call) => /UPDATE follow_up_tasks/i.test(call.sql)));

console.log("Task worklist paging validation passed");
