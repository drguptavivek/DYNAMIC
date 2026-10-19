import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Run the actual page with canonical API records; no database or server writes.
const records = [
  { pregnancy_id: 'pregnancy-1', member_name: 'Example Woman', household_id: '2-02-0010-18', locality_code: '02', lmp_date: '2026-01-01', edd_date: '2026-10-08', gestational_age_at_enrollment: 14, enrollment_date: '2026-04-09' },
  { pregnancy_id: 'pregnancy-2', member_name: null, household_id: '1-01-0118-19', locality_code: '01', lmp_date: null, edd_date: null, gestational_age_at_enrollment: null, enrollment_date: null },
];
const slots = [], requests = [];
let cursor = 0, dirty = true, effects = [], tree, nextResponse;
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
globalThis.pregnancyHarness = {
  useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], value => { slots[index] = value; dirty = true; }];
  },
  useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
  useCallback(callback, deps) {
    const index = cursor++;
    if (!sameDeps(slots[index]?.deps, deps)) slots[index] = { deps, callback };
    return slots[index].callback;
  },
  useEffect(callback, deps) {
    const index = cursor++;
    if (!sameDeps(slots[index]?.deps, deps)) {
      const previous = slots[index];
      slots[index] = { deps };
      effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = callback(); });
    }
  },
  api: { async getPage(path) {
    requests.push(path);
    if (nextResponse) { const response = nextResponse; nextResponse = undefined; return response(); }
    return { data: records, meta: { total: 2, page: 1, per_page: 20 } };
  } },
};
const bundled = await build({
  entryPoints: ['apps/admin/src/pages/PregnantWomenPage.tsx'], bundle: true, write: false,
  format: 'cjs', platform: 'node', jsx: 'automatic',
  plugins: [{ name: 'pregnancy-page-dependencies', setup(builder) {
    builder.onResolve({ filter: /^(react|react\/jsx-runtime)$|\/lib\/api$|\.css$/ }, args => ({ path: args.path, namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents:
      args.path === 'react' ? 'export const {useState,useRef,useCallback,useEffect}=globalThis.pregnancyHarness;' :
      args.path === 'react/jsx-runtime' ? 'export const jsx=(type,props,key)=>({type,props,key}); export const jsxs=jsx;' :
      args.path.endsWith('/api') ? 'export const api=globalThis.pregnancyHarness.api;' :
      'export default new Proxy({}, {get:(_,key)=>key});'
    }));
  }}],
});
const module = { exports: {} };
new Function('module', 'exports', bundled.outputFiles[0].text)(module, module.exports);
async function settle() {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (dirty) {
      dirty = false; cursor = 0; tree = module.exports.default();
      const pending = effects; effects = []; pending.forEach(callback => callback());
    }
    await new Promise(resolve => setImmediate(resolve));
    if (!dirty && !effects.length) return;
  }
  assert.fail('Page did not settle');
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
const input = () => nodes().find(node => node.type === 'input');
await settle();
const dataRows = nodes().filter(node => node.type === 'tr' && node.key);
assert.deepEqual(dataRows.map(node => node.key), records.map(row => row.pregnancy_id));
assert.deepEqual(dataRows.map(row => nodes(row).filter(node => node.type === 'td').map(text)), [
  ['Example Woman', '2-02-0010-18', '02', '2026-01-01', '2026-10-08', '14w', 'Enrolled'],
  ['—', '1-01-0118-19', '01', '—', '—', '—', 'Pending'],
]);
assert.ok(text(tree).includes('GA at enrollment (wks)'));
assert.ok(!text(tree).includes('undefined'));
// A slower previous search must not replace the latest results.
let release;
nextResponse = () => new Promise(resolve => { release = resolve; });
input().props.onChange({ target: { value: 'older' } });
await settle();
assert.ok(text(tree).includes('Loading'));
input().props.onChange({ target: { value: '  latest  ' } });
await settle();
assert.equal(new URLSearchParams(requests.at(-1).split('?')[1]).get('search'), 'latest');
release({ data: [], meta: { total: 0, page: 1, per_page: 20 } });
await settle();
assert.ok(text(tree).includes('Example Woman'));
// Failures leave loading and expose the API error instead of an empty table.
nextResponse = () => Promise.reject(new Error('Unable to fetch pregnancies'));
input().props.onChange({ target: { value: 'failure' } });
await settle();
assert.equal(text(nodes().find(node => node.props?.role === 'alert')), 'Unable to fetch pregnancies');
assert.ok(!text(tree).includes('Loading'));
input().props.onChange({ target: { value: '' } });
await settle();
assert.ok(text(tree).includes('Example Woman'));
assert.ok(!nodes().some(node => node.props?.role === 'alert'));
console.log('Pregnant women canonical fields, missing values, request races, and failure recovery passed.');

