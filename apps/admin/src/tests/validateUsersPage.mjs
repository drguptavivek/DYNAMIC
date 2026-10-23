import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Exercise the actual page without changing accounts, assignments, or devices.
const sites = [
  { site_id: 1, site_code: 'Bar', site_name: 'Bareilly' },
  { site_id: 2, site_code: 'BLB', site_name: 'Ballabhgarh' },
];
const localities = [
  { site_id: 1, locality_code: '10', locality_name: 'Bareilly Ten' },
  { site_id: 2, locality_code: '10', locality_name: 'Ballabhgarh Ten' },
  { site_id: 2, locality_code: '20', locality_name: 'Ballabhgarh Twenty' },
];
const device = (id, authorized, name = id) => ({ device_id: id, authorized, device_name: name });
const users = [
  { user_id: 'bareilly', username: 'bareilly-worker', display_name: 'Alpha Worker', email: 'alpha@example.org', role: 'field_worker', site_id: 1, active: true, registered_devices: [] },
  { user_id: 'ballabhgarh', username: 'ballabhgarh-worker', display_name: 'Beta Worker', email: 'beta@example.org', role: 'field_worker', site_id: 2, active: true, registered_devices: [device('phone-authorized', true, 'Field Tablet')] },
  { user_id: 'unassigned', username: 'inactive-worker', display_name: 'Gamma Worker', role: 'field_worker', site_id: 2, active: false, registered_devices: [device('phone-blocked', false)] },
  { user_id: 'expired', username: 'expired-worker', display_name: 'Expired Worker', role: 'field_worker', site_id: 2, active: true, registered_devices: [device('mixed-allowed', true), device('mixed-blocked', false)] },
  { user_id: 'future', username: 'future-manager', display_name: 'Future Manager', role: 'site_data_manager', site_id: 2, active: true, registered_devices: [] },
  { user_id: 'central', username: 'central-admin', display_name: 'Central Admin', role: 'central_admin', site_id: null, active: true, registered_devices: [] },
];
const assignment = (user, site, code, extra = {}) => ({ assignment_id: `${user}-${code}`, user_id: user, site_id: site, locality_code: code, role: 'field_worker', ...extra });
const assignments = {
  bareilly: [assignment('bareilly', 1, '10')],
  ballabhgarh: [assignment('ballabhgarh', 2, '10', { active_from: '2000-01-01', active_to: '2999-01-01' })],
  unassigned: [],
  expired: [assignment('expired', 2, '20', { active_to: '2000-01-01' })],
  future: [assignment('future', 2, '20', { active_from: '2999-01-01' })],
  central: [],
};
let authUser = { user_id: 'central', username: 'central-admin', role: 'central_admin', site_id: null };
let returnedUsers = users;
let failedAssignments = new Set();
let failUsers = false;
let slots = [], cursor = 0, dirty = true, effects = [], tree;
const requests = [], writes = [];
const sameDeps = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
globalThis.usersHarness = {
  useAuth: () => ({ user: authUser }),
  useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
  useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], value => {
      const next = typeof value === 'function' ? value(slots[index]) : value;
      if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; }
    }];
  },
  useMemo(factory, deps) {
    const index = cursor++;
    if (!sameDeps(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() };
    return slots[index].value;
  },
  useEffect(callback, deps) {
    const index = cursor++;
    if (!sameDeps(slots[index]?.deps, deps)) {
      slots[index]?.cleanup?.(); slots[index] = { deps };
      effects.push(() => { slots[index].cleanup = callback(); });
    }
  },
  api: {
    async get(path) {
      requests.push(path);
      if (path === '/masters/sites') return structuredClone(sites);
      if (path === '/masters/localities') return structuredClone(localities);
      if (path.startsWith('/users/') && path.endsWith('/area-assignments')) {
        const id = path.split('/')[2];
        if (failedAssignments.has(id)) throw new Error('Assignment fetch failed');
        return structuredClone(assignments[id]);
      }
      if (path === '/users' || path === '/users?') {
        if (failUsers) throw new Error('Unable to load users');
        return structuredClone(returnedUsers);
      }
      assert.fail(`Unexpected API request: ${path}`);
    },
    async post(...args) { writes.push(args); assert.fail('Unexpected POST'); },
    async patch(...args) { writes.push(args); assert.fail('Unexpected PATCH'); },
    async delete(...args) { writes.push(args); assert.fail('Unexpected DELETE'); },
  },
};
const bundled = await build({
  entryPoints: ['apps/admin/src/pages/UsersPage.tsx'], bundle: true, write: false,
  format: 'cjs', platform: 'node', jsx: 'automatic',
  plugins: [{ name: 'users-page-dependencies', setup(builder) {
    builder.onResolve({ filter: /^(react|react\/jsx-runtime|qrcode)$|\/lib\/(api|auth-context|passwordGenerator)$|\.css$/ }, args => ({ path: args.path, namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents:
      args.path === 'react' ? 'export const {useState,useMemo,useRef,useEffect}=globalThis.usersHarness;' :
      args.path === 'react/jsx-runtime' ? 'export const jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;export const Fragment="fragment";' :
      args.path.endsWith('/api') ? 'export const api=globalThis.usersHarness.api;' :
      args.path.endsWith('/auth-context') ? 'export const useAuth=globalThis.usersHarness.useAuth;' :
      args.path.endsWith('/passwordGenerator') ? 'export const generateStudyPassword=()=>"unused-password";' :
      args.path === 'qrcode' ? 'export default {};' :
      'export default new Proxy({}, {get:(_,key)=>String(key)});'
    }));
  }}],
});
const module = { exports: {} };
new Function('module', 'exports', bundled.outputFiles[0].text)(module, module.exports);
function resolve(node) {
  if (Array.isArray(node)) return node.map(resolve);
  if (!node || typeof node !== 'object') return node;
  if (typeof node.type === 'function') return resolve(node.type(node.props));
  return { ...node, props: { ...node.props, children: resolve(node.props?.children) } };
}
async function settle() {
  for (let pass = 0; pass < 30; pass++) {
    if (dirty) {
      dirty = false; cursor = 0; tree = resolve(module.exports.default());
      const pending = effects; effects = []; pending.forEach(callback => callback());
    }
    await new Promise(done => setImmediate(done));
    if (!dirty && !effects.length) return;
  }
  assert.fail('Users page never settled');
}
function nodes(node = tree) {
  if (Array.isArray(node)) return node.flatMap(item => nodes(item));
  if (!node || typeof node !== 'object') return [];
  return [node, ...nodes(node.props?.children ?? null)];
}
function text(node = tree) {
  if (Array.isArray(node)) return node.map(item => text(item)).join('');
  if (!node || typeof node === 'boolean') return '';
  return typeof node === 'object' ? text(node.props?.children ?? null) : String(node);
}
function control(label) {
  const wrapper = nodes().find(node => node.type === 'label' && text(node).startsWith(label));
  assert.ok(wrapper, `Missing filter ${label}`);
  const found = nodes(wrapper).find(node => ['input', 'select'].includes(node.type));
  assert.ok(found, `Missing control ${label}`); return found;
}
async function filter(label, value) { control(label).props.onChange({ target: { value } }); await settle(); }
function rowIds() { return nodes().filter(node => node.type === 'tr' && node.key).map(node => node.key); }
async function clear() {
  const button = nodes().find(node => node.type === 'button' && text(node) === 'Clear filters');
  assert.ok(button, 'Missing Clear filters'); button.props.onClick(); await settle();
}
function remount() {
  for (const slot of slots) slot?.cleanup?.();
  slots = []; effects = []; dirty = true;
}

await settle();
assert.deepEqual(rowIds(), users.map(user => user.user_id));
assert.ok(text().includes('Showing 6 of 6 users'));
for (const label of ['Edit', 'Password', 'Security']) assert.equal(nodes().filter(node => node.type === 'button' && text(node) === label).length, users.length, `${label} actions retained`);
assert.equal(nodes().filter(node => node.props?.role === 'switch').length, users.length, 'Account status switches retained');
const loadedRequests = requests.length;
await filter('Site', '2');
assert.deepEqual(rowIds(), ['ballabhgarh', 'unassigned', 'expired', 'future']);
assert.ok(!nodes(control('Assigned locality')).some(node => node.type === 'option' && node.props.value === '1-10'), 'Localities constrained to selected site');
await filter('Assigned locality', '2-10'); assert.deepEqual(rowIds(), ['ballabhgarh']);
await filter('Site', '1'); assert.equal(control('Assigned locality').props.value, '', 'Changing site resets locality');
assert.deepEqual(rowIds(), ['bareilly']);
await clear();
await filter('Assigned locality', '2-10'); assert.deepEqual(rowIds(), ['ballabhgarh'], 'Same locality code in another site cannot match');
await clear();
await filter('Assigned locality', 'none'); assert.deepEqual(rowIds(), ['unassigned', 'expired', 'future', 'central'], 'Only current assignments count');
await clear();
await filter('Site', 'none'); assert.deepEqual(rowIds(), ['central']);
await clear();
await filter('Device', 'unregistered'); assert.deepEqual(rowIds(), ['bareilly', 'future', 'central']);
await filter('Device', 'registered'); assert.deepEqual(rowIds(), ['ballabhgarh', 'unassigned', 'expired']);
await filter('Device', 'authorized'); assert.deepEqual(rowIds(), ['ballabhgarh', 'expired']);
await filter('Device', 'deauthorized'); assert.deepEqual(rowIds(), ['unassigned', 'expired']);
await clear();
await filter('Role', 'field_worker'); await filter('Status', 'false'); assert.deepEqual(rowIds(), ['unassigned']);
await filter('Site', '1'); assert.deepEqual(rowIds(), []); assert.ok(text().includes('No users'), 'Helpful empty state');
await clear();
for (const [query, expected] of [
  [' ALPHA@EXAMPLE.ORG ', ['bareilly']], [' field TABLET ', ['ballabhgarh']],
  ['PHONE-BLOCKED', ['unassigned']], ['beta worker', ['ballabhgarh']], ['ballabhgarh-worker', ['ballabhgarh']],
]) { await filter('Search users', query); assert.deepEqual(rowIds(), expected, query); }
await clear();
assert.deepEqual(rowIds(), users.map(user => user.user_id));
assert.equal(requests.length, loadedRequests, 'Changing or clearing filters must not reload users or assignments');

// An unreadable assignment is unknown, not proof that a user has no assignment.
failedAssignments = new Set(['ballabhgarh']); remount(); await settle();
await filter('Assigned locality', 'none'); assert.ok(!rowIds().includes('ballabhgarh'));
await filter('Assigned locality', '2-10'); assert.deepEqual(rowIds(), []);
await clear(); assert.ok(rowIds().includes('ballabhgarh'), 'Failed assignment lookup does not hide user from unfiltered list');

// A site manager sees only records returned by the scoped API, even after reset.
failedAssignments = new Set(); authUser = { user_id: 'manager', username: 'manager', role: 'site_data_manager', site_id: 2 };
returnedUsers = users.filter(user => user.site_id === 2); remount(); await settle();
assert.deepEqual(rowIds(), returnedUsers.map(user => user.user_id));
await filter('Device', 'authorized'); await clear(); assert.deepEqual(rowIds(), returnedUsers.map(user => user.user_id));
assert.ok(!rowIds().includes('bareilly') && !rowIds().includes('central'));

failUsers = true; remount(); await settle();
assert.ok(text().includes('Unable to load users'), 'Load error is shown without crashing');
assert.deepEqual(writes, [], 'Read-only filter checks cannot mutate accounts');
console.log('Users page: composed site/locality/role/status/device/search filters, assignment dates/errors, reset, scoped results, preserved actions and load failure passed.');
