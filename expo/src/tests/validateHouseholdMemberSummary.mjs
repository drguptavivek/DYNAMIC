import assert from "node:assert/strict";

const { buildHouseholdMemberSummaryRows } = await import(
  "../modules/questionnaires/householdMemberSummary.js"
);

const form = {
  pages: [
    {
      elements: [
        {
          name: "hhq_household_members",
          templateElements: [
            {
              name: "member_sex",
              choices: [
                { value: 1, text: { default: "male" } },
                { value: 2, text: { default: "female" } },
              ],
            },
            {
              name: "member_relationship_to_head",
              choices: [
                { value: 1, text: { default: "Head" } },
                { value: 2, text: { default: "Wife or husband" } },
              ],
            },
            {
              name: "member_woman_questionnaire_eligible",
              choices: [
                { value: 1, text: { default: "Yes" } },
                { value: 2, text: { default: "No" } },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const rows = buildHouseholdMemberSummaryRows(
  {
    hhq_household_members: [
      {
        member_line_number: 1,
        member_name: "Asha",
        member_age_years: 25,
        member_sex: 2,
        member_relationship_to_head: 1,
        member_woman_questionnaire_eligible: 1,
      },
      {
        member_line_number: 2,
        member_name: "Bala",
        member_age_years: 30,
        member_sex: 1,
        member_relationship_to_head: 2,
        member_woman_questionnaire_eligible: 2,
      },
    ],
  },
  form
);

assert.deepEqual(rows, [
  {
    sr: 1,
    memberName: "Asha",
    age: "25",
    sex: "female",
    relation: "Head",
    wqEligible: "Yes",
  },
  {
    sr: 2,
    memberName: "Bala",
    age: "30",
    sex: "male",
    relation: "Wife or husband",
    wqEligible: "No",
  },
]);

console.log("Validated household member summary rows.");
