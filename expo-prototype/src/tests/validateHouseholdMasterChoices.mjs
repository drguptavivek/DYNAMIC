import assert from "node:assert/strict";

const {
  applyHouseholdMasterChoices,
  getAssignedLocalities,
  getAssignedSites
} = await import("../lib/householdMasterChoices.js");

const user = {
  site_id: 2,
  area_assignments: [
    { site_id: 2, locality_code: "01", active_to: null },
    { site_id: 2, locality_code: "02", active_to: "2026-12-31" },
    { site_id: 2, locality_code: "99", active_to: "2025-12-31" },
    { site_id: 2, locality_code: "01", active_to: null }
  ]
};
const localities = [
  { site_id: 2, locality_code: "01", locality_name: "Ajronda" },
  { site_id: 2, locality_code: "02", locality_name: "Chhainsa" }
];

assert.deepEqual(getAssignedSites(user, "2026-06-04"), [
  { value: 2, text: { default: "Ballabgarh" } }
]);
assert.deepEqual(getAssignedLocalities(user, localities, 2, "2026-06-04"), [
  { value: "01", text: { default: "Ajronda" } },
  { value: "02", text: { default: "Chhainsa" } }
]);
assert.deepEqual(
  getAssignedLocalities({ site_id: 2 }, localities, 2, "2026-06-04"),
  [
    { value: "01", text: { default: "Ajronda" } },
    { value: "02", text: { default: "Chhainsa" } }
  ]
);

const surveyJson = {
  pages: [
    {
      elements: [
        {
          name: "hhq_site_id",
          choices: [
            { value: 1, text: { default: "Bareilley" } },
            { value: 2, text: { default: "Ballabgarh" } },
            { value: 3, text: { default: "Belgavi" } }
          ]
        },
        {
          name: "hhq_locality_code",
          choices: [
            { value: 1, text: { default: "Sunped" } },
            { value: 2, text: { default: "Sagarpur" } }
          ]
        }
      ]
    }
  ]
};

const scopedJson = applyHouseholdMasterChoices(surveyJson, { user, localities });
assert.deepEqual(scopedJson.pages[0].elements[0].choices, [
  { value: 2, text: { default: "Ballabgarh" } }
]);
assert.deepEqual(scopedJson.pages[0].elements[1].choices, [
  { value: "01", text: { default: "Ajronda" } },
  { value: "02", text: { default: "Chhainsa" } }
]);

console.log("Validated HHQ runtime master choices.");
