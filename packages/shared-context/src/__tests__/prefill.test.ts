import { describe, it } from "node:test";
import assert from "node:assert";
import {
  buildHhqPrefill,
  buildWqPrefill,
  buildHrfPrefill,
  buildPefPrefill,
  buildUfPrefill,
  buildPffPrefill,
  buildPofPrefill,
  buildBafPrefill,
  buildSbfPrefill,
  buildNffPrefill,
  buildCdfPrefill,
  buildVaPrefill,
  buildHouseholdContext,
  buildMemberContext,
  buildPregnancyContext,
  buildChildContext,
} from "../index";

describe("Prefill mappers", () => {
  it("buildHhqPrefill returns correct site_id and locality_code", () => {
    const household = {
      householdId: "hh-001",
      siteId: "SITE-A",
      localityCode: "LOC-001",
      householdNumber: "123",
    };
    const { prefill, readOnly } = buildHhqPrefill(household);

    assert.equal(prefill.hhq_site_id, "SITE-A");
    assert.equal(prefill.hhq_locality_code, "LOC-001");
    assert.deepEqual(readOnly.fields, ["hhq_site_id", "hhq_locality_code"]);
  });

  it("buildWqPrefill returns all 7 fields and marks all as readOnly", () => {
    const member = {
      memberId: "mem-001",
      householdId: "hh-001",
      memberNumber: 1,
      fullName: "Jane Doe",
      sex: "F",
      dob: "1990-05-15",
    };
    const household = {
      householdId: "hh-001",
      siteId: "SITE-A",
      localityCode: "LOC-001",
      householdNumber: "123",
    };

    const { prefill, readOnly } = buildWqPrefill(member, household);

    assert.equal(prefill.wq_site_id, "SITE-A");
    assert.equal(prefill.wq_locality_code, "LOC-001");
    assert.equal(prefill.wq_household_id, "hh-001");
    assert.equal(prefill.wq_member_id, "mem-001");
    assert.equal(prefill.wq_respondent_name, "Jane Doe");
    assert.equal(prefill.wq_respondent_dob, "1990-05-15");
    assert.equal(prefill.wq_respondent_sex, "F");

    assert.equal(readOnly.fields.length, 7);
  });

  it("buildHrfPrefill includes round_label from task context", () => {
    const household = {
      householdId: "hh-001",
      siteId: "SITE-A",
      localityCode: "LOC-001",
      householdNumber: "123",
    };
    const task = {
      taskId: "task-001",
      taskType: "HRF",
      protocolVisitLabel: "Round 2",
      targetDate: "2026-06-03",
      windowStart: "2026-05-20",
      windowEnd: "2026-06-17",
    };

    const { prefill, readOnly } = buildHrfPrefill(household, task);

    assert.equal(prefill.hrf_round_label, "Round 2");
    assert.equal(readOnly.fields.includes("hrf_round_label"), true);
  });

  it("buildPefPrefill maps woman fields correctly", () => {
    const member = {
      memberId: "mem-002",
      householdId: "hh-001",
      memberNumber: 2,
      fullName: "Sarah Smith",
      sex: "F",
      dob: "1995-03-20",
    };
    const household = {
      householdId: "hh-001",
      siteId: "SITE-B",
      localityCode: "LOC-002",
      householdNumber: "456",
    };

    const { prefill, readOnly } = buildPefPrefill(member, household);

    assert.equal(prefill.pef_woman_id, "mem-002");
    assert.equal(prefill.pef_woman_name, "Sarah Smith");
    assert.equal(prefill.pef_woman_dob, "1995-03-20");
    assert.equal(readOnly.fields.length, 6);
  });

  it("pregnancy and child follow-up builders prefill read-only lineage fields", () => {
    const household = {
      householdId: "hh-001",
      siteId: "SITE-B",
      localityCode: "LOC-002",
      householdNumber: "456",
    };
    const member = {
      memberId: "mem-002",
      householdId: "hh-001",
      memberNumber: 2,
      fullName: "Sarah Smith",
      sex: "F",
      dob: "1995-03-20",
    };
    const pregnancy = {
      pregnancyId: "preg-001",
      womanId: "woman-001",
      householdMemberId: "mem-002",
      enrollmentDate: "2026-02-01",
    };
    const child = {
      childId: "child-001",
      pregnancyId: "preg-001",
      motherMemberId: "mem-002",
      childName: "Baby Smith",
      birthStatus: "live_birth",
    };
    const task = {
      taskId: "task-002",
      taskType: "NFF",
      protocolVisitLabel: "28d",
      targetDate: "2026-10-01",
      windowStart: "2026-09-28",
      windowEnd: "2026-10-08",
    };

    const uf = buildUfPrefill(member, pregnancy);
    assert.equal(uf.prefill.uf_woman_name, "Sarah Smith");
    assert.equal(uf.prefill.uf_pregnancy_id, "preg-001");
    assert.deepEqual(uf.readOnly.fields, ["uf_woman_name", "uf_pregnancy_id"]);

    const pff = buildPffPrefill(member, pregnancy, task);
    assert.equal(pff.prefill.pff_pregnancy_id, "preg-001");
    assert.equal(pff.prefill.pff_visit_type, "28d");
    assert.equal(pff.readOnly.fields.includes("pff_woman_hh_member_id"), true);

    const pof = buildPofPrefill(member, pregnancy);
    assert.equal(pof.prefill.pof_woman_permanent_id, "woman-001");

    const baf = buildBafPrefill(member, pregnancy, child);
    assert.equal(baf.prefill.baf_birth_id, "child-001");

    const sbf = buildSbfPrefill(member, pregnancy, child);
    assert.equal(sbf.prefill.sbf_birth_id, "child-001");

    const nff = buildNffPrefill(member, pregnancy, child, task);
    assert.equal(nff.prefill.nff_child_name, "Baby Smith");
    assert.equal(nff.prefill.nff_round_visit, "28d");

    const cdf = buildCdfPrefill(member, pregnancy, child);
    assert.equal(cdf.prefill.cdf_birth_id, "child-001");

    const va = buildVaPrefill(child, household, task);
    assert.equal(va.prefill.va_child_id, "child-001");
    assert.equal(va.prefill.va_household_id, "hh-001");
  });

  it("buildHouseholdContext maps row correctly", () => {
    const row = {
      household_id: "hh-001",
      site_id: "SITE-A",
      locality_code: "LOC-001",
      household_number: "123",
      baseline_completed_date: "2026-06-01",
    };

    const context = buildHouseholdContext(row);

    assert.equal(context.householdId, "hh-001");
    assert.equal(context.siteId, "SITE-A");
    assert.equal(context.localityCode, "LOC-001");
    assert.equal(context.householdNumber, "123");
    assert.equal(context.baselineCompletedDate, "2026-06-01");
  });

  it("buildMemberContext handles missing dob gracefully", () => {
    const row = {
      member_id: "mem-001",
      household_id: "hh-001",
      member_number: 1,
      full_name: "John Doe",
      sex: "M",
      // dob is missing
    };

    const context = buildMemberContext(row);

    assert.equal(context.memberId, "mem-001");
    assert.equal(context.fullName, "John Doe");
    assert.equal(context.dob, undefined);
  });

  it("buildPregnancyContext maps enrollment_date", () => {
    const row = {
      pregnancy_id: "preg-001",
      woman_id: "wom-001",
      household_member_id: "mem-002",
      lmp_date: "2026-01-15",
      edd: "2026-10-22",
      enrollment_date: "2026-02-01",
    };

    const context = buildPregnancyContext(row);

    assert.equal(context.pregnancyId, "preg-001");
    assert.equal(context.womanId, "wom-001");
    assert.equal(context.enrollmentDate, "2026-02-01");
    assert.equal(context.lmpDate, "2026-01-15");
  });

  it("buildChildContext maps optional child name", () => {
    const row = {
      child_id: "child-001",
      pregnancy_id: "preg-001",
      mother_member_id: "mem-002",
      child_name: "Baby Smith",
      birth_status: "live_birth",
    };

    const context = buildChildContext(row);

    assert.equal(context.childId, "child-001");
    assert.equal(context.childName, "Baby Smith");
    assert.equal(context.birthStatus, "live_birth");
  });
});
