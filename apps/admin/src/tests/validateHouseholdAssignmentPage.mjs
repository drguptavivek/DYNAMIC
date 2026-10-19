import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { parseHouseholdAssignmentRange, isHouseholdInAssignmentRange } from '../../../../shared/householdAssignmentRange.cjs';

// Exercise the real page handlers with enough rows to cross the page boundary.
const households = Array.from({ length: 1205 }, (_, index) => ({
  household_id: `2-02-0010-${String(index + 1).padStart(2, '0')}`,
  site_id: 2, locality_code: '02', household_number: String(index + 1),
})).concat([
  { household_id: '2-02-0011-15', site_id: 2, locality_code: '02', household_number: '15' },
  { household_id: '2-11-0010-15', site_id: 2, locality_code: '11', household_number: '15' },
]);
const requests = [], slots = [];
let cursor = 0, dirty = true, effects = [], tree, deferredAll;
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
globalThis.assignmentHarness = {
  useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], value => {
      const next = typeof value === 'function' ? value(slots[index]) : value;
      if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; }
    }];
  },
  useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
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
      if (path === '/masters/sites') return [
        { site_id: 2, site_name: 'Ballabhgarh' }, { site_id: 1, site_name: 'Bareilly' },
      ];
      if (path === '/masters/localities') return [
        { site_id: 2, locality_code: '02', locality_name: 'Locality 02' },
        { site_id: 2, locality_code: '11', locality_name: 'Dayalpur' },
      ];
      if (path.startsWith('/users?')) return [{ user_id: 'worker', username: 'worker', role: 'field_worker', site_id: 2 }];
      assert.ok(path.startsWith('/field-worker-household-assignments?'), path);
      const params = new URLSearchParams(path.split('?')[1]);
      if (deferredAll && !params.has('household_start') && !params.has('household_end')) {
        const deferred = deferredAll; deferredAll = undefined;
        await deferred.promise;
      }
      const range = parseHouseholdAssignmentRange(params.get('household_start') || '', params.get('household_end') || '', {
        siteId: Number(params.get('site_id')), localityCode: params.get('locality_code') || undefined,
      });
      return households.filter(row => isHouseholdInAssignmentRange(row, range));
    },
    async post(path, payload) { requests.push({ method: 'post', path, payload: structuredClone(payload) }); return {}; },
    async delete() { assert.fail('These checks must never clear actual assignments'); },
  },
};
globalThis.document = { addEventListener() {}, removeEventListener() {} };
const bundled = await build({
  entryPoints: ['apps/admin/src/pages/FieldWorkerHouseholdAssignmentPage.tsx'],
  bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic',
  plugins: [{ name: 'assignment-page-dependencies', setup(builder) {
    builder.onResolve({ filter: /^(react|react\/jsx-runtime)$|\/lib\/api$|\.css$/ }, args => ({ path: args.path, namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents:
      args.path === 'react' ? 'export const {useState,useRef,useMemo,useEffect}=globalThis.assignmentHarness;' :
      args.path === 'react/jsx-runtime' ? 'export const jsx=(type,props,key)=>({type,props,key}); export const jsxs=jsx; export const Fragment="fragment";' :
      args.path.endsWith('/api') ? 'export const api=globalThis.assignmentHarness.api;' :
      'export default new Proxy({}, {get:(_,key)=>key});'
    }));
  }}],
});
const module = { exports: {} };
new Function('module', 'exports', bundled.outputFiles[0].text)(module, module.exports);
async function settle() {
  for (let iteration = 0; iteration < 40; iteration++) {
    if (dirty) {
      dirty = false; cursor = 0; tree = module.exports.default();
      const pending = effects; effects = []; pending.forEach(callback => callback());
    }
    await new Promise(resolve => setImmediate(resolve));
    if (!dirty && !effects.length) return;
  }
  assert.fail('Assignment page did not settle');
}
function nodes(node = tree) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object') return [];
  return [node, ...nodes(node.props?.children ?? null)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('');
  if (node == null || typeof node === 'boolean') return '';
  return typeof node === 'object' ? text(node.props?.children) : String(node);
}
function find(predicate, description) { const result = nodes().find(predicate); assert.ok(result, description); return result; }
const labelled = label => find(node => node.props?.['aria-label'] === label, label);
const button = label => find(node => node.type === 'button' && text(node) === label, `Button ${label}`);
const input = placeholder => find(node => node.type === 'input' && node.props.placeholder === placeholder, placeholder);
const rows = () => nodes().filter(node => node.type === 'tr' && node.key != null);
const selectedRows = () => rows().filter(row => nodes(row).some(node => node.type === 'input' && node.props.type === 'checkbox' && node.props.checked));
async function change(node, value) { node.props.onChange({ target: { value } }); await settle(); }
async function check(label, checked) { await labelled(label).props.onChange({ target: { checked } }); await settle(); }
async function click(label) { await button(label).props.onClick(); await settle(); }
await settle();
await change(find(node => node.props?.id === 'assignment-site', 'site'), '2');
await change(labelled('Household range start'), '2-02-0010-10');
await change(labelled('Household range end'), '2-02-0010-20');
await click('View');
assert.equal(rows().length, 11);
assert.equal(rows()[0].key, '2-02-0010-10');
assert.equal(rows().at(-1).key, '2-02-0010-20');
await check('Select visible households', true);
assert.equal(selectedRows().length, 11);
await click('Assign all selected');
const workerOption = find(node => node.type === 'label' && text(node) === 'worker', 'bulk worker');
nodes(workerOption).find(node => node.type === 'input').props.onChange(); await settle();
const modal = find(node => node.props?.className === 'bulkModal', 'bulk modal');
await nodes(modal).find(node => node.type === 'button' && text(node) === 'Assign').props.onClick(); await settle();
assert.deepEqual(requests.find(request => request.method === 'post').payload.household_ids, rows().map(row => row.key));

await change(labelled('Household range start'), '');
await change(labelled('Household range end'), '');
await click('View');
assert.equal(rows().length, 1000);
await check('Select visible households', true);
assert.equal(selectedRows().length, 1000);
await click('Next');
assert.equal(rows().length, 207);
assert.equal(selectedRows().length, 0, 'Header must not select the next page');
await check('Select visible households', true);
await check('Select visible households', false);
await click('Previous');
assert.equal(selectedRows().length, 1000, 'Unchecking the next page must preserve this page selection');

await change(labelled('Household range start'), '10');
await change(labelled('Household range end'), '20');
await click('View');
assert.equal(rows().length, 13, 'Numeric ranges retain household-number semantics across structures');
assert.equal(selectedRows().length, 0, 'Changing filters clears stale selections');
await change(input('Search household'), '2-02-0010-10');
assert.equal(rows().length, 1);
await check('Select all households in selected site/locality', true);
const allRequest = requests.filter(request => request.path?.startsWith('/field-worker-household-assignments?')).at(-1);
assert.equal(new URLSearchParams(allRequest.path.split('?')[1]).get('household_start'), null);
assert.match(text(tree), /1207 selected/);
await check('Select all households in selected site/locality', false);
assert.equal(selectedRows().length, 0);

await change(find(node => node.props?.id === 'assignment-locality', 'locality'), '02');
await click('View');
await check('Select all households in selected site/locality', true);
const localityRequest = requests.filter(request => request.path?.startsWith('/field-worker-household-assignments?')).at(-1);
assert.equal(new URLSearchParams(localityRequest.path.split('?')[1]).get('locality_code'), '02');
assert.match(text(tree), /1206 selected/, 'All households must remain inside the selected locality');

await change(input('Search household'), '');
await change(labelled('Household range start'), '2-02-0010-20');
await change(labelled('Household range end'), '2-02-0010-10');
const requestCount = requests.length;
await click('View');
assert.equal(requests.length, requestCount, 'Reversed range must not fetch unbounded households');
assert.equal(rows().length, 0);
assert.ok(button('Assign all selected').props.disabled);

await change(labelled('Household range start'), '10');
await change(labelled('Household range end'), '20');
await click('View');
let releaseAll;
deferredAll = { promise: new Promise(resolve => { releaseAll = resolve; }) };
labelled('Select all households in selected site/locality').props.onChange({ target: { checked: true } });
await settle();
assert.ok(button('Assign all selected').props.disabled, 'Bulk assignment waits until the complete selection is loaded');
await change(find(node => node.props?.id === 'assignment-site', 'site'), '1');
releaseAll(); await settle();
assert.equal(rows().length, 0, 'Late old-scope replies must not restore households');
assert.ok(!text(tree).includes('1206 selected'), 'Late old-scope replies must not restore selected IDs');
console.log('Assignment full-ID/numeric ranges, page-only selection, scoped select-all, stale replies and exact assignment payload passed.');
