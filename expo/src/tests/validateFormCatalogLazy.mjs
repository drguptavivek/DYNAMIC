import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const formPaths = [
  "baseline_household_questionnaire_v2026.05.09.json",
  "baseline_woman_s_questionnaire_v2026.05.09.json",
  "household_rounds_form_v2026.05.14.json",
  "pregnancy_enrollment_form_v2026.05.11.json",
  "ultrasound_form_v2026.05.11.json",
  "pregnancy_followup_form_v2026.05.11.json",
  "pregnancy_outcome_form_v2026.05.13.json",
  "birth_assessment_form_v2026.05.13.json",
  "stillbirth_form_v2026.05.13.json",
  "newborn_followup_form_v2026.05.13.json",
  "child_death_form_v2026.05.13.json",
  "pregnancy_surveillance_form_v2026.07.19.json",
].map((fileName) => require.resolve(`../data/forms/${fileName}`));

for (const formPath of formPaths) delete require.cache[formPath];

const { buildTaskTypeOptions } = await import("../modules/worklist/taskTypeFilter.js");
assert.equal(
  formPaths.filter((formPath) => require.cache[formPath]).length,
  0,
  "building standard Worklist form choices must not evaluate questionnaire payloads",
);
assert.equal(buildTaskTypeOptions([{ task_type: "HHQ" }])[0].label, "BHQ · Baseline Household Questionnaire");

const { getBundledFormByCode } = await import("../data/formCatalog.js");
const hhq = getBundledFormByCode("hhq");
assert.equal(hhq.form_code, "HHQ");
assert.equal(getBundledFormByCode("HHQ"), hhq, "loaded questionnaire must be cached by code");
assert.equal(getBundledFormByCode("unknown"), undefined);

assert.equal(
  formPaths.filter((formPath) => require.cache[formPath]).length,
  1,
  "opening one questionnaire must evaluate only its bundled payload",
);

console.log("validateFormCatalogLazy.mjs: all assertions passed");
