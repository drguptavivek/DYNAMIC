import assert from "node:assert/strict";
import form from "../data/forms/pregnancy_enrollment_form_v2026.08.25.json" with { type: "json" };

const coded = form.pages[0].elements.filter((element) => element.sourceCode);
assert.equal(form.form_code, "PEF");
assert.equal(form.version, "25 AUGUST 2026");
assert.deepEqual(coded.map((element) => element.sourceCode), [
  "1", "2", "2A", "3", "3B", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47",
]);
assert.deepEqual(form.pages[0].elements.find((element) => element.sourceCode === "1").choices.map((item) => item.value), [1, 2, 3, 4]);
assert.equal(form.pages[0].elements.find((element) => element.sourceCode === "7").visibleIf, "{pef_pregnancy_confirmed_upt} = 2");
assert.match(form.pages[0].elements.find((element) => element.sourceCode === "41").visibleIf, /pef_additional_symptoms/);
console.log("validateUpdatedPefForm.mjs: all assertions passed");
