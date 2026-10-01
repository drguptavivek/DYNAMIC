import assert from "node:assert/strict";
import { test } from "node:test";
import { checkGeneratedTaskKey, withGeneratedTaskKeys } from "./taskWriter";

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
