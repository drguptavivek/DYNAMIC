import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { NATIVE_FORM_TEXT_EXTRA } from '../lib/nativeFormTextExtra.js';
import { NATIVE_FORM_TEXT } from '../lib/nativeFormText.js';

const files = ['WqBornAliveChildFollowupsRenderer', 'WqPregnancyGapReviewRenderer', 'WqPregnancyHistoryConfirmationRenderer', 'WqPregnancyOutcomeReviewRenderer'];
const rendererPath = name => fileURLToPath(new URL(`../components/forms/renderers/${name}.js`, import.meta.url));
const source = (await Promise.all(files.map(name => readFile(rendererPath(name), 'utf8')))).join('\n');
const inventorySource = `${source}\n${await readFile(rendererPath('CalculateRenderer'), 'utf8')}`;
for (const key of Object.keys(NATIVE_FORM_TEXT_EXTRA.WQ)) assert.ok(inventorySource.includes(`"${key}"`), `Unused native text entry ${key}`);
for (const match of source.matchAll(/\b(?:t|f)\("([^"]+)", ("(?:[^"\\]|\\.)*")/g)) {
  assert.equal(NATIVE_FORM_TEXT.WQ[match[1]], JSON.parse(match[2]), `Native inventory must preserve the exact English fallback for ${match[1]}`);
}
const compiled = await Promise.all(files.map(name => build({
  entryPoints: [rendererPath(name)], bundle: true, write: false,
  format: 'cjs', platform: 'node', jsx: 'automatic', loader: { '.js': 'jsx' },
  plugins: [{ name: 'native-render-dependencies', setup(builder) {
    builder.onResolve({ filter: /^(react|react\/jsx-runtime|react-native|@expo\/vector-icons\/MaterialCommunityIcons)$|\/nativeSurveyModel\.js$|\/QuestionFrame\.js$/ }, args => ({ path: args.path, namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents:
      args.path === 'react' ? 'export default {}; export const useMemo=f=>f(); export const useEffect=()=>{}; export const useRef=value=>({current:value}); export const useState=value=>globalThis.reviewHarness.state(value);' :
      args.path === 'react/jsx-runtime' ? 'export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;' :
      args.path === 'react-native' ? 'export const View="View", Text="Text", ScrollView="ScrollView", Pressable="Pressable"; export const StyleSheet={create:x=>x}; export const Alert={alert:(...args)=>globalThis.reviewHarness.alerts.push(args)};' :
      args.path.endsWith('/QuestionFrame.js') ? 'export const QuestionFrame="QuestionFrame", controlStyles={};' :
      args.path.endsWith('/nativeSurveyModel.js') ? `
        export const WQ_FOLLOWUP_CHILD_INDEX_FIELD='child', WQ_FOLLOWUP_COMPLETED_FIELD='completed', WQ_FOLLOWUP_PREGNANCY_INDEX_FIELD='pregnancy', WQ_PREGNANCY_BABY_NAME_FIELD='baby';
        export const WQ_PREGNANCY_HISTORY_PANEL_FIELD='history', WQ_PREGNANCY_FOLLOW_UP_FIELD='followup';
        export const getNativeQuestionValue=q=>q?.value, isNativeInternalPanelField=()=>false;
        export const groupWqPregnancyHistoryPanels=panels=>panels.map(panel=>({groupIndex:0,rows:[{panel}]}));
        export const getWqPregnancyChildSummary=panel=>({name:'Child name',bornStatus:'Born Alive',sex:'Male',pregnancyLasts:'9 months',outcome:'Living',outcomeYear:'2020'});
        export const getWqPregnancyReviewLabel=index=>'Pregnancy '+(index+1), getWqPregnancyGapPrompt=()=> 'Gap prompt';
        export const setNativeQuestionValue=(question,value)=>{question.value=value;};` :
      'export default "Icon";'
    }));
  }}],
})));
const values = {
  completed: 1, pregnancy: 1, child: 1, baby: 'Child name',
  pregnancy_02_reproduction_is_name_still_alive: 1,
  pregnancy_02_reproduction_if_born_alive_and_still_living_if_18_i_1_b: '03',
  pregnancy_02_reproduction_if_born_alive_and_still_living_is_name_liv: 1,
  pregnancy_02_reproduction_if_born_alive_and_still_living_record_hous: '02',
};
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object') return [];
  return [node, ...nodes(node.props?.children)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (node == null || typeof node === 'boolean') return '';
  return typeof node === 'object' ? text(node.props?.children) : String(node);
}
const translated = Object.fromEntries(Object.entries(NATIVE_FORM_TEXT.WQ).map(([key, value]) => [key, { default: value, hi: `HI ${value}` }]));
for (let index = 0; index < files.length; index++) {
  for (const locale of ['default', 'hi']) {
    const state = [];
    globalThis.reviewHarness = { alerts: [], state(value) { const slot = state.push(value) - 1; return [value, next => { state[slot] = next; }]; } };
    const panel = { questions: [], getQuestionByName: name => ({ value: values[name] }) };
    const historyPage = {};
    let changes = 0, validations = 0;
    const survey = { locale, nativeText: translated, data: {}, getQuestionByName: () => ({ panels: [panel], panelCount: 1 }), getPageByName: () => historyPage, setValue(name, value) { this.data[name] = value; } };
    const question = { name: 'review', survey, panels: [panel], value: 1, validate() { validations++; } };
    const module = { exports: {} };
    new Function('module', 'exports', compiled[index].outputFiles[0].text)(module, module.exports);
    const tree = module.exports[files[index]]({ locale, question, onChange: () => { changes++; }, renderQuestion: () => null });
    const output = text(tree);
    const prefix = locale === 'hi' ? 'HI ' : '';
    assert.ok(output.includes(`${prefix}Pregnancy`), `${files[index]} pregnancy heading must follow selected language`);
    assert.ok(output.includes(`${prefix}${index === 0 || index === 3 ? 'Child' : 'Name of child'}`));
    if (index === 0) {
      assert.ok(output.includes(`${prefix}03 years`));
      assert.ok(output.includes(`${prefix}Yes / line 02`));
      const deleteButton = nodes(tree).find(node => node.type === 'Pressable' && text(node).includes(`${prefix}Delete`));
      deleteButton.props.onPress();
      assert.equal(globalThis.reviewHarness.alerts[0][0], `${prefix}Delete child details?`);
      assert.equal(globalThis.reviewHarness.alerts[0][1], `${prefix}Clear the saved Q24_i-Q28_i details for Child name?`);
      assert.equal(changes, 0, 'Opening delete confirmation must not clear child answers');
    }
    if (index === 2) {
      const buttons = nodes(tree).filter(node => node.type === 'Pressable');
      buttons.find(node => text(node).includes(`${prefix}No`)).props.onPress();
      assert.equal(survey.currentPage, historyPage, 'Translated No must retain return-to-history routing');
      assert.equal(survey.data.review, undefined, 'No stays transient');
      buttons.find(node => text(node).includes(`${prefix}Yes`)).props.onPress();
      assert.equal(question.value, 1);
      assert.equal(validations, 1);
      assert.equal(changes, 2);
    }
  }
}
delete globalThis.reviewHarness;
console.log('BWQ native review headings, child summaries, confirmations and unchanged answer routing passed');
