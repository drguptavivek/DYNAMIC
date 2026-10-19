import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Render the real page and exercise its event handlers, without a browser or server.
const bundled = await build({
  entryPoints: ['apps/admin/src/pages/FormLanguageManagementPage.tsx'],
  bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic',
  plugins: [{ name: 'page-dependencies', setup(builder) {
    builder.onResolve({ filter: /^(react|react\/jsx-runtime)$|\/lib\/api$|\.css$/ }, args => ({ path: args.path, namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents:
      args.path === 'react' ? 'export const {useState,useMemo,useEffect}=globalThis.languageHarness;' :
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
        forms: [{ form_code: 'HHQ', title: 'Baseline Household Questionnaire', version: 'current' }, { form_code: 'WQ', title: "Baseline Woman’s Questionnaire", version: 'current' }],
        sites: [{ site_id: 2, site_code: '2', site_name: 'Ballabhgarh' }],
        users: [{ user_id: 'manager', username: 'manager', role: 'site_data_manager', site_id: 2 }],
        languages: [{ code: 'hi', label: 'Hindi' }], permissions: [], can_manage_permissions: true,
      };
      assert.match(path, /^\/form-language-management\/forms\/(HHQ|WQ)\?site_id=2&language_code=hi/);
      return { elements, translations: structuredClone(savedTranslations), form_version: 'current', form_checksum: 'abcdef123456', can_edit: true };
    },
    async put(path, payload) {
      requests.push({ method: 'put', path, payload: structuredClone(payload) });
      if (path === '/form-language-management/permissions') {
        assert.equal(payload.permissions[0].form_code, 'WQ');
        return { permissions: payload.permissions };
      }
      assert.equal(path, '/form-language-management/forms/HHQ');
      assert.equal(payload.site_id, 2);
      assert.equal(payload.language_code, 'hi');
      savedTranslations = structuredClone(payload.translations);
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
  assert.equal(downloadName, 'HHQ-hi-translations.csv');
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
  assert.ok(requests.every(request => request.path.startsWith('/form-language-management')), 'Translation editing must not submit forms or change workflow');
} finally {
  globalThis.document = originalDocument; globalThis.window = originalWindow;
  URL.createObjectURL = originalCreateObjectURL; URL.revokeObjectURL = originalRevokeObjectURL;
  delete globalThis.languageHarness;
}
console.log('Form language management display codes, heading editing, and complete CSV roundtrip passed');
