// CommonJS keeps synchronous, statically analyzable Metro requires compatible
// with the Node-based validation scripts that import the ESM catalog.
module.exports = {
  HHQ: () => require("./forms/baseline_household_questionnaire_v2026.05.09.json"),
  WQ: () => require("./forms/baseline_woman_s_questionnaire_v2026.05.09.json"),
  HRF: () => require("./forms/household_rounds_form_v2026.05.14.json"),
  PEF: () => require("./forms/pregnancy_enrollment_form_v2026.05.11.json"),
  UF: () => require("./forms/ultrasound_form_v2026.05.11.json"),
  PFF: () => require("./forms/pregnancy_followup_form_v2026.05.11.json"),
  POF: () => require("./forms/pregnancy_outcome_form_v2026.05.13.json"),
  BAF: () => require("./forms/birth_assessment_form_v2026.05.13.json"),
  SBF: () => require("./forms/stillbirth_form_v2026.05.13.json"),
  NFF: () => require("./forms/newborn_followup_form_v2026.05.13.json"),
  CDF: () => require("./forms/child_death_form_v2026.05.13.json"),
  PSF: () => require("./forms/pregnancy_surveillance_form_v2026.07.19.json"),
};
