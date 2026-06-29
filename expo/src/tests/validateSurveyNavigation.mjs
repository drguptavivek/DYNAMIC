import assert from "node:assert/strict";
import { Model } from "survey-core";

const {
  HOUSEHOLD_MEMBER_SUMMARY_SECTION_NAME,
  COMPACT_PREVIEW_SECTION_NAME,
  buildSurveySections,
  calculateSurveyProgress,
  getCurrentPageName,
  goToSurveySection,
} = await import("../modules/questionnaires/surveyNavigation.js");

const model = new Model({
  pages: [
    {
      name: "page_01_identification",
      title: { default: "01-IDENTIFICATION", hi: "01-पहचान" },
      elements: [
        { type: "text", name: "site_id", title: "Site", isRequired: true },
        { type: "text", name: "locality_code", title: "Locality" },
      ],
    },
    {
      name: "page_02_household_schedule",
      title: "02-HOUSEHOLD",
      elements: [
        { type: "text", name: "household_number", title: "Household number", isRequired: true },
      ],
    },
    {
      name: "page_03_household_characteristics",
      title: "03-HOUSEHOLD CHARACTERISTICS",
      elements: [
        { type: "text", name: "water_source", title: "Water source" },
      ],
    },
  ],
});

model.locale = "hi";
model.setValue("site_id", "1");

assert.deepEqual(buildSurveySections(model), [
  {
    index: 0,
    name: "page_01_identification",
    title: "01-पहचान",
    answered: 1,
    total: 2,
    hasErrors: false,
    isCurrent: true,
  },
  {
    index: 1,
    name: "page_02_household_schedule",
    title: "02-HOUSEHOLD",
    answered: 0,
    total: 1,
    hasErrors: false,
    isCurrent: false,
  },
  {
    index: 2,
    name: "page_03_household_characteristics",
    title: "03-HOUSEHOLD CHARACTERISTICS",
    answered: 0,
    total: 1,
    hasErrors: false,
    isCurrent: false,
  },
]);

assert.deepEqual(calculateSurveyProgress(model), {
  answered: 1,
  total: 4,
  percent: 25,
});

assert.equal(getCurrentPageName(model), "page_01_identification");
goToSurveySection(model, "page_02_household_schedule");
assert.equal(getCurrentPageName(model), "page_02_household_schedule");
assert.equal(buildSurveySections(model)[1].isCurrent, true);

const sectionsWithSummary = buildSurveySections(model, {
  includeHouseholdMemberSummary: true,
  includeCompactPreview: true,
  currentSectionName: HOUSEHOLD_MEMBER_SUMMARY_SECTION_NAME,
  householdMemberSummaryConfirmed: true,
});

assert.deepEqual(
  sectionsWithSummary.map((section) => section.name),
  [
    "page_01_identification",
    "page_02_household_schedule",
    HOUSEHOLD_MEMBER_SUMMARY_SECTION_NAME,
    "page_03_household_characteristics",
    COMPACT_PREVIEW_SECTION_NAME,
  ]
);
assert.equal(sectionsWithSummary[2].title, "02B-HOUSEHOLD MEMBER SUMMARY");
assert.equal(sectionsWithSummary[2].answered, 1);
assert.equal(sectionsWithSummary[2].isCurrent, true);
assert.equal(sectionsWithSummary[1].isCurrent, false);
assert.equal(sectionsWithSummary[4].title, "PREVIEW");
assert.equal(sectionsWithSummary[4].answered, 0);

const sectionsWithPreviewActive = buildSurveySections(model, {
  includeCompactPreview: true,
  compactPreviewConfirmed: true,
  currentSectionName: COMPACT_PREVIEW_SECTION_NAME,
});

assert.equal(sectionsWithPreviewActive.at(-1).name, COMPACT_PREVIEW_SECTION_NAME);
assert.equal(sectionsWithPreviewActive.at(-1).answered, 1);
assert.equal(sectionsWithPreviewActive.at(-1).isCurrent, true);

console.log("Validated SurveyJS navigation helpers.");
