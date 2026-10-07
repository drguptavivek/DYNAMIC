/** Verifies the language-of-questionnaire answer is derived from the active locale on every form. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Model } from "survey-core";

import { prepareQuestionnaireSurveyJson } from "../modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import {
  HHQ_LANGUAGE_FIELD,
  WQ_LANGUAGE_FIELD,
  applyQuestionnaireLanguageFromLocale,
  findQuestionnaireLanguageFieldName,
} from "../lib/questionnaireLanguageField.js";
import {
  QUESTIONNAIRE_LANGUAGES,
  questionnaireLanguageCodeForLocale,
} from "../components/forms/questionnaireLanguages.js";
import { getDraftFormLocale } from "../lib/formLanguage.js";
import {
  getActiveQuestionnaireDraft,
  saveQuestionnaireDraft,
} from "../modules/questionnaires/questionnaireDraftRepository.js";

// Browser storage keeps this check isolated from the native database.
const draftStorage = new Map();
globalThis.window = { localStorage: {
  getItem: (key) => draftStorage.get(key) || null,
  setItem: (key, value) => draftStorage.set(key, value),
  removeItem: (key) => draftStorage.delete(key),
} };

const here = path.dirname(fileURLToPath(import.meta.url));
const formsDir = path.join(here, "..", "data", "forms");
const formFiles = fs.readdirSync(formsDir).filter((file) => file.endsWith(".json") && file !== "index.json");
const loadForm = (file) => JSON.parse(fs.readFileSync(path.join(formsDir, file), "utf8"));

assert.deepEqual(
  QUESTIONNAIRE_LANGUAGES.map((entry) => [entry.code, entry.questionnaireCode]),
  [["default", 7], ["hi", 1], ["kn", 2], ["mr", 3], ["ta", 4], ["te", 5]],
);
assert.equal(questionnaireLanguageCodeForLocale(undefined), 7);
assert.equal(questionnaireLanguageCodeForLocale("HI"), 1);
assert.equal(questionnaireLanguageCodeForLocale("ur"), null);

const expectedFieldByCode = { HHQ: HHQ_LANGUAGE_FIELD, WQ: WQ_LANGUAGE_FIELD };
const seen = {};

for (const file of formFiles) {
  const form = loadForm(file);
  const model = new Model(prepareQuestionnaireSurveyJson(form));
  for (const language of QUESTIONNAIRE_LANGUAGES) {
    const context = { formCode: form.form_code, formVersion: form.version, taskId: `language-${form.form_code}-${language.code}`, userId: "language-test" };
    await saveQuestionnaireDraft({ ...context, payload: {}, completionState: { locale: language.code } });
    const restored = await getActiveQuestionnaireDraft(context);
    assert.equal(getDraftFormLocale(restored, model, "te"), language.code, `${form.form_code} resume must preserve its declared locale, regardless of device preference`);
  }
  const fieldName = findQuestionnaireLanguageFieldName(model);
  seen[form.form_code] = fieldName;

  if (!fieldName) {
    // Forms without the question: a no-op, never throws.
    assert.equal(applyQuestionnaireLanguageFromLocale(model, "hi"), false);
    continue;
  }

  assert.equal(getDraftFormLocale({ json_payload: { [fieldName]: 4 } }, model, "hi"), "ta", `${form.form_code} legacy draft language is retained`);
  assert.equal(getDraftFormLocale({ completion_state: { locale: "kn" }, json_payload: { [fieldName]: 4 } }, model, "hi"), "kn", "declared draft locale takes precedence over old answer");

  const question = model.getQuestionByName(fieldName);
  assert.equal(question.choices.length, 7, `${form.form_code} language question has 7 choices`);

  assert.equal(applyQuestionnaireLanguageFromLocale(model, "default"), true);
  assert.equal(model.getValue(fieldName), 7);
  assert.equal(question.readOnly, true);

  assert.equal(applyQuestionnaireLanguageFromLocale(model, "kn"), true);
  assert.equal(model.getValue(fieldName), 2);
  // Same locale again is a no-op.
  assert.equal(applyQuestionnaireLanguageFromLocale(model, "kn"), false);

  // Unknown locale keeps the previous answer but still locks the question.
  assert.equal(applyQuestionnaireLanguageFromLocale(model, "ur"), false);
  assert.equal(model.getValue(fieldName), 2);
  assert.equal(question.readOnly, true);

  // A restored draft value is overridden by the active locale.
  model.setValue(fieldName, 4);
  applyQuestionnaireLanguageFromLocale(model, "hi");
  assert.equal(model.getValue(fieldName), 1);

  // Explicit field name still works.
  assert.equal(applyQuestionnaireLanguageFromLocale(model, "ta", fieldName), true);
  assert.equal(model.getValue(fieldName), 4);
}

for (const [code, expected] of Object.entries(expectedFieldByCode)) {
  assert.equal(seen[code], expected, `${code} language field detected`);
}
assert.ok(Object.keys(seen).length >= 12, "all bundled forms scanned");

// Detection by choice set, independent of field name (covers server forms).
const generic = new Model({
  pages: [{ name: "p", elements: [{
    type: "radiogroup",
    name: "some_other_language_field",
    title: "Language used",
    choices: [
      { value: 1, text: "Hindi" }, { value: 2, text: "Kannada" }, { value: 3, text: "Marathi" },
      { value: 4, text: "Tamil" }, { value: 5, text: "Telugu" }, { value: 6, text: "Urdu" },
      { value: 7, text: "English" },
    ],
  }] }],
});
assert.equal(findQuestionnaireLanguageFieldName(generic), "some_other_language_field");
assert.equal(applyQuestionnaireLanguageFromLocale(generic, "mr"), true);
assert.equal(generic.getValue("some_other_language_field"), 3);

assert.equal(applyQuestionnaireLanguageFromLocale(null, "hi"), false);

// Both interview hosts must gate inputs and expose no in-form locale control.
for (const relative of ["modules/households/BaselineHouseholdForm.js", "modules/questionnaires/QuestionnaireDashboard.js"]) {
  const source = fs.readFileSync(path.join(here, "..", relative), "utf8");
  assert.ok(source.includes('<FormLanguageSelection'), `${relative} requires language before interview`);
  assert.ok(!source.includes("RendererLanguageSwitcher"), `${relative} cannot switch during the interview`);
  assert.ok(source.includes('locale: formLocaleRef.current'), `${relative} records locked language with every draft save`);
}
assert.equal(getDraftFormLocale({ completion_state: { locale: "invalid" } }, generic, "mr"), "mr");
delete globalThis.window;
console.log("Questionnaire language selection, draft resume, and language field validation passed");
