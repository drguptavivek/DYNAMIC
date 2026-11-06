import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMemberWorkflowCorrection, planMemberWorkflowCorrection } from "./memberWorkflowCorrection";

function context(): any {
  const household_id = "2-39-0001-01", member_id = `${household_id}-01`;
  return { actor: { user_id: "manager", role: "site_data_manager", site_id: 2 },
    household: { household_id, site_id: 2, locality_code: "39", baseline_completed_date: "2026-11-01", baseline_enrollment_status: "enrolled", cohort_status: "active" },
    member: { household_member_id: member_id, household_id, sex: 1, reported_age_years: 28, marital_status: 1,
      date_of_birth: "1998-01-01", date_of_birth_precision: "inferred_from_age", reported_age_as_of_date: "2026-11-01", member_status: "active", usual_resident: true, site_id: 2, locality_code: "39" },
    current: { sex: 1, reported_age_years: 28, marital_status: 1, wq_pregnant: null },
    woman: undefined, tasks: [], responses: [], pregnancies: [], drafts: [], corrections: [], source: undefined };
}
const input = (changes: Record<string, number>) => parseMemberWorkflowCorrection({ changes, reason: "Verified against original records" });
function withBwq(c = context()): any {
  c.member.sex = 2; c.current.sex = 2; c.current.wq_pregnant = 2;
  c.woman = { woman_id: c.member.household_member_id, eligibility_start_date: "2026-11-01", wq_status: "completed", current_eligibility_status: "eligible", tracking_status: "not_pregnant" };
  c.source = { form_response_id: "bwq-evidence", form_code: "WQ", task_id: "bwq-task", response_status: "primary",
    created_offline_at: new Date("2026-11-02T10:00Z"), answers_json: { wq_pregnant: 2, wq_interview_date: "2026-11-02" } };
  c.responses = [c.source];
  return c;
}

test("only four strictly typed workflow drivers and bounded reason are accepted", () => {
  for (const changes of [{ name: "changed" }, { sex: 0 }, { reported_age_years: 121 }, { reported_age_years: "28" }, { marital_status: 8 }, { wq_pregnant: 3 }, {}]) {
    assert.throws(() => parseMemberWorkflowCorrection({ changes, reason: "verified" }), /supported correction/);
  }
  for (const reason of [" ", "x".repeat(1001)]) assert.throws(() => parseMemberWorkflowCorrection({ changes: { sex: 2 }, reason }));
  assert.equal(input({ wq_pregnant: 98 }).changes.wq_pregnant, 98);
});

test("male-to-female creates only canonical BWQ, eligibility boundaries do not broaden", () => {
  const c = context(), plan = planMemberWorkflowCorrection(c, input({ sex: 2 }));
  assert.equal(plan.can_apply, true);
  assert.deepEqual(plan.tasks_to_create.map(t => t.form_code), ["WQ"]);
  assert.equal(plan.tasks_to_create[0].target_date, "2026-11-01");
  for (const age of [0, 17, 50, 120]) {
    c.current.reported_age_years = age;
    assert.equal(planMemberWorkflowCorrection(c, input({ sex: 2 })).tasks_to_create.length, 0);
  }
  c.current.reported_age_years = 28; c.current.marital_status = 7;
  assert.equal(planMemberWorkflowCorrection(c, input({ sex: 2 })).tasks_to_create.length, 0);
});

test("an existing/completed BWQ never duplicates; own admin-withdrawn baseline can be restored", () => {
  const c = context(), first = planMemberWorkflowCorrection(c, input({ sex: 2 }));
  c.tasks = [{ ...first.descriptors[0], task_id: "baseline", status: "completed" }];
  assert.equal(planMemberWorkflowCorrection(c, input({ sex: 2 })).tasks_to_create.length, 0);
  c.tasks[0].status = "superseded"; c.tasks[0].closed_reason = "member_workflow_correction";
  assert.equal(planMemberWorkflowCorrection(c, input({ sex: 2 })).tasks_to_create.length, 1);
  assert.equal(planMemberWorkflowCorrection(c, input({ sex: 2 })).can_apply, true);
  c.tasks[0].closed_reason = "other_reason";
  assert.equal(planMemberWorkflowCorrection(c, input({ sex: 2 })).tasks_to_create.length, 0);
});

test("a terminal BWQ needs correction/revisit review when a later roster correction makes the member eligible", () => {
  const c = context(); c.member.sex = 2; c.current.sex = 2; c.member.marital_status = 7; c.current.marital_status = 7;
  c.tasks = [{ task_id: "terminal-bwq", task_key: "old-baseline", form_code: "WQ", status: "completed" }];
  c.responses = [{ form_response_id: "never-married", form_code: "WQ", response_status: "never_married_terminal", task_id: "terminal-bwq" }];
  const closed = planMemberWorkflowCorrection(c, input({ marital_status: 1 }));
  assert.equal(closed.can_apply, false);
  assert.equal(closed.tasks_to_create.length, 0);
  assert.ok(closed.warnings.some(warning => warning.includes("correction/revisit review")));
  c.tasks[0].status = "in_progress";
  assert.equal(planMemberWorkflowCorrection(c, input({ marital_status: 1 })).can_apply, true, "existing open BWQ remains available without duplication");
  c.tasks[0].status = "cancelled";
  assert.equal(planMemberWorkflowCorrection(c, input({ marital_status: 1 })).can_apply, false);
});

test("completed BWQ uses canonical PSF plus PEF for Yes, preserves original anchors and unsure codes", () => {
  const c = withBwq(), plan = planMemberWorkflowCorrection(c, input({ wq_pregnant: 1 }));
  assert.equal(plan.can_apply, true);
  assert.ok(plan.tasks_to_create.some(t => t.form_code === "PEF" && t.target_date === "2026-11-02"));
  assert.ok(plan.tasks_to_create.some(t => t.form_code === "PSF"));
  assert.ok(!plan.tasks_to_create.some(t => t.form_code === "WQ"));
  assert.ok(planMemberWorkflowCorrection(c, input({ wq_pregnant: 98 })).tasks_to_create.every(t => t.form_code === "PSF"));
  c.current.wq_pregnant = null;
  assert.equal(planMemberWorkflowCorrection(c, input({ reported_age_years: 29 })).can_apply, false);
  assert.equal(planMemberWorkflowCorrection(c, input({ wq_pregnant: 1 })).can_apply, true);
});

test("No withdraws only open PEF, never PSF/completed work, and preserves saved drafts via review block", () => {
  const c = withBwq(); c.current.wq_pregnant = 1;
  c.tasks = [{ task_id: "pef-open", form_code: "PEF", status: "planned" }, { task_id: "psf", form_code: "PSF", status: "planned" }, { task_id: "pef-complete", form_code: "PEF", status: "completed" }];
  assert.deepEqual(planMemberWorkflowCorrection(c, input({ wq_pregnant: 2 })).tasks_to_withdraw.map(t => t.task_id), ["pef-open"]);
  assert.equal(planMemberWorkflowCorrection(c, input({ wq_pregnant: 2 })).can_apply, false, "completed clinical work requires review");
  c.tasks.pop();
  assert.equal(planMemberWorkflowCorrection(c, input({ wq_pregnant: 2 })).can_apply, true);
  c.drafts = [{ draft_id: "saved", task_id: "pef-open", draft_status: "active" }];
  assert.equal(planMemberWorkflowCorrection(c, input({ wq_pregnant: 2 })).can_apply, false);
});

test("later accepted clinical evidence and pregnancy enrollment block conflicting pathway corrections", () => {
  for (const form_code of ["PSF", "PEF", "PFF", "POF", "UF"]) {
    const c = withBwq();
    c.responses.push({ form_code, form_response_id: form_code, response_status: "primary", created_offline_at: new Date("2026-11-03T10:00Z") });
    assert.equal(planMemberWorkflowCorrection(c, input({ wq_pregnant: 1 })).can_apply, false, form_code);
  }
  const c = withBwq(); c.pregnancies = [{ pregnancy_id: "enrolled", enrollment_date: "2026-11-03", pregnancy_status: "enrolled" }];
  assert.equal(planMemberWorkflowCorrection(c, input({ wq_pregnant: 1 })).can_apply, false);
});

test("age correction follows original inferred DOB rule but never replaces a conflicting reported DOB", () => {
  const c = context(), plan = planMemberWorkflowCorrection(c, input({ reported_age_years: 30 }));
  assert.equal(plan.inferredDateOfBirth, "1996-01-01");
  assert.equal(plan.can_apply, true);
  c.member.date_of_birth_precision = "reported"; c.member.date_of_birth = "1998-01-01";
  assert.equal(planMemberWorkflowCorrection(c, input({ reported_age_years: 30 })).can_apply, false);
});

test("demographic-only and No-to-Unsure corrections preserve an advanced pathway; legacy completed work blocks a branch change", () => {
  const c = withBwq(); c.current.wq_pregnant = 1;
  c.pregnancies = [{ pregnancy_id: "closed-with-outcome", pregnancy_status: "closed", outcome_recorded_date: "2026-11-03" }];
  const age = planMemberWorkflowCorrection(c, input({ reported_age_years: 29 }));
  assert.equal(age.can_apply, true); assert.equal(age.routingChanged, false);
  assert.equal(age.descriptors.length, 0); assert.equal(age.withdrawn.length, 0);
  c.current.wq_pregnant = 2;
  const unsure = planMemberWorkflowCorrection(c, input({ wq_pregnant: 98 }));
  assert.equal(unsure.can_apply, true); assert.equal(unsure.routingChanged, false);
  assert.equal(unsure.descriptors.length, 0); assert.equal(unsure.withdrawn.length, 0);
  c.pregnancies = [];
  for (const status of ["completed_on_time", "completed_late"]) {
    c.tasks = [{ task_id: "legacy-pef", status, form_code: "PEF" }];
    assert.equal(planMemberWorkflowCorrection(c, input({ wq_pregnant: 1 })).can_apply, false);
  }
});

test("fingerprint changes on evidence, current values, tasks, drafts and reason; input does not mutate context", () => {
  const c = withBwq(), before = structuredClone(c), value = input({ wq_pregnant: 1 });
  const token = planMemberWorkflowCorrection(c, value).preview_token;
  assert.deepEqual(c, before);
  for (const alter of [(x: any) => { x.member.sex = 1; }, (x: any) => { x.tasks.push({ task_id: "new" }); },
    (x: any) => { x.source.answers_json.wq_pregnant = 98; }, (x: any) => { x.drafts.push({ draft_id: "new" }); }]) {
    const changed = structuredClone(c); alter(changed);
    assert.notEqual(planMemberWorkflowCorrection(changed, value).preview_token, token);
  }
  assert.notEqual(planMemberWorkflowCorrection(c, { ...value, reason: "Different verified reason" }).preview_token, token);
});
