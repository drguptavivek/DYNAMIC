import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const metrics = (forms = 0) => ({ assigned_households: 20, forms_completed: forms, forms_today: Math.min(forms, 1), forms_received: forms + 1, backed_up_drafts: 2, pending_tasks: 12, overdue_tasks: 3, sync_errors: 1, forms_by_code: forms ? { HHQ: 1, WQ: 1, PEF: 1, PSF: 1 } : {} });
const villages = [{ site_id: 2, locality_code: '20', locality_name: 'Bukharpur' }, { site_id: 4, locality_code: '04', locality_name: 'Chennai East' }];
const staff = [
  { ...metrics(4), user_id: 'blb-worker', username: 'blb-worker', display_name: 'Anita Example', role: 'field_worker', active: true, site_id: 2, site_name: 'Ballabhgarh', assigned_localities: [villages[0]], completed_localities: [villages[0]], last_sync_at: '2026-10-21T09:00:00Z', last_sync_status: 'partial_success' },
  { ...metrics(4), user_id: 'ch-worker', username: 'ch-worker', display_name: 'Chennai Example', role: 'field_worker', active: true, site_id: 4, site_name: 'Chennai', assigned_localities: [villages[1]], completed_localities: [villages[1]], last_sync_at: '2026-10-21T09:10:00Z', last_sync_status: 'draft_backup' },
  { ...metrics(), assigned_households: 0, backed_up_drafts: 0, pending_tasks: 0, overdue_tasks: 0, sync_errors: 0, user_id: 'ch-zero', username: 'ch-zero', display_name: 'Zero Activity', role: 'field_worker', active: true, site_id: 4, site_name: 'Chennai', assigned_localities: [], completed_localities: [], last_sync_at: null, last_sync_status: null },
];
let authUser = { user_id: 'central', role: 'central_admin', username: 'central' };
const sites = [{ site_id: 2, site_name: 'Ballabhgarh' }, { site_id: 4, site_name: 'Chennai' }];
function response(url) {
  if (url === '/dashboard') return { households: 10, members: 40, eligible_women: 8, tracking_eligible_women: 6, active_pregnancies: 3, children: 4, tasks: 20, open_data_quality_flags: 1 };
  const params = new URLSearchParams(url.split('?')[1]);
  const central = authUser.role === 'central_admin';
  const site = central ? Number(params.get('site_id')) || null : authUser.site_id;
  const locality = params.get('locality_code');
  const staffOptions = staff.filter(row => (!site || row.site_id === site) && (!locality || row.assigned_localities.some(item => item.locality_code === locality)));
  const selectedUser = params.get('user_id');
  const search = (params.get('search') || '').trim().toLowerCase();
  const form = params.get('form_code');
  const users = staffOptions.filter(row => (!selectedUser || row.user_id === selectedUser) && (!search || `${row.display_name} ${row.username}`.toLowerCase().includes(search))).map(row => {
    let codes = form ? { [form]: row.forms_by_code[form] || 0 } : row.forms_by_code;
    if (params.get('period') === 'date') {
      const firstCode = Object.keys(codes).find(code => codes[code] > 0);
      codes = firstCode ? { [firstCode]: 1 } : {};
    }
    const completed = Object.values(codes).reduce((sum,value) => sum+value,0);
    return { ...row, forms_by_code: codes, forms_completed: params.get('period') === 'date' ? Math.min(completed,1) : completed, forms_today: Math.min(completed,1) };
  });
  const scopeSites = sites.filter(item => central || item.site_id === site);
  return { period: params.get('period') || 'all', staff_options: staffOptions, date: params.get('date'), timezone: 'Asia/Kolkata', generated_at: '2026-10-21T10:00:00Z', scope: { all_sites: central, site_id: site, locality_code: locality }, sites: scopeSites, localities: villages.filter(item => central || item.site_id === site), users,
    totals: { ...metrics(users.reduce((sum,row)=>sum+row.forms_completed,0)), forms_today: users.reduce((sum,row)=>sum+row.forms_today,0), forms_by_code: users.reduce((counts,row)=>{for(const [code,value] of Object.entries(row.forms_by_code))counts[code]=(counts[code]||0)+value;return counts;},{}), assigned_households: 37, users: users.length, active_users: users.length, unattributed_forms: 2, open_data_quality_flags: 1 },
    sites_summary: scopeSites.filter(item => !site || item.site_id === site).map(item => ({ ...metrics(4), ...item, users: 1 })),
    localities_summary: villages.filter(item => (!site || item.site_id === site) && (!locality || item.locality_code === locality)).map(item=>({ ...metrics(4), ...item, users: 1 })),
    cohort: response('/dashboard'), notes: ['Device-only drafts appear after sync.'] };
}

let slots = [], cursor = 0, dirty = true, effects = [], tree;
let nextResponse;
const requests = [];
const same = (a,b) => a && b && a.length === b.length && a.every((value,index)=>Object.is(value,b[index]));
globalThis.operationsHarness = {
  useAuth: () => ({ user: authUser }),
  useState(initial) { const index=cursor++; if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial; return [slots[index], value=>{const next=typeof value==='function'?value(slots[index]):value;if(!Object.is(next,slots[index])){slots[index]=next;dirty=true;}}]; },
  useMemo(factory,deps) { const index=cursor++;if(!slots[index]||!same(slots[index].deps,deps))slots[index]={deps,value:factory()};return slots[index].value; },
  useEffect(callback,deps) { const index=cursor++;if(!slots[index]||!same(slots[index].deps,deps)){slots[index]?.cleanup?.();slots[index]={deps};effects.push(()=>{slots[index].cleanup=callback();});} },
  api: { get: async url=>{requests.push(url);const pending=nextResponse;nextResponse=undefined;return pending ? await pending : structuredClone(response(url));} },
};
const bundled = await build({entryPoints:['apps/admin/src/pages/DashboardPage.tsx'],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',plugins:[{name:'dashboard-test',setup(builder){
  builder.onResolve({filter:/^(react|react\/jsx-runtime)$|\/lib\/(api|auth-context)$|\.css$/},args=>({path:args.path,namespace:'mock'}));
  builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='react'?'export const {useState,useEffect,useMemo}=globalThis.operationsHarness;':args.path==='react/jsx-runtime'?'export const jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;export const Fragment="fragment";':args.path.endsWith('/api')?'export const api=globalThis.operationsHarness.api;':args.path.endsWith('/auth-context')?'export const useAuth=globalThis.operationsHarness.useAuth;':'export default new Proxy({}, {get: (_,key)=>String(key)});'}));
}}]});
const module = { exports: {} };new Function('module','exports',bundled.outputFiles[0].text)(module,module.exports);
const Page = module.exports.default;
function resolve(node) {if(Array.isArray(node))return node.map(resolve);if(!node||typeof node!=='object')return node;if(typeof node.type==='function')return resolve(node.type(node.props));return {...node,props:{...node.props,children:resolve(node.props?.children)}};}
async function settle() {for(let pass=0;pass<35;pass++){if(dirty){dirty=false;cursor=0;tree=resolve(Page());const pending=effects;effects=[];pending.forEach(callback=>callback());}await new Promise(done=>setImmediate(done));if(!dirty&&!effects.length)return;}assert.fail('dashboard never settled');}
function nodes(node=tree) {if(Array.isArray(node))return node.flatMap(item=>nodes(item));if(!node||typeof node!=='object')return [];return [node,...nodes(node.props?.children ?? null)];}
function text(node=tree) {if(Array.isArray(node))return node.map(text).join('');return node&&typeof node==='object'?text(node.props?.children ?? null):node==null||typeof node==='boolean'?'':String(node);}
const button=label=>{const found=nodes().find(node=>node.type==='button'&&text(node)===label);assert.ok(found,`Missing ${label}`);return found;};
const input=label=>{const found=nodes().find(node=>node.type==='label'&&text(node).startsWith(label));assert.ok(found,label);return nodes(found).find(node=>['select','input'].includes(node.type));};
const rowKeys=()=>nodes().filter(node=>node.type==='tr'&&node.key).map(node=>node.key);
function snapshot(name) {
  if(!process.env.DASHBOARD_PREVIEW_DIR)return;
  const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  function html(node){if(Array.isArray(node))return node.map(html).join('');if(!node||typeof node!=='object')return node==null||typeof node==='boolean'?'':escape(node);if(node.type==='fragment')return html(node.props.children);const attrs=Object.entries(node.props).filter(([key,value])=>key!=='children'&&!key.startsWith('on')&&value!=null&&value!==false).map(([key,value])=>` ${key==='className'?'class':key}="${escape(value)}"`).join('');return `<${node.type}${attrs}>${html(node.props.children)}</${node.type}>`;}
  const css=readFileSync('apps/admin/src/pages/DashboardPage.module.css','utf8');
  writeFileSync(`${process.env.DASHBOARD_PREVIEW_DIR}/${name}.html`,`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:18px;font:14px Arial;background:#f8fafc;height:100vh;box-sizing:border-box}*{box-sizing:border-box}${css}</style>${html(tree)}`);
}

await settle();
assert.deepEqual(rowKeys(),staff.map(row=>row.user_id));
assert.equal(input('Period').props.value, 'all');
assert.ok(!nodes().some(node=>node.type==='input' && node.props.type==='date'));
assert.equal(new URLSearchParams(requests.at(-1).split('?')[1]).get('period'),'all');
assert.ok(text().includes('All time total') && text().includes('Today (IST)'));
button('Staff overview').props.onClick();await settle();
assert.equal(input('Site').props.disabled,false);
assert.ok(text().includes('Backed-up drafts')&&text().includes('Recorded sync issues'));
assert.ok(text().includes('Forms filled:')&&text().includes('Chennai East'));
assert.ok(text().includes('Not recorded'),'no server contact must not invent a date');
snapshot('central-staff');
button('Forms by staff').props.onClick();await settle();
const headings=nodes().filter(node=>node.type==='th').map(node=>text(node));
for(const code of ['BHQ','BWQ','HRF','PEF','UF','PFF','POF','BAF','SBF','NFF','CDF','PSF'])assert.ok(headings.includes(code),code);
snapshot('central-forms');
input('Find staff').props.onChange({target:{value:'  ANITA  '}});await settle();assert.deepEqual(rowKeys(),['blb-worker']);
assert.ok(requests.at(-1).includes('search=ANITA'));
assert.ok(text().includes('Total forms filled4'), 'summary follows staff search');
input('Find staff').props.onChange({target:{value:''}});await settle();
input('Staff user').props.onChange({target:{value:'blb-worker'}});await settle();
assert.deepEqual(rowKeys(),['blb-worker']);
assert.ok(requests.at(-1).includes('user_id=blb-worker'));
assert.equal(nodes(input('Staff user')).filter(node=>node.type==='option').length,4,'staff filter must keep other choices');
input('Form type').props.onChange({target:{value:'PEF'}});await settle();
assert.ok(requests.at(-1).includes('form_code=PEF'));
assert.ok(text().includes('Total forms filled1'),'summary follows form filter');
button('Forms by staff').props.onClick();await settle();
assert.ok(nodes().some(node=>node.type==='th'&&text(node)==='PEF'));
assert.ok(!nodes().some(node=>node.type==='th'&&text(node)==='BHQ'));
input('Form type').props.onChange({target:{value:''}});await settle();
input('Staff user').props.onChange({target:{value:''}});await settle();
input('Find staff').props.onChange({target:{value:'no such staff'}});await settle();
assert.deepEqual(rowKeys(),[]);assert.ok(text().includes('No staff match these filters.'));
input('Find staff').props.onChange({target:{value:''}});await settle();
button('Village activity').props.onClick();await settle();assert.deepEqual(rowKeys(),['2:20','4:04']);snapshot('central-villages');
input('Site').props.onChange({target:{value:'4'}});await settle();assert.ok(requests.at(-1).includes('site_id=4'));assert.deepEqual(rowKeys(),['4:04']);
button('Staff overview').props.onClick();await settle();assert.deepEqual(rowKeys(),['ch-worker','ch-zero']);
input('Period').props.onChange({target:{value:'date'}});await settle();
assert.ok(nodes().some(node=>node.type==='input' && node.props.type==='date'));
assert.ok(text().includes('Forms on selected date1'), 'date-wise summary uses the selected day');
assert.ok(text().includes('Forms filled today1'), 'today remains independent of selected date');
snapshot('central-date-wise');
let release;nextResponse=new Promise(done=>{release=done;});
input('Date (IST)').props.onChange({target:{value:'2026-10-20'}});await settle();assert.ok(nodes().some(node=>node.props?.role==='status'));
input('Date (IST)').props.onChange({target:{value:'2026-10-19'}});await settle();const current=requests.at(-1);
release({...response('/dashboard/operations?date=2026-10-20'),users:[]});await settle();assert.deepEqual(rowKeys(),['ch-worker','ch-zero'],'late earlier date response cannot replace latest data');
nextResponse=Promise.reject(new Error('Dashboard test network failure'));button('Refresh').props.onClick();await settle();
assert.ok(nodes().some(node=>node.props?.role==='alert'));assert.ok(!nodes().some(node=>node.type==='table'),'failed refresh must hide stale rows');
const staleStudyPanel=nodes().find(node=>node.type==='details'&&text(node).includes('Study totals'));
assert.equal(nodes(staleStudyPanel ?? null).filter(node=>node.type==='strong').length,0,'failed refresh must hide old study counts too');
button('Refresh').props.onClick();await settle();assert.equal(requests.at(-1),current,'refresh preserves filters');assert.deepEqual(rowKeys(),['ch-worker','ch-zero']);

for(const slot of slots)slot?.cleanup?.();slots=[];effects=[];dirty=true;authUser={user_id:'ch-manager',username:'manager',role:'site_data_manager',site_id:4};
await settle();assert.equal(input('Site').props.disabled,true);
button('Staff overview').props.onClick();await settle();assert.deepEqual(rowKeys(),['ch-worker','ch-zero']);
assert.ok(!nodes().some(node=>node.type==='option'&&text(node)==='All sites'));
assert.ok(!text().includes('Anita Example'));assert.ok(!nodes().some(node=>node.type==='button'&&text(node)==='Site activity'));snapshot('chennai-manager');
console.log('Operational dashboard all-time/date, exact user, form filter, today totals, and central/site views, zero-activity users, all form labels, filters, stale responses, refresh errors, and offline disclosure passed.');
