import assert from "node:assert/strict";

const {
  extractHouseholdRegistryFields,
  assertUniqueMembers,
  buildHouseholdIdFromHhqData
} = await import("../modules/households/householdIds.js");

const sample = {
  hhq_site_id: 1,
  hhq_locality_code: 2,
  hhq_structure_map_id: "0042",
  hhq_household_number: "03",
  hhq_household_address: "Test address",
  hhq_household_head_name: "Head Name",
  hhq_consent_study_provide_pis_explain_study_adult_member: 1,
  hhq_interview_date: "2026-09-01",
  hhq_result_interview: 1,
  hhq_language_questionnaire: 1,
  hhq_contact_mobile: "9999999999",
  hhq_household_members: [
    {
      member_line_number: 1,
      member_name: "Head Name",
      member_relationship_to_head: 1,
      member_sex: 1,
      member_age_years: 40,
      member_marital_status: 1
    },
    {
      member_line_number: 2,
      member_name: "Member Two",
      member_relationship_to_head: 2,
      member_sex: 2,
      member_age_years: 35,
      member_marital_status: 1,
      member_woman_questionnaire_eligible: 1
    }
  ]
};

const record = extractHouseholdRegistryFields(sample);
assert.equal(record.household_id, "1-02-0042-03");
assert.equal(record.members.length, 2);
assert.equal(record.members[0].individual_id, "1-02-0042-03-01");
assert.equal(record.members[1].individual_id, "1-02-0042-03-02");
assert.equal(buildHouseholdIdFromHhqData(sample), "1-02-0042-03");
assert.equal(
  buildHouseholdIdFromHhqData({ ...sample, hhq_structure_map_id: "42" }),
  ""
);
assert.equal(
  buildHouseholdIdFromHhqData({ ...sample, hhq_household_number: "3" }),
  ""
);

assert.doesNotThrow(() => assertUniqueMembers(record));

const duplicate = extractHouseholdRegistryFields({
  ...sample,
  hhq_household_members: [
    { member_line_number: 1, member_name: "A" },
    { member_line_number: 1, member_name: "B" }
  ]
});

assert.throws(() => assertUniqueMembers(duplicate), /Duplicate/);

console.log("Validated household and individual ID extraction.");
