/** Real canonical questionnaires retain English and routing while every text row can be localized. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { getPreparedSurveyJson } from "../modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import { createSurveyModel } from "../polyfills/surveyCoreNative.js";
import { getNativeQuestionTitle } from "../components/forms/nativeSurveyModel.js";
import { getNativeFormText, formatNativeFormText } from "../lib/nativeFormText.js";
import formTranslation from "../../../shared/formTranslation.cjs";

const dataDir = new URL("../data/forms/", import.meta.url);
const catalog = JSON.parse(fs.readFileSync(new URL("index.json", dataDir), "utf8"));
function englishOnly(value) {
  if (Array.isArray(value)) return value.map(englishOnly);
  if (!value || typeof value !== "object") return value;
  if (typeof value.default === "string") return value.default;
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => item !== undefined && !["hi", "kn", "mr", "ta", "te"].includes(key) && !(key === "title" && (item === "" || item?.default === ""))).map(([key, item]) => [key, englishOnly(item)]));
}
for (const entry of catalog) {
  const raw = JSON.parse(fs.readFileSync(new URL(entry.file_name, dataDir), "utf8"));
  const sourceCopy = JSON.stringify(raw);
  const english = getPreparedSurveyJson(raw);
  assert.equal(getPreparedSurveyJson(raw), english, `${entry.form_code}: preparation stays cached`);
  const rows = formTranslation.flattenFormText(english);
  assert.ok(rows.some(row => row.kind === "form"), `${entry.form_code}: form heading is editable`);
  assert.ok(rows.some(row => row.kind === "page"), `${entry.form_code}: section headings are editable`);
  const translations = Object.fromEntries(rows.map(row => [row.name, {
    ...(row.title ? { title: `हिंदी ${row.title}` } : {}),
    ...(row.description ? { description: `हिंदी ${row.description}` } : {}),
    choices: Object.fromEntries(row.choices.map(choice => [choice.value, `हिंदी ${choice.text}`])),
  }]));
  const translatedRaw = { ...raw, native_form_translations: { hi: translations } };
  const localized = getPreparedSurveyJson(translatedRaw);
  assert.deepEqual(englishOnly(localized), englishOnly(english), `${entry.form_code}: English text, values, required fields, expressions and routing stay identical`);
  const translatedText = formTranslation.extractFormTextTranslations(localized, "hi");
  for (const row of rows.filter(row => row.title)) {
    assert.ok(translatedText[row.name]?.title?.includes("हिंदी"), `${entry.form_code}: ${row.name} reaches the mobile definition`);
  }
  assert.equal(JSON.stringify(raw), sourceCopy, `${entry.form_code}: bundled source is never mutated`);
  if (["HHQ", "WQ", "PEF"].includes(entry.form_code)) {
    const model = createSurveyModel(localized);
    model.locale = "hi";
    assert.ok(model.title.includes("हिंदी"));
    assert.ok(model.pages[0].title.includes("हिंदी"));
    const nativeRow = rows.find(row => row.kind === "native");
    assert.ok(nativeRow, `${entry.form_code}: native widget labels are in the same inventory`);
    assert.ok(getNativeFormText(model, nativeRow.name.slice("@native:".length), "fallback").includes("हिंदी"));
    if (entry.form_code === "PEF") {
      assert.ok(getNativeFormText(model, "how_many_reports_do_you_have", "How many reports do you have?").includes("हिंदी"));
      assert.ok(formatNativeFormText(model, "report_reportnumber", "Report {reportNumber}", { reportNumber: 2 }).includes("2"));
      assert.ok(getNativeFormText(model, "camera", "Camera").includes("हिंदी"));
    }
    if (entry.form_code === "WQ") {
      const dob = model.getQuestionByName("wq_01_respondent_s_backgr_in_what_month_and_year_were_you_born");
      assert.equal(dob.locTitle.getLocaleText("default"), "10. What is your date of birth?", "canonical admin DOB matches native English wording");
      assert.equal(getNativeQuestionTitle(dob, "default"), dob.locTitle.getLocaleText("default"));
      const savedNativeDob = model.nativeText.bwq_dob;
      const savedDobLocale = dob.locTitle.getLocaleText("hi");
      model.nativeText.bwq_dob = { default: "What is your date of birth?", hi: "   " };
      dob.locTitle.setLocaleText("hi", "");
      assert.equal(getNativeQuestionTitle(dob, "hi"), "10. What is your date of birth?", "blank locale strings preserve English runtime fallback");
      model.nativeText.bwq_dob = savedNativeDob;
      dob.locTitle.setLocaleText("hi", savedDobLocale);
      assert.ok(getNativeQuestionTitle(dob, "hi").includes("हिंदी"), "native English title overrides cannot discard translated DOB text");
    }
    model.dispose();
  }
}
assert.equal(getNativeFormText({ nativeText: { key: { default: "fallback", hi: "हिंदी" } }, locale: "hi" }, "key", "English"), "हिंदी");
assert.equal(getNativeFormText({ nativeText: { key: { default: "template", hi: "हिंदी" } }, locale: "default" }, "key", "1 entry"), "1 entry", "English caller fallback preserves contextual singular wording");
assert.equal(formatNativeFormText({ nativeText: { report: { default: "Report {number}", hi: "रिपोर्ट {number} {unknown}" } }, locale: "hi" }, "report", "Report {number}", { number: 3 }), "रिपोर्ट 3 {unknown}", "only supplied tokens are substituted");
console.log(`Validated ${catalog.length} canonical mobile questionnaires, headings, native labels, locale replay and unchanged form logic.`);

// Ordinary question translations and native context variants work independently.
const wqEntry = catalog.find(entry => entry.form_code === "WQ");
const wqRaw = JSON.parse(fs.readFileSync(new URL(wqEntry.file_name, dataDir), "utf8"));
const localityField = "wq_01_respondent_s_backgr_how_long_have_you_been_living_continuously";
const dateField = "pregnancy_02_reproduction_check_16_and_17_type_of_pregnancy_outcome";
const ageField = "pregnancy_02_reproduction_if_born_alive_and_still_living_if_18_i_1_b";
const deathAgeField = "pregnancy_02_reproduction_if_born_alive_and_now_dead_if_19_i_1_boy_h";
const nameField = "pregnancy_02_reproduction_what_name_was_given_to_the_baby";
const sexField = "pregnancy_02_reproduction_is_name_a_boy_or_a_girl";
const outcomeField = "pregnancy_02_reproduction_if_15_i_single_was_the_baby_born_alive_bor";
for (const nativeOnly of [false, true]) {
  const translations = nativeOnly ? {
    "@native:bwq_baby_birth_date": { title: "Translated date for {childName}" },
  } : {
    [localityField]: { title: "Translated locality {localityName}" },
    [dateField]: { title: "Translated date for {childName}" },
    [ageField]: { title: "Translated age {childName} {possessive}" },
    [deathAgeField]: { title: "Translated death {childName} {pronoun}" },
  };
  const model = createSurveyModel(getPreparedSurveyJson({ ...wqRaw, native_form_translations: { hi: translations } }));
  model.locale = "hi";
  model.data = { wq_village_study_site: "Dayalpur / Ballabhgarh", wq_pregnancy_history: [{
    [nameField]: "Anu", [sexField]: 1, [outcomeField]: 1,
  }], wq_born_alive_child_followups: [{ [nameField]: "Anu", [sexField]: 1 }] };
  const panel = model.getQuestionByName("wq_pregnancy_history").panels[0];
  const childPanel = model.getQuestionByName("wq_born_alive_child_followups").panels[0];
  assert.match(getNativeQuestionTitle(panel.getQuestionByName(dateField), "hi"), /Translated date for Anu$/);
  if (!nativeOnly) {
    assert.match(getNativeQuestionTitle(model.getQuestionByName(localityField), "hi"), /Translated locality Dayalpur$/);
    assert.match(getNativeQuestionTitle(childPanel.getQuestionByName(ageField), "hi"), /Translated age Anu his$/);
    assert.match(getNativeQuestionTitle(childPanel.getQuestionByName(deathAgeField), "hi"), /Translated death Anu he$/);
    panel.getQuestionByName(sexField).value = undefined;
    childPanel.getQuestionByName(sexField).value = undefined;
    assert.match(getNativeQuestionTitle(childPanel.getQuestionByName(ageField), "hi"), /Translated age Anu their$/);
    assert.match(getNativeQuestionTitle(childPanel.getQuestionByName(deathAgeField), "hi"), /Translated death Anu they$/);
  }
  panel.getQuestionByName(sexField).value = undefined;
  panel.getQuestionByName(outcomeField).value = undefined;
  for (const field of [dateField, ageField, deathAgeField]) {
    assert.doesNotMatch(getNativeQuestionTitle((field === dateField ? panel : childPanel).getQuestionByName(field), "default"), /\{(?:localityName|childName|pronoun|possessive)\}/, "unanswered English branches keep their original fallback, without semantic template tokens");
  }
  model.dispose();
}
console.log("Validated ordinary-only translations, native-only variants, respondent context and unanswered English fallbacks.");
