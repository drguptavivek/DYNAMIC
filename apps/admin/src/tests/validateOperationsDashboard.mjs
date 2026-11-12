import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const metrics = () => ({ assigned_households: 0, forms_completed: 0, forms_today: 0, forms_received: 0, backed_up_drafts: 0, pending_tasks: 0, overdue_tasks: 0, sync_errors: 0, forms_by_code: {} });
const villages = [{ site_id: 2, locality_code: '20', locality_name: 'Bukharpur' }, { site_id: 2, locality_code: '21', locality_name: 'Empty village' }, { site_id: 4, locality_code: '20', locality_name: 'Chennai East' }];
const staff = [
  { user_id: 'anita', username: 'worker.one', display_name: 'Anita', site_id: 2, village: '20' },
  { user_id: 'anita2', username: 'worker.two', display_name: 'Anita', site_id: 2, village: '20' },
  { user_id: 'ch-worker', username: 'ch-worker', display_name: 'Chennai Example', site_id: 4, village: '20' },
];
const submissions = [
  { site_id: 2, locality_code: '20', user_id: 'anita', code: 'HHQ', date: '2026-11-10' },
  { site_id: 2, locality_code: '20', user_id: 'anita', code: 'WQ', date: '2026-11-11' },
  { site_id: 2, locality_code: '20', user_id: 'anita2', code: 'WQ', date: '2026-11-12' },
  { site_id: 2, locality_code: '20', user_id: 'anita2', code: 'PEF', date: '2026-11-12' },
  { site_id: 2, locality_code: '20', user_id: 'anita', code: 'EXTRA', date: '2026-11-11' },
  { site_id: 4, locality_code: '20', user_id: 'ch-worker', code: 'HHQ', date: '2026-11-12' },
];
const sites = [{ site_id: 2, site_name: 'Ballabhgarh' }, { site_id: 4, site_name: 'Chennai' }];
let authUser = { user_id: 'central', role: 'central_admin', username: 'central' };
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function response(url) {
  if (url === '/dashboard') return { households: 10, members: 40, eligible_women: 8, tracking_eligible_women: 6, active_pregnancies: 3, children: 4, tasks: 20, open_data_quality_flags: 1 };
  const params = new URLSearchParams(url.split('?')[1]);
  const central = ['central_admin','central_data_manager'].includes(authUser.role);
  const site = central ? Number(params.get('site_id')) || null : authUser.site_id;
  const locality = params.get('locality_code'), user = params.get('user_id');
  const period = params.get('period') || 'all';
  const staffOptions = staff.filter(row => (!site || row.site_id === site) && (!locality || row.village === locality));
  const cards = villages.filter(v => (!site || v.site_id === site) && (!locality || v.locality_code === locality) && (!user || staff.some(s => s.user_id === user && s.site_id === v.site_id && s.village === v.locality_code))).map(v => {
    const forms = submissions.filter(f => f.site_id === v.site_id && f.locality_code === v.locality_code && (!user || f.user_id === user) && (period === 'all' || period === 'today' && f.date === today || period === 'date' && f.date === params.get('date') || period === 'range' && f.date >= params.get('date_from') && f.date <= params.get('date_to')));
    return { ...metrics(), ...v, users: 2, assigned_users: staff.filter(s => s.site_id === v.site_id && s.village === v.locality_code), forms_completed: forms.length, forms_by_code: forms.reduce((counts,f) => {counts[f.code]=(counts[f.code]||0)+1;return counts;},{}) };
  });
  return { period, staff_options: staffOptions, date: params.get('date'), date_from: params.get('date_from'), date_to: params.get('date_to'), timezone: 'Asia/Kolkata', generated_at: '2026-11-12T10:00:00Z', scope: { all_sites: central, site_id: site, locality_code: locality }, sites: sites.filter(s=>central||s.site_id===site), localities: villages.filter(v=>central||v.site_id===site), localities_summary: cards, users: [], totals: metrics(), sites_summary: [], cohort: response('/dashboard'), notes: [] };
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
const villageKeys=()=>nodes().filter(node=>node.type==='article').map(node=>node.key);
const villageCard=key=>nodes().find(node=>node.type==='article'&&node.key===key);
const formValue=(key,code)=>text(nodes(villageCard(key)).find(node=>node.type==='dt'&&text(node)===code));
const change=async(label,value)=>{input(label).props.onChange({target:{value}});await settle();};
const params=()=>new URLSearchParams(requests.at(-1).split('?')[1]);
function snapshot(name) {
  if(!process.env.DASHBOARD_PREVIEW_DIR)return;
  const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  function html(node){if(Array.isArray(node))return node.map(html).join('');if(!node||typeof node!=='object')return node==null||typeof node==='boolean'?'':escape(node);if(node.type==='fragment')return html(node.props.children);const attrs=Object.entries(node.props).filter(([key,value])=>key!=='children'&&!key.startsWith('on')&&value!=null&&value!==false).map(([key,value])=>` ${key==='className'?'class':key}="${escape(value)}"`).join('');return `<${node.type}${attrs}>${html(node.props.children)}</${node.type}>`;}
  const css=readFileSync('apps/admin/src/pages/DashboardPage.module.css','utf8');
  writeFileSync(`${process.env.DASHBOARD_PREVIEW_DIR}/${name}.html`,`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:18px;font:14px Arial;background:#f8fafc;height:100vh;box-sizing:border-box}*{box-sizing:border-box}${css}</style>${html(tree)}`);
}

await settle();
assert.deepEqual(villageKeys(), ['2:20','2:21','4:20']);
assert.equal(input('Date').props.value, 'all');
assert.equal(nodes().filter(n=>n.type==='select').length, 4, 'Only the four requested filters remain');
assert.equal(params().get('period'), 'all');
assert(!nodes().some(n=>n.type==='table'), 'Old dashboard tables are removed');
assert(!text().includes('Recorded sync issues'));
for (const code of ['BHQ','BWQ','HRF','PEF','UF','PFF','POF','BAF','SBF','NFF','CDF','PSF','EXTRA']) assert.equal(formValue('2:20',code),code);
assert(text(villageCard('2:20')).includes('worker.one') && text(villageCard('2:20')).includes('worker.two'), 'Same names retain distinct usernames');
assert(text(villageCard('2:21')).includes('No staff currently assigned'));
const value = (key,code) => {
  const pair=nodes(villageCard(key)).find(n=>n.type==='div'&&nodes(n).some(child=>child.type==='dt'&&text(child)===code));
  return text(nodes(pair).find(n=>n.type==='dd'));
};
assert.equal(value('2:20','BWQ'),'2 forms filled');
assert.equal(value('2:21','BHQ'),'0 forms filled');
snapshot('central-villages');
await change('Site','2');
assert.deepEqual(villageKeys(),['2:20','2:21']);
assert(!text().includes('Chennai Example'));
await change('Village','2:20');
assert.deepEqual(villageKeys(),['2:20']);
await change('User','anita');
assert.equal(params().get('user_id'),'anita');
assert.equal(value('2:20','BWQ'),'1 forms filled');
assert.equal(value('2:20','PEF'),'0 forms filled');
assert(text().includes("Anita's forms only"));
assert.equal(nodes(input('User')).filter(n=>n.type==='option').length,3,'Selecting one user retains other staff choices');
await change('Date','date'); await change('Submission date','2026-11-10');
assert.equal(params().get('date'),'2026-11-10');
assert.equal(value('2:20','BHQ'),'1 forms filled');assert.equal(value('2:20','BWQ'),'0 forms filled');
await change('Date','range');
await change('From date','2026-11-10');await change('To date','2026-11-11');
assert.equal(params().get('date_from'),'2026-11-10');assert.equal(params().get('date_to'),'2026-11-11');assert(!params().has('date'));
assert.equal(value('2:20','BHQ'),'1 forms filled');assert.equal(value('2:20','BWQ'),'1 forms filled');
snapshot('central-range');
const beforeInvalid=requests.length;
await change('To date','2026-11-09');
assert.equal(requests.length,beforeInvalid);assert(text().includes('To date must be on or after From date'));assert.equal(villageKeys().length,0,'Invalid ranges must not display stale totals');
await change('To date','');assert(text().includes('Select both From and To dates'));assert.equal(requests.length,beforeInvalid);
await change('To date','2026-11-10');
assert.equal(value('2:20','BHQ'),'1 forms filled');assert.equal(value('2:20','BWQ'),'0 forms filled');
await change('Date','today');assert.equal(params().get('period'),'today');assert(!params().has('date_from')&&!params().has('date'));
assert(!nodes().some(n=>n.type==='input'&&n.props.type==='date'));
await change('Date','all');assert(!params().has('date_to'));
await change('Site','4');assert.equal(input('User').props.value,'');assert.equal(input('Village').props.value,'');assert.deepEqual(villageKeys(),['4:20']);
await change('Site','');await change('Village','2:20');assert.equal(params().get('site_id'),'2','Village choice selects its site');
// Slow responses cannot overwrite a newer set of filters.
let resolveOld;nextResponse=new Promise(done=>{resolveOld=done;});
input('User').props.onChange({target:{value:'anita'}});await settle();assert(text().includes('Loading village forms'));assert.equal(villageKeys().length,0);
await change('User','anita2');assert.equal(value('2:20','BHQ'),'0 forms filled');
resolveOld(response('/dashboard/operations?period=all'));await settle();assert.equal(value('2:20','BHQ'),'0 forms filled');
nextResponse=Promise.reject(new Error('Connection unavailable'));button('Refresh').props.onClick();await settle();assert(text().includes('Connection unavailable'));assert.equal(villageKeys().length,0);
button('Try again').props.onClick();await settle();assert.equal(villageKeys().length,1);
authUser={user_id:'manager4',role:'site_data_manager',site_id:4,username:'manager'};slots=[];dirty=true;await settle();
assert(input('Site').props.disabled);assert.equal(input('Site').props.value,'4');assert.deepEqual(villageKeys(),['4:20']);assert(!text().includes('Ballabhgarh'));
input('Site').props.onChange({target:{value:'2'}});await settle();assert(!params().has('site_id'),'Site manager cannot request a different site');assert.deepEqual(villageKeys(),['4:20']);
snapshot('site-manager-villages');
await change('User','missing');assert(text().includes('No villages match these filters'));assert.equal(villageKeys().length,0);
authUser={user_id:'collaborator',role:'us_collaborator',username:'collaborator'};slots=[];dirty=true;await settle();assert(text().includes('Household members'));assert(requests.at(-1)==='/dashboard','Non-operational roles retain their study summary');
console.log('Village dashboard UI passed: four filters, all/today/date/range, all form cards, exact user totals, zero villages, scoped choices, duplicate names, invalid dates, races/errors and site-manager isolation.');
