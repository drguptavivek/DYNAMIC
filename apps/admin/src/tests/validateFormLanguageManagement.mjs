import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getPreparedSurveyJson } from '../../../../expo/src/modules/questionnaires/questionnaireSurveyJsonTransforms.js';
import { flattenFormText } from '../../../../shared/formTranslation.cjs';

// Render the real page and exercise its event handlers, without a browser or server.
const bundled = await build({
  entryPoints: ['apps/admin/src/pages/FormLanguageManagementPage.tsx'],
  bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic',
  plugins: [{ name: 'page-dependencies', setup(builder) {
    builder.onResolve({ filter: /^(react|react\/jsx-runtime)$|\/lib\/api$|\.css$/ }, args => ({ path: args.path, namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents:
      args.path === 'react' ? 'export const {useState,useRef,useMemo,useEffect}=globalThis.languageHarness;' :
      args.path === 'react/jsx-runtime' ? 'export const jsx=(type,props,key)=>({type,props,key}); export const jsxs=jsx; export const Fragment="fragment";' :
      args.path.endsWith('/api') ? 'export const api=globalThis.languageHarness.api;' :
      'export default {};'
    }));
  }}],
});

const elements = [
  { name: '@form', kind: 'form', title: 'Baseline Household Questionnaire' },
  { name: '@page/identification', kind: 'page', title: 'Identification' },
  { name: '@text/instructions', kind: 'text', title: '<p>Read all instructions</p>' },
  { name: '@native/lookup', kind: 'native', title: 'Find HDSS person' },
  { name: 'hhq_site_id', type: 'radiogroup', title: 'What is the site of study?', description: 'Choose one site', choices: [{ value: '01', text: 'Bareilly' }, { value: '2', text: 'Ballabhgarh' }] },
].map(element => ({ description: '', choices: [], ...element }));
let savedTranslations = { hhq_site_id: { title: 'Existing question', description: 'Existing help', choices: { '01': 'Existing option' } } };
const formIndex = JSON.parse(readFileSync(new URL('../../../../expo/src/data/forms/index.json', import.meta.url), 'utf8'));
const canonicalForms = Object.fromEntries(formIndex.map(form => {
  const raw = JSON.parse(readFileSync(new URL(`../../../../expo/src/data/forms/${form.file_name}`, import.meta.url), 'utf8'));
  const prepared = getPreparedSurveyJson(raw);
  return [form.form_code, { form_code: form.form_code, form_version: raw.version, form_checksum: createHash('sha256').update(JSON.stringify(prepared)).digest('hex'), elements: flattenFormText(prepared), can_edit: true }];
}));
const canonicalSaved = {}, pendingLoads = new Map();
let canonicalMode = false;
const requests = [];
const slots = [];
let cursor = 0, dirty = true, effects = [], tree;
const sameDeps = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
globalThis.languageHarness = {
  useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], value => {
      const next = typeof value === 'function' ? value(slots[index]) : value;
      if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; }
    }];
  },
  useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
  useMemo(callback, deps) {
    const index = cursor++;
    if (!sameDeps(slots[index]?.deps, deps)) slots[index] = { deps, value: callback() };
    return slots[index].value;
  },
  useEffect(callback, deps) {
    const index = cursor++;
    if (!sameDeps(slots[index], deps)) { slots[index] = deps; effects.push(callback); }
  },
  api: {
    async get(path) {
      requests.push({ method: 'get', path });
      if (path === '/form-language-management') return {
        forms: formIndex,
        sites: [{ site_id: 2, site_code: '2', site_name: 'Ballabhgarh' }],
        users: [{ user_id: 'manager', username: 'manager', role: 'site_data_manager', site_id: 2 }],
        languages: [{ code: 'hi', label: 'Hindi' }], permissions: [], can_manage_permissions: true,
      };
      const code = path.match(/^\/form-language-management\/forms\/([A-Z]+)\?site_id=2&language_code=hi/)?.[1];
      assert.ok(code && canonicalForms[code], path);
      const result = canonicalMode ? { ...canonicalForms[code], translations: structuredClone(canonicalSaved[code] || {}) }
        : { form_code: code, elements, translations: structuredClone(savedTranslations), form_version: 'current', form_checksum: 'abcdef123456', can_edit: true };
      if (pendingLoads.has(code)) { const gate = pendingLoads.get(code); pendingLoads.delete(code); await gate.promise; }
      return result;
    },
    async put(path, payload) {
      requests.push({ method: 'put', path, payload: structuredClone(payload) });
      if (path === '/form-language-management/permissions') {
        assert.equal(payload.permissions[0].form_code, 'WQ');
        return { permissions: payload.permissions };
      }
      const code = path.split('/').at(-1);
      assert.ok(canonicalForms[code], path);
      if (!canonicalMode) assert.equal(code, 'HHQ');
      assert.equal(payload.site_id, 2);
      assert.equal(payload.language_code, 'hi');
      if (canonicalMode) canonicalSaved[code] = structuredClone(payload.translations);
      else savedTranslations = structuredClone(payload.translations);
      return {};
    },
  },
};
const module = { exports: {} };
new Function('module', 'exports', bundled.outputFiles[0].text)(module, module.exports);
async function settle() {
  for (let iteration = 0; iteration < 30; iteration++) {
    if (dirty) {
      dirty = false; cursor = 0;
      tree = module.exports.default();
      const pending = effects; effects = [];
      pending.forEach(callback => callback());
    }
    await new Promise(resolve => setImmediate(resolve));
    if (!dirty && !effects.length) return;
  }
  assert.fail('Page did not settle');
}
function nodes(node = tree) {
  if (Array.isArray(node)) return node.flatMap(child => nodes(child));
  if (!node || typeof node !== 'object') return [];
  return [node, ...nodes(node.props?.children ?? null)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('');
  if (node == null || typeof node === 'boolean') return '';
  return typeof node === 'object' ? text(node.props?.children) : String(node);
}
const button = (label, root = tree) => {
  const result = nodes(root).find(node => node.type === 'button' && text(node) === label);
  assert.ok(result, `Missing button ${label}`);
  return result;
};
const article = name => {
  const result = nodes().find(node => node.type === 'article' && node.key === name);
  assert.ok(result, `Missing translatable entry ${name}`);
  return result;
};
function csvRows(text) {
  const rows = []; let offset = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (offset < text.length) {
    const row = [];
    while (true) {
      let cell = '';
      if (text[offset] === '"') {
        offset++;
        while (offset < text.length) {
          if (text[offset] !== '"') { cell += text[offset++]; continue; }
          offset++;
          if (text[offset] !== '"') break;
          cell += '"'; offset++;
        }
      } else {
        while (offset < text.length && !',\r\n'.includes(text[offset])) cell += text[offset++];
      }
      row.push(cell);
      if (text[offset] !== ',') break;
      offset++;
    }
    if (text[offset] === '\r') offset++;
    if (text[offset] === '\n') offset++;
    rows.push(row);
  }
  return rows;
}
const encodeCsv = rows => rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
async function importText(textOrPromise) {
  const input = nodes().find(node => node.type === 'input' && node.props.type === 'file');
  input.props.onChange({ target: { files: [{ text: async () => textOrPromise }] }, currentTarget: { value: 'codebook.csv' } });
  await settle();
}
async function selectForm(code) {
  const select = nodes().find(node => node.type === 'select' && nodes(node).some(option => option.type === 'option' && option.props.value === 'HHQ'));
  select.props.onChange({ target: { value: code } }); await settle();
}
function deferredLoad(code) {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  pendingLoads.set(code, { promise });
  return resolve;
}
await settle();
const formSelectors = nodes().filter(node => node.type === 'select' && nodes(node).some(option => option.type === 'option' && option.props.value === 'HHQ'));
assert.equal(formSelectors.length, 2, 'Main and permission form selectors must both use mobile display codes');
for (const select of formSelectors) {
  const options = nodes(select).filter(node => node.type === 'option');
  assert.match(text(options.find(node => node.props.value === 'HHQ')), /^BHQ(?: -|$)/);
  assert.match(text(options.find(node => node.props.value === 'WQ')), /^BWQ(?: -|$)/);
  assert.equal(select.props.value, 'HHQ', 'Display names must not change internal form codes');
}
formSelectors[0].props.onChange({ target: { value: 'WQ' } });
await settle();
assert.ok(requests.some(request => request.path.startsWith('/form-language-management/forms/WQ?')));
button('Permission ON').props.onClick();
await settle();
assert.ok(requests.some(request => request.path.endsWith('/permissions') && request.payload.permissions[0].form_code === 'WQ'));
nodes().find(node => node.type === 'select' && node.props.value === 'WQ').props.onChange({ target: { value: 'HHQ' } });
await settle();

for (const element of elements.slice(0, 4)) {
  assert.ok(text(article(element.name)).includes(element.title), `Missing visible heading/text ${element.name}`);
  button('Edit', article(element.name)).props.onClick();
  await settle();
  const input = nodes(article(element.name)).find(node => node.type === 'textarea' && node.props.placeholder === 'Translated text');
  assert.ok(input, `Entry ${element.name} must be editable`);
  input.props.onChange({ target: { value: `Translated ${element.name}` } });
  await settle();
  button('Save', article(element.name)).props.onClick();
  await settle();
  assert.equal(savedTranslations[element.name].title, `Translated ${element.name}`);
}
assert.equal(savedTranslations.hhq_site_id.description, 'Existing help');
assert.deepEqual(savedTranslations.hhq_site_id.choices, { '01': 'Existing option' });

let downloadBlob, downloadName;
const originalDocument = globalThis.document, originalWindow = globalThis.window;
const originalCreateObjectURL = URL.createObjectURL, originalRevokeObjectURL = URL.revokeObjectURL;
globalThis.document = { createElement: () => ({ click() { downloadName = this.download; } }), body: { appendChild() {}, removeChild() {} } };
globalThis.window = { confirm: () => true };
URL.createObjectURL = blob => { downloadBlob = blob; return 'blob:test'; };
URL.revokeObjectURL = () => {};
try {
  button('Export CSV').props.onClick();
  assert.equal(downloadName, 'BHQ-hi-translations.csv');
  const csv = (await downloadBlob.text()).replace(/^\uFEFF/, '');
  const lines = csv.split('\r\n').map(line => line.split(','));
  assert.equal(lines.length, 9, 'Export must contain all four non-question entries, question, help and two options');
  assert.deepEqual(lines.slice(1).map(row => [row[2], row[3], row[4]]), [
    ['@form', 'question', ''], ['@page/identification', 'question', ''],
    ['@text/instructions', 'question', ''], ['@native/lookup', 'question', ''],
    ['hhq_site_id', 'question', ''], ['hhq_site_id', 'help', ''],
    ['hhq_site_id', 'option', '01'], ['hhq_site_id', 'option', '2'],
  ]);
  assert.ok(lines.slice(1).every(row => row[1] === 'HHQ'), 'CSV keeps internal HHQ form code');
  lines.slice(1).forEach((row, index) => { row[8] = `CSV translation ${index}`; });
  const file = { text: async () => lines.map(row => row.join(',')).join('\r\n') };
  const input = nodes().find(node => node.type === 'input' && node.props.type === 'file');
  const currentTarget = { value: 'test.csv' };
  input.props.onChange({ target: { files: [file] }, currentTarget });
  assert.equal(currentTarget.value, '', 'CSV input can accept the same file again');
  await settle();
  assert.match(text(tree), /8 matched, 0 ignored/);
  button('Add imported translations').props.onClick();
  await settle();
  elements.slice(0, 4).forEach((element, index) => assert.equal(savedTranslations[element.name].title, `CSV translation ${index}`));
  assert.deepEqual(savedTranslations.hhq_site_id, {
    title: 'CSV translation 4', description: 'CSV translation 5', choices: { '01': 'CSV translation 6', '2': 'CSV translation 7' },
  });

  canonicalMode = true;
  let lastRows;
  for (const form of formIndex) {
    if (nodes().find(node => node.type === 'select' && node.props.value === form.form_code)) {
      button('Refresh latest').props.onClick(); await settle();
    } else await selectForm(form.form_code);
    assert.equal(button('Export CSV').props.disabled, false);
    button('Export CSV').props.onClick();
    const bytes = new Uint8Array(await downloadBlob.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'Excel export retains UTF-8 BOM');
    const rows = csvRows(await downloadBlob.text());
    assert.deepEqual(rows[0].slice(0, 9), ['order', 'form_code', 'variable_name', 'row_type', 'option_value', 'default_language', 'default_text', 'target_language', 'translated_text']);
    assert.deepEqual(rows[0].slice(9), ['form_display_code', 'form_version', 'form_checksum']);
    const definition = canonicalForms[form.form_code];
    const expected = definition.elements.flatMap(element => [
      [element.name, 'question', '', element.title || element.name],
      ...(element.description ? [[element.name, 'help', '', element.description]] : []),
      ...element.choices.map(choice => [element.name, 'option', choice.value, choice.text || choice.value]),
    ]);
    assert.deepEqual(rows.slice(1).map(row => [row[2], row[3], row[4], row[6]]), expected, `${form.form_code}: every current heading, field, help text, choice and popup exports in order`);
    assert.ok(rows.some(row => row[2] === '@native:popup_ok'));
    const display = { HHQ: 'BHQ', WQ: 'BWQ' }[form.form_code] || form.form_code;
    assert.equal(downloadName, `${display}-hi-translations.csv`);
    const expectedTranslations = {};
    rows.slice(1).forEach((row, index) => {
      assert.equal(row[1], form.form_code);
      assert.deepEqual(row.slice(9), [display, definition.form_version, definition.form_checksum]);
      row[8] = `परीक्षण ${index}, "quoted"\nsecond line`;
      const entry = expectedTranslations[row[2]] ??= {};
      if (row[3] === 'option') (entry.choices ??= {})[row[4]] = row[8];
      else entry[row[3] === 'help' ? 'description' : 'title'] = row[8];
    });
    await importText(encodeCsv(rows));
    assert.match(text(tree), new RegExp(`${rows.length - 1} matched, 0 ignored`));
    button('Add imported translations').props.onClick(); await settle();
    assert.deepEqual(canonicalSaved[form.form_code], expectedTranslations, `${form.form_code}: Unicode, quotes, newlines and exact option values survive the complete export/import/save cycle`);
    lastRows = rows;
  }
  const putCount = () => requests.filter(request => request.method === 'put').length;
  const beforeBadImports = putCount();
  for (const [column, wrongValue, error] of [
    [1, 'HHQ', /different form/], [9, 'BHQ', /different form/],
    [7, 'Tamil', /different target language/], [11, 'old-definition-checksum', /older questionnaire definition/],
  ]) {
    const wrong = structuredClone(lastRows); wrong.at(-1)[column] = wrongValue;
    await importText(encodeCsv(wrong));
    assert.match(text(tree), error);
    assert.ok(!nodes().some(node => node.type === 'button' && text(node) === 'Add imported translations'));
  }
  for (const malformed of [
    'variable_name,row_type,translated_text\n"unterminated,question,text',
    'variable_name,row_type,translated_text\nquestion_1,question,bad"quote',
    'variable_name,row_type,translated_text,translated_text\nunknown,question,a,b',
  ]) {
    await importText(malformed);
    assert.match(text(tree), /quote|duplicate/i);
  }
  assert.equal(putCount(), beforeBadImports, 'Rejected files never persist any translations');
  const variable = canonicalForms.PSF.elements[0].name;
  await importText(encodeCsv([['variable_name', 'row_type', 'translated_text'], [variable, 'question', 'Legacy translation']]));
  assert.match(text(tree), /1 matched, 0 ignored/, 'Legacy CSV files remain importable');
  button('Clear preview').props.onClick(); await settle();

  const releaseHhq = deferredLoad('HHQ');
  await selectForm('HHQ');
  assert.ok(button('Export CSV').props.disabled);
  await selectForm('WQ');
  assert.equal(button('Export CSV').props.disabled, false);
  releaseHhq(); await settle();
  button('Export CSV').props.onClick();
  assert.equal(downloadName, 'BWQ-hi-translations.csv');
  assert.ok(csvRows(await downloadBlob.text()).slice(1).every(row => row[11] === canonicalForms.WQ.form_checksum), 'Late previous-form response cannot relabel an old codebook');

  const releaseOlder = deferredLoad('HHQ'); await selectForm('HHQ');
  const releaseNewer = deferredLoad('WQ'); await selectForm('WQ');
  releaseOlder(); await settle();
  assert.ok(button('Export CSV').props.disabled, 'Old request completion must not enable export while the selected form is still loading');
  releaseNewer(); await settle();
  let finishFile;
  const slowFile = new Promise(resolve => { finishFile = resolve; });
  await importText(slowFile);
  await selectForm('PEF');
  finishFile(encodeCsv(lastRows)); await settle();
  assert.ok(!nodes().some(node => node.type === 'button' && text(node) === 'Add imported translations'), 'Late file read must not attach another form’s preview to the selected form');
  assert.ok(requests.every(request => request.path.startsWith('/form-language-management')), 'Translation editing must not submit forms or change workflow');
} finally {
  globalThis.document = originalDocument; globalThis.window = originalWindow;
  URL.createObjectURL = originalCreateObjectURL; URL.revokeObjectURL = originalRevokeObjectURL;
  delete globalThis.languageHarness;
}
console.log('All 12 current codebooks export/import/save completely; scope, stale definitions, malformed CSV and async race guards passed.');
