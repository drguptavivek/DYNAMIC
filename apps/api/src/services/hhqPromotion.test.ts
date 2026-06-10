import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHhqHouseholdPromotionValues,
  buildHhqMemberPromotionValues,
} from "./hhqPromotion";

test("builds household and member values from finalized HHQ answers", () => {
  const answers = {
    hhq_site_id: 1,
    hhq_locality_code: 2,
    hhq_structure_map_id: "0042",
    hhq_household_number: "03",
    hhq_residence_area_type: 1,
    hhq_household_address: "Test address",
    hhq_household_head_name: "Head Name",
    hhq_consent_study_provide_pis_explain_study_adult_member: 1,
    hhq_interview_date: "2026-09-01",
    hhq_result_interview: 1,
    hhq_language_questionnaire: 1,
    hhq_contact_mobile_numbers: [{ mobile_number: "9999999999" }],
    hhq_household_members: [
      {
        member_line_number: 2,
        member_name: "Member Two",
        member_relationship_to_head: 2,
        member_sex: 2,
        member_residence_duration: { years: 5, months: 6 },
        member_age_years: 35,
        member_marital_status: 1,
        member_woman_questionnaire_eligible: 1,
      },
    ],
  };
  const now = new Date("2026-09-01T10:00:00.000Z");

  const household = buildHhqHouseholdPromotionValues("", answers, now);

  assert.equal(household.household_id, "1-02-0042-03");
  assert.equal(household.site_id, 1);
  assert.equal(household.locality_code, "02");
  assert.equal(household.structure_map_id, "0042");
  assert.equal(household.household_number, "03");
  assert.equal(household.contact_mobile, "9999999999");
  assert.equal(household.baseline_enrollment_status, "enrolled");
  assert.equal(household.baseline_completed_date, "2026-09-01");

  const member = buildHhqMemberPromotionValues(
    household,
    answers.hhq_household_members[0],
    0,
    "2026-09-01",
    now,
  );

  assert.equal(member.household_member_id, "1-02-0042-03-02");
  assert.equal(member.household_id, "1-02-0042-03");
  assert.equal(member.member_number, 2);
  assert.equal(member.site_id, 1);
  assert.equal(member.locality_code, "02");
  assert.equal(member.name, "Member Two");
  assert.equal(member.reported_age_years, 35);
  assert.equal(member.date_of_birth, "1991-01-01");
  assert.equal(member.date_of_birth_precision, "inferred_from_age");
  assert.equal(member.woman_questionnaire_eligible, true);
});
