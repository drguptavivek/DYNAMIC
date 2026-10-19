import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import formTranslation from "../../../shared/formTranslation.cjs";
import { createSurveyModel } from "../polyfills/surveyCoreNative.js";
import { prepareQuestionnaireSurveyJson } from "../modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import { attachWqValidation, WQ_TRANSFUSION_TIMING_FIELD as field, validateWqTransfusionTiming } from "../lib/womanSurveyBehaviors.js";
import { assertNativeSurveySupport, getNativeQuestionChoices, buildNativeSurveyPreview, getNativeRendererKind, getNativeQuestionValue, setNativeQuestionValue } from "../components/forms/nativeSurveyModel.js";
import { NATIVE_FORM_TEXT } from "../lib/nativeFormText.js";
const raw = JSON.parse(await readFile(new URL("../data/forms/baseline_woman_s_questionnaire_v2026.05.09.json", import.meta.url)));
const prepared = prepareQuestionnaireSurveyJson(raw);
const original = raw.pages.flatMap(page => page.elements).find(q => q.name === field);
const definition = prepared.pages.flatMap(page => page.elements).find(q => q.name === field);
assert.equal(definition.visibleIf, original.visibleIf);
assert.match(definition.title.default, /^9b[.]/);
assert.deepEqual(definition.choices.map(c=>[c.value,c.text.default]), original.choices.map(c=>[c.value,c.text.default]));
assert.equal(definition.type, "text");
assert.equal(original.type, "radiogroup", "Source questionnaire must remain unchanged");
const rows = formTranslation.flattenFormText(prepared);
assert.ok(rows.find(row => row.name === field).choices.some(choice => choice.value === "98" || choice.value === 98));
for (const key of ["transfusion_month", "transfusion_year", "transfusion_date_invalid", "transfusion_date_future"]) {
  assert.ok(rows.some(row => row.kind === "native" && row.title === NATIVE_FORM_TEXT.WQ[key]), `Admin/codebook missing ${key}`);
}
const model = createSurveyModel(prepared);
attachWqValidation(model);
model.setValue("wq_interview_date", "2026-10-19");
const question = model.getQuestionByName(field);
const ever = "wq_03_other_health_issues_have_you_ever_had_a_blood_transfusion";
model.setValue(ever, 2); assert.equal(question.isVisible, false);
model.setValue(ever, 1); assert.equal(question.isVisible, true);
assert.equal(getNativeRendererKind(question), "wq-transfusion-timing");
assert.deepEqual(assertNativeSurveySupport(model), []);
for (const value of [undefined, 98, "98", {month:"01",year:"2025"}]) {
  question.value = value;
  assert.equal(question.validate(), true, JSON.stringify(value));
}
for (const value of [{}, {month:"01"}, {month:"13",year:"2025"}, {month:"00",year:"2025"}, {month:"01",year:"0000"}, {month:"1",year:"25"}, {month:"01",year:"9999"}, 7]) {
  question.value = value;
  assert.equal(question.validate(), false, JSON.stringify(value));
}
assert.equal(validateWqTransfusionTiming({month:"10",year:"2026"}, new Date(2026,9,19)), null);
assert.equal(validateWqTransfusionTiming({month:"11",year:"2026"}, new Date(2026,9,19)), "transfusion_date_future");
question.value={month:"01",year:"2025"};
const restored=createSurveyModel(prepared);restored.data=JSON.parse(JSON.stringify(model.data));
assert.deepEqual(restored.getValue(field), question.value, "Draft restore must preserve both date parts");
assert.match(JSON.stringify(buildNativeSurveyPreview({ pages: [question.parent] })), /month: 01; year: 2025/);
question.value=98;assert.match(JSON.stringify(buildNativeSurveyPreview({ pages: [question.parent] })), /do not remember/);
for (const key of ["transfusion_month", "transfusion_year", "transfusion_date_invalid", "transfusion_date_future"]) {
  assert.equal(prepared.nativeText[key], NATIVE_FORM_TEXT.WQ[key]);
  model.nativeText[key] = { default: NATIVE_FORM_TEXT.WQ[key], hi: "HI " + NATIVE_FORM_TEXT.WQ[key] };
}
model.locale="hi";question.value={month:"13",year:"2025"};question.validate();
assert.match(question.errors[0].text, /^HI /);
const compiled = await build({ entryPoints:[fileURLToPath(new URL("../components/forms/renderers/WqTransfusionTimingRenderer.js", import.meta.url))], bundle:true,write:false,format:"cjs",platform:"node",jsx:"automatic",loader:{".js":"jsx"}, plugins:[{name:"native-dependencies",setup(builder){
  builder.onResolve({filter:/^(react|react\/jsx-runtime|react-native)$|\/nativeSurveyModel\.js$|\/QuestionFrame\.js$/},args=>({path:args.path,namespace:"mock"}));
  builder.onLoad({filter:/.*/,namespace:"mock"},args=>({contents:
    args.path==="react" ? "export default {};" :
    args.path==="react/jsx-runtime" ? "export const jsx=(type,props)=>({type,props});export const jsxs=jsx;" :
    args.path==="react-native" ? 'export const View="View",Text="Text",TextInput="TextInput",Pressable="Pressable";export const StyleSheet={create:x=>x};' :
    args.path.endsWith("/QuestionFrame.js") ? 'export const QuestionFrame="QuestionFrame",controlStyles={};' :
    'export const getNativeQuestionChoices=(...a)=>globalThis.timingHarness.choices(...a),getNativeQuestionValue=(...a)=>globalThis.timingHarness.value(...a),setNativeQuestionValue=(...a)=>globalThis.timingHarness.set(...a);'
  }));
}}]});
const module={exports:{}};new Function("module","exports",compiled.outputFiles[0].text)(module,module.exports);
let changes=0;
globalThis.timingHarness={choices:getNativeQuestionChoices,value:getNativeQuestionValue,set:setNativeQuestionValue};
function nodes(node) {return Array.isArray(node)?node.flatMap(nodes):node&&typeof node==="object"?[node,...nodes(node.props?.children)]:[];}
function render(){return nodes(module.exports.WqTransfusionTimingRenderer({question,locale:"hi",onChange:()=>changes++}));}
question.value="98";
let tree=render();let inputs=tree.filter(n=>n.type==="TextInput");
assert.equal(inputs.length,2,"Month/year must remain accessible when legacy98 is selected");
assert.match(inputs[0].props.accessibilityLabel,/^HI /);
assert.equal(tree.find(n=>n.type==="Pressable").props.accessibilityState.selected,true);
inputs[0].props.onChangeText("0x3");assert.deepEqual(question.value,{month:"03",year:""});
render().filter(n=>n.type==="TextInput")[1].props.onChangeText("2025");
assert.deepEqual(question.value,{month:"03",year:"2025"});
assert.equal(render().find(n=>n.type==="Pressable").props.accessibilityState.selected,false);
render().find(n=>n.type==="Pressable").props.onPress();assert.equal(question.value,98);
render().find(n=>n.type==="Pressable").props.onPress();assert.equal(question.value,undefined);
question.value={month:"03",year:"2025"};
render().filter(n=>n.type==="TextInput")[0].props.onChangeText("");
render().filter(n=>n.type==="TextInput")[1].props.onChangeText("");assert.equal(question.value,undefined);
question.readOnly=true;const before=changes;
tree=render();assert.ok(tree.filter(n=>n.type==="TextInput").every(n=>n.props.editable===false));
tree.filter(n=>n.type==="TextInput")[0].props.onChangeText("12");tree.find(n=>n.type==="Pressable").props.onPress();
assert.equal(changes,before);assert.equal(question.value,undefined);
delete globalThis.timingHarness;
console.log("Validated BWQ Q9b timing, visibility, validation, draft restore, translations, preview, and native interactions.");
