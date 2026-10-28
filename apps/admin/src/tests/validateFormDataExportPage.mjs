import assert from 'node:assert/strict';
import { build } from 'esbuild';

const requests = [], downloads = [], urls = [], revoked = [], slots = [];
const submitterRequests = [], cleanups = [];
let deferSubmitters = false;
const staff = [{ user_id: 'worker/1', username: 'worker.one', display_name: 'Same Name' }, { user_id: 'worker2', username: 'worker.two', display_name: 'Same Name' }];
let cursor = 0, dirty = true, effects = [], tree, catalogResolve, catalogReject, exportResolve, exportReject;
const catalog = [
  { form_code: 'HHQ', title: 'Household questionnaire', version: 'test' },
  { form_code: 'WQ', title: 'Woman questionnaire', version: 'test' },
  { form_code: 'PEF', title: 'Pregnancy enrollment', version: 'test' },
];
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
globalThis.exportHarness = {
  useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], value => {
      if (!Object.is(slots[index], value)) { slots[index] = value; dirty = true; }
    }];
  },
  useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
  useEffect(callback, deps) {
    const index = cursor++;
    if (!sameDeps(slots[index], deps)) { slots[index] = deps; effects.push(() => { cleanups[index]?.(); cleanups[index] = callback(); }); }
  },
  api: {
    get(path) {
      if (path.startsWith('/form-responses/export-submitters?')) {
        if (!deferSubmitters) return Promise.resolve(staff);
        return new Promise((resolve, reject) => submitterRequests.push({ path, resolve, reject }));
      }
      assert.equal(path, '/protocol/forms');
      return new Promise((resolve, reject) => { catalogResolve = resolve; catalogReject = reject; });
    },
    download(path) {
      requests.push(path);
      return new Promise((resolve, reject) => { exportResolve = resolve; exportReject = reject; });
    },
  },
};
const bundle = await build({
  entryPoints: [new URL('../pages/FormDataExportPage.tsx', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1')],
  bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic',
  plugins: [{ name: 'export-page-dependencies', setup(builder) {
    builder.onResolve({ filter: /^(react|react\/jsx-runtime)$|\/lib\/api$/ }, args => ({ path: args.path, namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents:
      args.path === 'react' ? 'export const useState=(...x)=>globalThis.exportHarness.useState(...x),useRef=(...x)=>globalThis.exportHarness.useRef(...x),useEffect=(...x)=>globalThis.exportHarness.useEffect(...x);' :
      args.path === 'react/jsx-runtime' ? 'export const jsx=(type,props,key)=>({type,props,key}); export const jsxs=jsx;' :
      'export const api=globalThis.exportHarness.api;'
    }));
  }}],
});
const compiled = { exports: {} };
const fakeUrl = { createObjectURL(blob) { urls.push(blob); return `blob:${urls.length}`; }, revokeObjectURL(url) { revoked.push(url); } };
const document = {
  body: { appendChild() {} },
  createElement(kind) {
    assert.equal(kind, 'a');
    return { href: '', download: '', click() { downloads.push({ filename: this.download, url: this.href }); }, remove() {} };
  },
};
new Function('module', 'exports', 'URL', 'document', bundle.outputFiles[0].text)(compiled, compiled.exports, fakeUrl, document);
const Page = compiled.exports.default;
function render() { cursor = 0; dirty = false; tree = Page(); const work = effects; effects = []; work.forEach(effect => effect()); }
async function settle() { for (let i = 0; i < 10; i++) { if (dirty) render(); await new Promise(resolve => setImmediate(resolve)); if (!dirty) return; } throw Error('Page failed to settle'); }
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(child => nodes(child))];
}
const text = node => [node?.props?.children].flat(Infinity).map(child => typeof child === 'object' ? text(child) : child ?? '').join('');
const buttons = () => nodes(tree).filter(node => node.type === 'button');
const selects = () => nodes(tree).filter(node => node.type === 'select');
const button = label => { const found = buttons().find(node => text(node) === label); assert(found, label); return found; };
const chooseForm = async code => { selects()[0].props.onChange({ target: { value: code } }); render(); await settle(); };
const chooseFormat = format => { selects()[1].props.onChange({ target: { value: format } }); render(); };
const choosePrivacy = privacy => { selects()[2].props.onChange({ target: { value: privacy } }); render(); };
const chooseSubmitter = id => { selects()[3].props.onChange({ target: { value: id } }); render(); };
async function finish(expectedPath, expectedFilename) {
  assert.equal(requests.at(-1), expectedPath);
  const blob = { csv: expectedFilename };
  exportResolve(blob); await settle();
  assert.equal(downloads.at(-1).filename, expectedFilename);
  assert.equal(urls.at(-1), blob);
  assert.equal(revoked.at(-1), downloads.at(-1).url);
  assert(buttons().every(node => !node.props.disabled));
}

render();
assert(selects().every(node => node.props.disabled));
assert.equal(selects()[1].props.value, 'coded', 'Raw codes remain the default');
assert.equal(buttons().length, 1); assert(buttons()[0].props.disabled);
catalogResolve({ forms: catalog }); await settle();
assert.deepEqual(buttons().map(text), ['BHQ', 'BHQ Members']);
assert.equal(text(nodes(tree).find(node => node.type === 'option' && node.props.value === 'HHQ')), 'BHQ - Household questionnaire');
const normalClick = button('BHQ').props.onClick;
normalClick(); normalClick(); render();
assert.equal(requests.length, 1, 'A stale/double-click handler cannot start another export');
assert(buttons().every(node => node.props.disabled)); assert(selects().every(node => node.props.disabled));
assert.equal(text(buttons()[0]), 'Preparing export...');
await finish('/form-responses/export?form_code=HHQ', 'bhq-form-responses.csv');

button('BHQ Members').props.onClick(); render();
assert.equal(text(buttons()[1]), 'Preparing members...');
await finish('/form-responses/export?form_code=HHQ&export_type=members', 'bhq-members.csv');
chooseFormat('labels');
button('BHQ Members').props.onClick(); render();
await finish('/form-responses/export?form_code=HHQ&export_type=members&value_format=labels', 'bhq-members-uncoded.csv');
button('BHQ').props.onClick(); render();
await finish('/form-responses/export?form_code=HHQ&value_format=labels', 'bhq-form-responses-uncoded.csv');

button('BHQ Members').props.onClick(); render();
const beforeFailure = downloads.length;
exportReject(new Error('Export denied')); await settle();
assert.equal(downloads.length, beforeFailure);
assert(text(tree).includes('Export denied')); assert(selects().every(node => !node.props.disabled));
await chooseForm('WQ');
assert.deepEqual(buttons().map(text), ['Export CSV'], 'Other questionnaires have no members button');
assert(!text(tree).includes('The BHQ member list contains names only'));
button('Export CSV').props.onClick(); render();
await finish('/form-responses/export?form_code=WQ&value_format=labels', 'wq-form-responses-uncoded.csv');
chooseFormat('coded');
button('Export CSV').props.onClick(); render();
await finish('/form-responses/export?form_code=WQ', 'wq-form-responses.csv');
await chooseForm('PEF');
button('Export CSV').props.onClick(); render();
await finish('/form-responses/export?form_code=PEF', 'pef-form-responses.csv');

await chooseForm('HHQ'); chooseFormat('labels');
button('BHQ Members').props.onClick(); render();
// Even if external state changes while the download is pending, keep its captured identity/format.
selects()[0].props.onChange({ target: { value: 'WQ' } });
selects()[1].props.onChange({ target: { value: 'coded' } }); render();
await finish('/form-responses/export?form_code=HHQ&export_type=members&value_format=labels', 'bhq-members-uncoded.csv');
assert.deepEqual(buttons().map(text), ['Export CSV']);

await chooseForm('HHQ'); chooseFormat('labels'); choosePrivacy('non_pis'); chooseSubmitter('worker/1');
assert.equal(selects()[2].props.value, 'non_pis');
assert.equal(text(nodes(tree).find(node => node.type === 'option' && node.props.value === 'worker/1')), 'Same Name (worker.one)');
button('BHQ Members').props.onClick(); render();
assert(selects().every(node => node.props.disabled));
await finish('/form-responses/export?form_code=HHQ&export_type=members&value_format=labels&privacy=non_pis&submitted_by_user_id=worker%2F1', 'bhq-members-non-pis-uncoded.csv');
button('BHQ').props.onClick(); render();
await finish('/form-responses/export?form_code=HHQ&value_format=labels&privacy=non_pis&submitted_by_user_id=worker%2F1', 'bhq-form-responses-non-pis-uncoded.csv');
await chooseForm('WQ');
assert.equal(selects()[3].props.value, '', 'Changing form deliberately resets the staff filter');
chooseFormat('coded');
button('Export CSV').props.onClick(); render();
await finish('/form-responses/export?form_code=WQ&privacy=non_pis', 'wq-form-responses-non-pis.csv');

// A delayed staff response from the previous form must never populate the current form.
deferSubmitters = true;
await chooseForm('HHQ');
assert(selects()[3].props.disabled); assert(button('BHQ').props.disabled);
await chooseForm('PEF');
submitterRequests.at(-2).resolve([{ user_id: 'outside', username: 'outside', display_name: 'Outside site' }]); await settle();
assert(!text(tree).includes('Outside site')); assert(button('Export CSV').props.disabled);
submitterRequests.at(-1).resolve(staff); await settle();
chooseSubmitter('outside');
assert(button('Export CSV').props.disabled, 'Unknown staff IDs cannot broaden an export');
const previousRequests = requests.length;
button('Export CSV').props.onClick();
assert.equal(requests.length, previousRequests);
chooseSubmitter('worker2'); choosePrivacy('pis');
button('Export CSV').props.onClick(); render();
await finish('/form-responses/export?form_code=PEF&submitted_by_user_id=worker2', 'pef-form-responses.csv');
await chooseForm('WQ');
submitterRequests.at(-1).reject(new Error('Staff unavailable')); await settle();
assert(text(tree).includes('Staff unavailable')); assert(selects()[3].props.disabled);
assert(!button('Export CSV').props.disabled, 'Explicit All users remains available after staff-list failure');
button('Export CSV').props.onClick(); render();
await finish('/form-responses/export?form_code=WQ', 'wq-form-responses.csv');

slots.length = 0; dirty = true; render();
catalogReject(new Error('Forms unavailable')); await settle();
assert(text(tree).includes('Forms unavailable')); assert(buttons()[0].props.disabled);
console.log('Form export UI supports BHQ/member downloads, coded/uncoded and privacy formats, scoped submitters, async races, captured filenames, concurrency and errors.');
