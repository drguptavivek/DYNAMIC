import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { createSurveyModel } from "../polyfills/surveyCoreNative.js";
import { getPreparedSurveyJson } from "../modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import formTranslation from "../../../shared/formTranslation.cjs";
import { getNativeQuestionChoices, getNativeQuestionValue, setNativeQuestionValue } from "../components/forms/nativeSurveyModel.js";
import { NATIVE_QUESTION_TITLE_KEYS } from "../lib/nativeFormText.js";

const source = JSON.parse(fs.readFileSync(new URL(
  "../data/forms/baseline_woman_s_questionnaire_v2026.05.09.json", import.meta.url,
), "utf8"));
const days = "wq_04_husband_s_backgroun_during_the_last_one_month_on_how_many_days";
const drinks = "wq_04_husband_s_backgroun_we_count_one_drink_of_alcohol_as_one_can_o";
const respondentDays = "wq_03_other_health_issues_during_the_last_one_month_on_how_many_days";
const respondentDrinks = "wq_03_other_health_issues_we_count_one_drink_of_alcohol_as_one_can_o";
const marital = "wq_04_husband_s_backgroun_check_answer_to_marital_status_on_01_respo";
const alcohol = "wq_04_husband_s_backgroun_now_i_would_like_to_ask_you_some_questions_2";
const fields = source.pages.flatMap(page => page.elements);

function createModel(definition = source) {
  const model = createSurveyModel(getPreparedSurveyJson(definition));
  model.data = { [marital]: 1, [alcohol]: 1, [days]: "30", [drinks]: "05",
    wq_pregnancy_tracking_eligible: 1, wq_woman_available: 1, wq_consent_study: 1, wq_current_marital_status: 1,
    wq_03_other_health_issues_now_i_would_like_to_ask_you_some_questions_2: 1,
    [respondentDays]: "30", [respondentDrinks]: "05" };
  return model;
}

for (const [field, validValues, invalidValues] of [
  [respondentDays, [0, 95, "00", "01", "29", "30", "95"], ["31", "94", "96", "99", "1", "-1", "1.5", "abc"]],
  [respondentDrinks, [0, "00", "01", "04", "05"], ["06", "10", "95", "99", "5", "-1", "1.5", "abc"]],
  [days, ["00", "01", "29", "30", "95"], ["31", "94", "96", "99", "1", "-1", "1.5", "abc"]],
  [drinks, ["00", "01", "04", "05"], ["06", "10", "95", "99", "5", "-1", "1.5", "abc"]],
]) {
  const model = createModel();
  const question = model.getQuestionByName(field);
  if (field !== respondentDays) assert.equal(question.isVisible, true);
  assert.equal(question.jsonObj.maxLength, 2);
  for (const [values, expected] of [[validValues, true], [invalidValues, false]]) {
    for (const value of values) {
      model.setValue(field, value);
      assert.equal(question.validate(), expected, `${field}: ${value}`);
      assert.equal(model.getValue(field), value, "No silent clamping or rewriting");
      const restored = createModel();
      restored.data = structuredClone(model.data);
      assert.equal(restored.getQuestionByName(field).validate(), expected, "Restored values keep the limit");
    }
  }
  const original = fields.find(item => item.name === field);
  assert.deepEqual(question.choices.map(choice => String(choice.value)), original.choices.map(choice => String(choice.value)));
  assert.equal(question.validators[0].regex, original.validators[0].regex, "Prepared form retains definition validation");

  const rows = formTranslation.flattenFormText(getPreparedSurveyJson(source));
  const row = rows.find(item => item.title === original.validators[0].text);
  assert.ok(row, "Validation message is available for translation and codebook export/import");
  const localized = formTranslation.applyFormTextTranslations(getPreparedSurveyJson(source), "hi", {
    [row.name]: { title: `Translated ${field}` },
  });
  const translated = createModel(localized);
  translated.locale = "hi";
  translated.setValue(field, invalidValues[0]);
  assert.equal(translated.getQuestionByName(field).validate(), false);
  assert.ok(translated.getQuestionByName(field).errors.some(error => error.text === `Translated ${field}`));
}

const localizedSource = structuredClone(source);
for (const field of localizedSource.pages.flatMap(page => page.elements).filter(item => [days, drinks].includes(item.name))) {
  field.description.hi = "Saved Hindi help";
}
for (const field of createModel(localizedSource).getAllQuestions().filter(item => [days, drinks].includes(item.name))) {
  field.survey.locale = "hi";
  assert.equal(field.description, "Saved Hindi help", "Updated English hint retains other languages");
}
const prepared = createModel();
assert.match(prepared.getQuestionByName(days).description, /01 to 30/);
assert.match(prepared.getQuestionByName(drinks).description, /01 to 05/);
prepared.setValue(days, "00");
assert.equal(prepared.getQuestionByName(drinks).isVisible, false, "No drinks still skips Q14");
prepared.setValue(days, "95");
assert.equal(prepared.getQuestionByName(drinks).isVisible, true, "Every-day special code still asks Q14");

const compiled = await build({
  entryPoints: [fileURLToPath(new URL("../components/forms/renderers/SelectOneRenderer.js", import.meta.url))],
  bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", loader: { ".js": "jsx" },
  plugins: [{ name: "native-picker-fixture", setup(builder) {
    builder.onResolve({ filter: /^(react|react\/jsx-runtime|react-native)$|\/nativeSurveyModel\.js$|\/QuestionFrame\.js$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents:
      args.path === "react" ? 'export default {}; export const useCallback=f=>f,useEffect=()=>{},useMemo=f=>f(),useRef=v=>({current:v}),useState=v=>[v,()=>{}];' :
      args.path === "react/jsx-runtime" ? 'export const jsx=(type,props)=>({type,props}),jsxs=jsx;' :
      args.path === "react-native" ? 'export const View="View",Text="Text",TextInput="TextInput",TouchableOpacity="TouchableOpacity";export const StyleSheet={create:x=>x};' :
      args.path.endsWith("/QuestionFrame.js") ? 'export const QuestionFrame="QuestionFrame",controlStyles={};' :
      'export const getNativeQuestionChoices=(...a)=>globalThis.alcoholPicker.choices(...a),getNativeQuestionValue=(...a)=>globalThis.alcoholPicker.value(...a),setNativeQuestionValue=(...a)=>globalThis.alcoholPicker.set(...a);'
    }));
  } }],
});
const component = { exports: {} };
new Function("module", "exports", compiled.outputFiles[0].text)(component, component.exports);
globalThis.alcoholPicker = { choices: getNativeQuestionChoices, value: getNativeQuestionValue, set: setNativeQuestionValue };
const translatedDays = createModel({ ...source, native_form_translations: { hi: {
  "@native:wq_alcohol_days_entry": { title: "Translated Days" },
  "@native:wq_alcohol_drinks_entry": { title: "Translated Drinks" },
} } });
function nodes(node) { return Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === "object" ? [node, ...nodes(node.props?.children)] : []; }
for (const [name, unit, maximum, special] of [[respondentDays, "Days", 30, 95], [respondentDrinks, "Drinks", 5, 0]]) {
const question = translatedDays.getQuestionByName(name);
question.value = special;
const tree = nodes(component.exports.SelectOneRenderer({ question, locale: "hi" }));
assert.ok(NATIVE_QUESTION_TITLE_KEYS[name].includes(`wq_alcohol_${unit.toLowerCase()}_entry`));
assert.ok(tree.findIndex(node => node.type === "TextInput") < tree.findIndex(node => node.type === "TouchableOpacity"), `${unit} entry precedes existing coded options`);
assert.ok(tree.some(node => node.type === "Text" && node.props.children === `Translated ${unit}`));
const english = nodes(component.exports.SelectOneRenderer({ question, locale: "default" }));
assert.ok(english.some(node => node.type === "Text" && node.props.children === unit));
const input = tree.find(node => node.type === "TextInput");
assert.equal(input.props.editable, true, "Typed days can replace a selected special code");
const entered = String(maximum).padStart(2, "0");
input.props.onChangeText(entered);
assert.equal(question.value, entered);
assert.equal(question.validate(), true);
const invalid = String(maximum + 1).padStart(2, "0");
input.props.onChangeText(invalid);
assert.equal(question.value, invalid, "Renderer does not clamp an invalid number");
assert.equal(question.validate(), false);
}
delete globalThis.alcoholPicker;
console.log("BWQ alcohol limits passed: Q17 Days/Q18 Drinks first, 30-day/05-drink limits, special codes, restore and translation.");
