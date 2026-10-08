import assert from "node:assert/strict";
import test from "node:test";
import { db, schema } from "../db";
import { runWithDb } from "./dbContext";
import { MISSING_HHQ_SYNC_ERROR, requireSyncedHouseholdBaseline } from "./syncDependencies";

test("missing/rejected baseline defers BWQ without writing evidence; accepted parent permits normal task validation", async () => {
  let responses: { response_status: string | null }[] = [];
  const fakeDb = {
    select: () => ({ from: (table: unknown) => {
      assert.equal(table, schema.formResponses);
      return { where: async () => responses };
    } }),
    insert: () => { throw new Error("dependency validation must not insert evidence"); },
    update: () => { throw new Error("dependency validation must not reclassify evidence"); },
  };
  await runWithDb(fakeDb as unknown as typeof db, async () => {
    await assert.rejects(requireSyncedHouseholdBaseline("2-02-0010-08"), { message: MISSING_HHQ_SYNC_ERROR });
    responses = [{ response_status: "invalid_rejected" }, { response_status: "duplicate" }, { response_status: "held_for_review" }, { response_status: "revisit_needed" }, { response_status: "superseded_revisit" }, { response_status: "excluded_after_revisits" }];
    await assert.rejects(requireSyncedHouseholdBaseline("2-02-0010-08"), { message: MISSING_HHQ_SYNC_ERROR });
    for (const status of ["primary", "accepted", null]) {
      responses = [{ response_status: status }];
      await requireSyncedHouseholdBaseline("2-02-0010-08");
    }
  });
});
