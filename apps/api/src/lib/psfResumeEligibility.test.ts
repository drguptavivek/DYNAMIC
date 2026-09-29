import { canResumePsfAfterNeverPregnantPff } from "./psfResumeEligibility";
import assert from "node:assert/strict";
import { test } from "node:test";

test("PSF resumes only for the woman's closed never-pregnant PFF pathway", () => {
  const closed = [{ pregnancy_id: "preg-1", pregnancy_status: "closed" }];
  const neverPregnant = [{ subject_id: "preg-1", answers_json: { pff_pregnancy_status: 3 } }];
  assert.equal(canResumePsfAfterNeverPregnantPff(closed, neverPregnant), true);
  assert.equal(canResumePsfAfterNeverPregnantPff(closed, [{ subject_id: "preg-1", answers_json: { pff_pregnancy_status: 2 } }]), false);
  assert.equal(canResumePsfAfterNeverPregnantPff(closed, [{ subject_id: "preg-other", answers_json: { pff_pregnancy_status: 3 } }]), false);
  assert.equal(canResumePsfAfterNeverPregnantPff([...closed, { pregnancy_id: "preg-2", pregnancy_status: "active" }], neverPregnant), false);
  assert.equal(canResumePsfAfterNeverPregnantPff([], neverPregnant), false);
});
