import { runWithDb } from "../lib/dbContext";
import { schema, db } from "../db";
import type { TaskDescriptor } from "@dynamic/shared-workflow";
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkGeneratedTaskKey, withGeneratedTaskKeys, writeTasksFromDescriptors, resolveTaskWomanId } from "./taskWriter";

test("client task keys must exactly match the server workflow for one form", async () => {
  await withGeneratedTaskKeys(["a", "b"], async () => {
    checkGeneratedTaskKey("b");
    checkGeneratedTaskKey("a");
  });
  await withGeneratedTaskKeys([], async () => {});
  await assert.rejects(
    withGeneratedTaskKeys(["a"], async () => checkGeneratedTaskKey("b")),
    /do not match/,
  );
  await assert.rejects(withGeneratedTaskKeys(["a"], async () => {}), /do not match/);
  await assert.rejects(withGeneratedTaskKeys(["a", "a"], async () => {}), /Invalid/);
  await assert.rejects(withGeneratedTaskKeys(null, async () => {}), /Invalid/);
  await Promise.all([
    withGeneratedTaskKeys(["a"], async () => {
      await Promise.resolve();
      checkGeneratedTaskKey("a");
    }),
    withGeneratedTaskKeys(["b"], async () => {
      await Promise.resolve();
      checkGeneratedTaskKey("b");
    }),
  ]);
});


test("terminated woman cannot gain own tasks; household and child work remain independent", async () => {
  const inserted: string[] = [];
  let womanReads = 0;
  const fakeDb = {
    execute: async () => {},
    select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => {
      if (table === schema.pregnancies) return [{ woman_id: "woman-1" }];
      womanReads++;
      return [{ tracking_status: "terminated", current_eligibility_status: "deceased" }];
    } }) }) }),
    insert: () => ({ values: (value: { task_key: string }) => ({ onConflictDoNothing: async () => { inserted.push(value.task_key); } }) }),
  };
  const descriptor = { household_id: "1-01-0001-01", target_date: "2026-10-20" };
  const tasks = [
    { ...descriptor, task_key: "woman", subject_type: "woman", subject_id: "woman-1" },
    { ...descriptor, task_key: "pregnancy", subject_type: "pregnancy", subject_id: "pregnancy-1" },
    { ...descriptor, task_key: "child", subject_type: "child", subject_id: "child-1", woman_id: "woman-1" },
    { ...descriptor, task_key: "child-id", subject_type: "pregnancy", subject_id: "pregnancy-1", child_id: "child-1", woman_id: "woman-1" },
    { ...descriptor, task_key: "household", subject_type: "household", subject_id: "1-01-0001-01" },
  ] as TaskDescriptor[];
  await runWithDb(fakeDb as unknown as typeof db, async () => {
    await withGeneratedTaskKeys(tasks.map((task) => task.task_key), () => writeTasksFromDescriptors(tasks));
    assert.equal(await resolveTaskWomanId({ subject_type: "pregnancy", subject_id: "pregnancy-1" }), "woman-1");
  });
  assert.deepEqual(inserted, ["child", "child-id", "household"]);
  assert.equal(womanReads, 2);
});
