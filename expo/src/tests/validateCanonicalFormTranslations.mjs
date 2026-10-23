/** Real canonical questionnaires retain English and routing while every text row can be localized. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { getPreparedSurveyJson } from "../modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import { createSurveyModel } from "../polyfills/surveyCoreNative.js";
import { getNativeQuestionChoices, getNativeQuestionValue, setNativeQuestionValue, getNativeRendererKind, getNativeQuestionTitle } from "../components/forms/nativeSurveyModel.js";
import { getNativeFormText, formatNativeFormText, LMP_TIMING_FIELDS, LMP_TIMING_TEXT } from "../lib/nativeFormText.js";
import { GROUP_CONFIGS, GROUPED_CHOICE_TEXT, GROUPED_CHOICE_TEXT_KEYS, groupedChoiceTextKey } from "../lib/groupedChoiceText.js";
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
  const groupedRows = rows.filter(row => row.kind === "native" && row.name.slice("@native:".length) in GROUPED_CHOICE_TEXT);
  assert.equal(groupedRows.length, entry.form_code === "HHQ" ? 28 : 0, `${entry.form_code}: grouped labels and hints belong only to BHQ`);
  for (const [code, name] of Object.entries(LMP_TIMING_FIELDS)) {
    for (const key of Object.keys(LMP_TIMING_TEXT)) {
      assert.equal(rows.some(row => row.name === `@native:${name}_${key}`), entry.form_code === code,
        `${entry.form_code}: ${code} LMP labels stay scoped to their own form`);
    }
  }
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
    if (entry.form_code === "HHQ") {
      assert.equal(Object.keys(GROUP_CONFIGS).length, 5);
      assert.equal(Object.keys(GROUPED_CHOICE_TEXT).length, 28);
      assert.equal(new Set(Object.values(GROUPED_CHOICE_TEXT_KEYS).flat()).size, 28);
      for (const [name, groups] of Object.entries(GROUP_CONFIGS)) {
        const question = model.getQuestionByName(name);
        assert.equal(getNativeRendererKind(question), "grouped-coded-single-select", name);
        assert.ok(getNativeQuestionTitle(question, "hi").includes("हिंदी"), `${name}: translated group text preserves the translated question title`);
        for (const group of groups.filter(group => group.childValues)) {
          for (const property of ["label", "childHint"]) {
            const key = groupedChoiceTextKey(name, group.id, property);
            assert.ok(GROUPED_CHOICE_TEXT_KEYS[name].includes(key));
            assert.equal(rows.find(row => row.name === `@native:${key}`)?.title, group[property]);
            assert.equal(translatedText[`@native:${key}`]?.title, `हिंदी ${group[property]}`);
            assert.equal(getNativeFormText(question, key, group[property], "hi"), `हिंदी ${group[property]}`);
            assert.equal(getNativeFormText(question, key, group[property], "default"), group[property]);
            const saved = model.nativeText[key];
            model.nativeText[key] = { default: group[property], hi: "   " };
            assert.equal(getNativeFormText(question, key, group[property], "hi"), group[property]);
            model.nativeText[key] = saved;
          }
        }
      }
    }
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
for (const locale of ["default", "en"]) {
  assert.equal(getNativeFormText({ nativeText: { key: { default: "Saved English", en: "Saved English" } }, locale }, "key", "Built-in wording"), "Saved English");
  assert.equal(getNativeFormText({ nativeText: { key: { default: "template", en: " " } }, locale }, "key", "1 entry"), "1 entry", "blank English override keeps contextual fallback");
  assert.equal(formatNativeFormText({ nativeText: { key: { en: "Saved {number} entries" } }, locale }, "key", "Report {number}", { number: 3 }), "Saved 3 entries");
}
assert.equal(formatNativeFormText({ nativeText: { report: { default: "Report {number}", hi: "रिपोर्ट {number} {unknown}" } }, locale: "hi" }, "report", "Report {number}", { number: 3 }), "रिपोर्ट 3 {unknown}", "only supplied tokens are substituted");
console.log(`Validated ${catalog.length} canonical mobile questionnaires, headings, native labels, locale replay and unchanged form logic.`);

for (const entry of catalog) {
  const raw = JSON.parse(fs.readFileSync(new URL(entry.file_name, dataDir), "utf8"));
  const rows = formTranslation.flattenFormText(getPreparedSurveyJson(raw));
  const dictionary = Object.fromEntries(rows.map(row => [row.name, {
    ...(row.title ? { title: `Saved English ${row.title}` } : {}),
    ...(row.description ? { description: `Saved English ${row.description}` } : {}),
    choices: Object.fromEntries(row.choices.map(choice => [choice.value, `Saved English ${choice.text}`])),
  }]));
  const prepared = getPreparedSurveyJson({ ...raw, native_form_translations: { en: dictionary } });
  const extracted = formTranslation.extractFormTextTranslations(prepared, "en");
  for (const row of rows) {
    if (row.title) assert.ok(extracted[row.name]?.title?.includes("Saved English"), `${entry.form_code}: English ${row.name} survives native preparation`);
    for (const choice of row.choices) assert.equal(extracted[row.name]?.choices?.[choice.value], dictionary[row.name].choices[choice.value].trim());
  }
  const model = createSurveyModel(prepared);
  for (const locale of ["default", "en"]) {
    model.locale = locale;
    assert.ok(model.title.includes("Saved English"), `${entry.form_code}: English form heading at ${locale}`);
    assert.ok(model.pages[0].title.includes("Saved English"), `${entry.form_code}: English section heading at ${locale}`);
    for (const row of rows.filter(row => row.kind === "native")) {
      assert.ok(getNativeFormText(model, row.name.slice("@native:".length), "Built-in wording", locale).includes("Saved English"), `${entry.form_code}: English native label ${row.name} at ${locale}`);
    }
  }
  model.dispose();
}
console.log(`Validated saved English headings, choices and native labels across ${catalog.length} questionnaires for default/en locales.`);

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
for (const locale of ["hi", "default", "en"]) for (const nativeOnly of [false, true]) {
  const translations = nativeOnly ? {
    "@native:bwq_baby_birth_date": { title: "Translated date for {childName}" },
  } : {
    [localityField]: { title: "Translated locality {localityName}" },
    [dateField]: { title: "Translated date for {childName}" },
    [ageField]: { title: "Translated age {childName} {possessive}" },
    [deathAgeField]: { title: "Translated death {childName} {pronoun}" },
  };
  const model = createSurveyModel(getPreparedSurveyJson({ ...wqRaw, native_form_translations: { [locale === "default" ? "en" : locale]: translations } }));
  model.locale = locale;
  model.data = { wq_village_study_site: "Dayalpur / Ballabhgarh", wq_pregnancy_history: [{
    [nameField]: "Anu", [sexField]: 1, [outcomeField]: 1,
  }], wq_born_alive_child_followups: [{ [nameField]: "Anu", [sexField]: 1 }] };
  const panel = model.getQuestionByName("wq_pregnancy_history").panels[0];
  const childPanel = model.getQuestionByName("wq_born_alive_child_followups").panels[0];
  assert.match(getNativeQuestionTitle(panel.getQuestionByName(dateField), locale), /Translated date for Anu$/);
  if (!nativeOnly) {
    assert.match(getNativeQuestionTitle(model.getQuestionByName(localityField), locale), /Translated locality Dayalpur$/);
    assert.match(getNativeQuestionTitle(childPanel.getQuestionByName(ageField), locale), /Translated age Anu his$/);
    assert.match(getNativeQuestionTitle(childPanel.getQuestionByName(deathAgeField), locale), /Translated death Anu he$/);
    panel.getQuestionByName(sexField).value = undefined;
    childPanel.getQuestionByName(sexField).value = undefined;
    assert.match(getNativeQuestionTitle(childPanel.getQuestionByName(ageField), locale), /Translated age Anu their$/);
    assert.match(getNativeQuestionTitle(childPanel.getQuestionByName(deathAgeField), locale), /Translated death Anu they$/);
  }
  panel.getQuestionByName(sexField).value = undefined;
  panel.getQuestionByName(outcomeField).value = undefined;
  for (const field of [dateField, ageField, deathAgeField]) {
    assert.doesNotMatch(getNativeQuestionTitle((field === dateField ? panel : childPanel).getQuestionByName(field), "default"), /\{(?:localityName|childName|pronoun|possessive)\}/, "unanswered English branches keep their original fallback, without semantic template tokens");
  }
  model.dispose();
}
console.log("Validated ordinary-only translations, native-only variants, respondent context and unanswered English fallbacks.");

// Run the real grouped control against the canonical translated model.
const compiledGrouped = await build({
  entryPoints: ["GroupedCodedSingleSelectRenderer", "WqLmpTimingRenderer"].map(name => fileURLToPath(new URL(`../components/forms/renderers/${name}.js`, import.meta.url))),
  outdir: ".",
  bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", loader: { ".js": "jsx" },
  plugins: [{ name: "native-group-controls", setup(builder) {
    builder.onResolve({ filter: /^(react|react\/jsx-runtime|react-native|@expo\/vector-icons\/MaterialCommunityIcons)$|\/nativeSurveyModel\.js$|\/QuestionFrame\.js$/ }, args => ({ path: args.path, namespace: "mock" }));
    builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents:
      args.path === "react" ? 'export default {};export const useMemo=f=>f();export const useState=()=>[globalThis.groupedHarness.expanded,f=>{globalThis.groupedHarness.expanded=typeof f==="function"?f(globalThis.groupedHarness.expanded):f;}];' :
      args.path === "react/jsx-runtime" ? 'export const jsx=(type,props)=>({type,props});export const jsxs=jsx;' :
      args.path === "react-native" ? 'export const View="View",Text="Text",Pressable="Pressable",TextInput="TextInput";export const StyleSheet={create:x=>x};' :
      args.path.startsWith("@expo/") ? 'export default "Icon";' :
      args.path.endsWith("/QuestionFrame.js") ? 'export const QuestionFrame="QuestionFrame",controlStyles={};' :
      'export const getNativeQuestionChoices=(...a)=>globalThis.groupedHarness.choices(...a),getNativeQuestionValue=(...a)=>globalThis.groupedHarness.value(...a),setNativeQuestionValue=(...a)=>globalThis.groupedHarness.set(...a);'
    }));
  } }],
});
const groupedModule = { exports: {} };
new Function("module", "exports", compiledGrouped.outputFiles.find(file => file.path.endsWith("GroupedCodedSingleSelectRenderer.js")).text)(groupedModule, groupedModule.exports);
const hhqEntry = catalog.find(entry => entry.form_code === "HHQ");
const hhqRaw = JSON.parse(fs.readFileSync(new URL(hhqEntry.file_name, dataDir), "utf8"));
const groupTranslations = Object.fromEntries(Object.entries(GROUPED_CHOICE_TEXT).map(([key, title]) => [`@native:${key}`, { title: `हिंदी ${title}` }]));
const groupedModel = createSurveyModel(getPreparedSurveyJson({ ...hhqRaw, native_form_translations: { hi: groupTranslations } }));
let groupedChanges = 0;
globalThis.groupedHarness = { expanded: null, choices: getNativeQuestionChoices, value: getNativeQuestionValue, set: setNativeQuestionValue };
function groupedNodes(node) { return Array.isArray(node) ? node.flatMap(groupedNodes) : node && typeof node === "object" ? [node, ...groupedNodes(node.props?.children)] : []; }
function renderGrouped(question, locale = "hi") { return groupedNodes(groupedModule.exports.GroupedCodedSingleSelectRenderer({ question, locale, onChange: () => groupedChanges++ })); }
for (const [name, groups] of Object.entries(GROUP_CONFIGS)) {
  const question = groupedModel.getQuestionByName(name);
  for (const group of groups.filter(group => group.childValues)) {
    question.value = undefined;
    globalThis.groupedHarness.expanded = null;
    let tree = renderGrouped(question);
    const button = tree.find(node => node.type === "Pressable" && groupedNodes(node).some(child => child.type === "Text" && child.props.children === `हिंदी ${group.label}`));
    assert.ok(button, `${name}: translated group label reaches the actual control`);
    button.props.onPress();
    assert.equal(question.value, undefined, "Expanding a heading must not save a fake answer");
    tree = renderGrouped(question);
    assert.ok(tree.some(node => node.type === "Text" && node.props.children === `हिंदी ${group.childHint}`));
    const firstChild = tree.find(node => node.type === "Pressable" && groupedNodes(node).some(child => child.type === "Text" && String(child.props.children).startsWith(`${group.childValues[0]} `)));
    firstChild.props.onPress();
    assert.equal(question.value, group.childValues[0], "Only the original numeric child code is stored");
    globalThis.groupedHarness.expanded = null;
    assert.ok(renderGrouped(question).some(node => node.type === "Text" && node.props.children === `हिंदी ${group.childHint}`), "Saved child selection reopens its group");
    const englishTree = renderGrouped(question, "default");
    assert.ok(englishTree.some(node => node.type === "Text" && node.props.children === group.label));
    assert.ok(englishTree.some(node => node.type === "Text" && node.props.children === group.childHint));
    question.readOnly = true;
    const changesBefore = groupedChanges;
    const valueBefore = question.value;
    const lockedButtons = renderGrouped(question).filter(node => node.type === "Pressable");
    assert.ok(lockedButtons.every(node => node.props.disabled));
    for (const locked of lockedButtons) locked.props.onPress();
    assert.equal(question.value, valueBefore);
    assert.equal(groupedChanges, changesBefore);
    question.readOnly = false;
  }
}
groupedModel.dispose();
delete globalThis.groupedHarness;
console.log("Validated all 28 grouped BHQ labels/hints through inventory, locale roundtrip, native rendering, expansion, numeric answers and read-only controls.");

const lmpModule = { exports: {} };
new Function("module", "exports", compiledGrouped.outputFiles.find(file => file.path.endsWith("WqLmpTimingRenderer.js")).text)(lmpModule, lmpModule.exports);
globalThis.groupedHarness = { expanded: false, choices: getNativeQuestionChoices, value: getNativeQuestionValue, set: setNativeQuestionValue };
for (const [code, name] of Object.entries(LMP_TIMING_FIELDS)) {
  const entry = catalog.find(entry => entry.form_code === code);
  const raw = JSON.parse(fs.readFileSync(new URL(entry.file_name, dataDir), "utf8"));
  const translations = Object.fromEntries(Object.entries(LMP_TIMING_TEXT).map(([key, title]) => [`@native:${name}_${key}`, { title: `हिंदी ${title}` }]));
  const model = createSurveyModel(getPreparedSurveyJson({ ...raw, native_form_translations: { hi: translations } }));
  const question = model.getQuestionByName(name);
  assert.equal(getNativeRendererKind(question), "wq-lmp-timing");
  let changes = 0;
  const render = (locale = "hi") => groupedNodes(lmpModule.exports.WqLmpTimingRenderer({ question, locale, onChange: () => changes++ }));
  for (const key of Object.keys(LMP_TIMING_TEXT)) {
    assert.equal(getNativeFormText(question, `${name}_${key}`, LMP_TIMING_TEXT[key], "hi"), `हिंदी ${LMP_TIMING_TEXT[key]}`);
  }
  question.value = { mode: "date", day: "01", month: "02", year: "2026" };
  const originalDate = structuredClone(question.value);
  let tree = render();
  assert.ok(tree.some(node => node.type === "Text" && node.props.children === "हिंदी Date"));
  assert.ok(tree.some(node => node.type === "Text" && node.props.children === "हिंदी Relative time"));
  assert.deepEqual(tree.filter(node => node.type === "TextInput").map(node => node.props.placeholder), ["हिंदी DD", "हिंदी MM", "हिंदी YYYY"]);
  assert.deepEqual(question.value, originalDate, "Translating the control never changes the saved date");
  tree.filter(node => node.type === "TextInput")[0].props.onChangeText("a123");
  assert.equal(question.value.day, "12", "Date digit limits remain unchanged");
  question.value = { mode: "relative", unit: "weeks", value: "04" };
  globalThis.groupedHarness.expanded = true;
  tree = render();
  for (const label of ["Days Ago", "Weeks Ago", "Months Ago", "Years Ago"]) {
    assert.ok(tree.some(node => node.type === "Text" && node.props.children === `हिंदी ${label}`));
  }
  assert.equal(tree.find(node => node.type === "TextInput").props.accessibilityLabel, "हिंदी Two digit relative time");
  assert.deepEqual(question.value, { mode: "relative", unit: "weeks", value: "04" });
  const monthsButton = tree.find(node => node.type === "Pressable" && groupedNodes(node).some(child => child.type === "Text" && child.props.children === "हिंदी Months Ago"));
  monthsButton.props.onPress();
  assert.deepEqual(question.value, { mode: "relative", unit: "months", value: "04" }, "Translated options still save the original unit enum");
  render().find(node => node.type === "TextInput").props.onChangeText("x123");
  assert.equal(question.value.value, "12", "Relative time keeps its two-digit input limit");
  assert.ok(render("default").some(node => node.type === "Text" && node.props.children === "Months Ago"));
  const special = getNativeQuestionChoices(question, "hi")[0];
  if (special) {
    render().find(node => node.type === "Pressable" && groupedNodes(node).some(child => child.type === "Text" && child.props.children === special.text)).props.onPress();
    assert.equal(question.value, special.value, "Special coded answers remain unchanged");
  }
  question.readOnly = true;
  const before = changes;
  for (const button of render().filter(node => node.type === "Pressable")) button.props.onPress();
  assert.equal(changes, before, "Translated LMP controls preserve read-only behavior");
  model.dispose();
}
delete globalThis.groupedHarness;
console.log("Validated WQ/PEF/PSF LMP translations, all other form exclusions, native date/relative controls, coded answers and input limits.");
