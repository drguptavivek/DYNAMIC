import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

let authUser = { user_id:'manager', role:'site_data_manager', site_id:2, totp_enabled:true };
let pathname='/dashboard';
const sites=[{site_id:2,site_name:'Ballabhgarh'},{site_id:4,site_name:'Chennai'}];
let data;
function fixtures() {
  return {
    2:{site_id:2,supervisors:[{user_id:'sup-one',username:'first.supervisor',display_name:'Anita',assigned_locality_codes:['20']},{user_id:'sup-two',username:'second.supervisor',display_name:'Anita',assigned_locality_codes:[]}],localities:[{locality_code:'20',locality_name:'Bukharpur'},{locality_code:'21',locality_name:'Machgarh'}]},
    4:{site_id:4,supervisors:[{user_id:'ch-sup',username:'ch-supervisor',display_name:'Chennai Supervisor',assigned_locality_codes:['04']}],localities:[{locality_code:'04',locality_name:'Chennai East'}]},
  };
}
let slots=[],cursor=0,dirty=true,effects=[],tree,Page;
let pendingGet,pendingPut,putError;
const requests=[],writes=[];
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
globalThis.supervisorHarness={
  useAuth:()=>({user:authUser,loading:false,logout:()=>{}}),
  useLocation:()=>({pathname}),
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{const next=typeof value==='function'?value(slots[i]):value;if(!Object.is(next,slots[i])){slots[i]=next;dirty=true;}}];},
  useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
  useEffect(callback,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=callback();});}},
  api:{
    get:async url=>{requests.push(url);if(url==='/masters/sites')return structuredClone(sites);const pending=pendingGet;pendingGet=undefined;if(pending)return await pending;return structuredClone(data[Number(new URLSearchParams(url.split('?')[1]).get('site_id'))]);},
    put:async(url,body)=>{writes.push({url,body:structuredClone(body)});if(putError){const error=putError;putError=undefined;throw error;}if(pendingPut)await pendingPut;const target=data[body.site_id].supervisors.find(s=>s.user_id===body.supervisor_user_id);target.assigned_locality_codes=[...body.locality_codes];return {ok:true};},
  },
};
async function bundle(entry) {
  const result=await build({entryPoints:[entry],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',plugins:[{name:'supervisor-ui-test',setup(builder){
    builder.onResolve({filter:/^(react|react\/jsx-runtime|react-router-dom)$|\/lib\/(api|auth-context)$|\.css$/},args=>({path:args.path,namespace:'mock'}));
    builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='react'?'export const {useState,useEffect,useRef}=globalThis.supervisorHarness;':args.path==='react/jsx-runtime'?'export const jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;export const Fragment="fragment";':args.path==='react-router-dom'?'export const useLocation=globalThis.supervisorHarness.useLocation;export const Navigate=props=>({type:"redirect",props});export const Outlet=()=>({type:"outlet",props:{}});export const Link=props=>({type:"a",props:{...props,href:props.to}});':args.path.endsWith('/api')?'export const api=globalThis.supervisorHarness.api;':args.path.endsWith('/auth-context')?'export const useAuth=globalThis.supervisorHarness.useAuth;':'export default new Proxy({}, {get:(_,key)=>String(key)});'}));
  }}]});
  const module={exports:{}};new Function('module','exports',result.outputFiles[0].text)(module,module.exports);return module.exports.default;
}
function resolve(node){if(Array.isArray(node))return node.map(resolve);if(!node||typeof node!=='object')return node;if(typeof node.type==='function')return resolve(node.type(node.props));return {...node,props:{...node.props,children:resolve(node.props?.children)}};}
async function settle(){for(let pass=0;pass<35;pass++){if(dirty){dirty=false;cursor=0;tree=resolve(Page());const pending=effects;effects=[];pending.forEach(cb=>cb());}await new Promise(done=>setImmediate(done));if(!dirty&&!effects.length)return;}assert.fail('Page never settled');}
function reset(){slots.forEach(slot=>slot?.cleanup?.());slots=[];cursor=0;dirty=true;effects=[];tree=undefined;pendingGet=undefined;pendingPut=undefined;putError=undefined;requests.length=0;writes.length=0;data=fixtures();}
function nodes(node=tree){if(Array.isArray(node))return node.flatMap(nodes);if(!node||typeof node!=='object')return [];return [node,...nodes(node.props?.children ?? null)];}
function text(node=tree){if(Array.isArray(node))return node.map(text).join('');return node&&typeof node==='object'?text(node.props?.children ?? null):node==null||typeof node==='boolean'?'':String(node);}
function button(label){const found=nodes().find(n=>n.type==='button'&&text(n)===label);assert.ok(found,`Missing button ${label}`);return found;}
function select(label){const parent=nodes().find(n=>n.type==='label'&&text(n).startsWith(label));assert.ok(parent,`Missing label ${label}`);return nodes(parent).find(n=>n.type==='select');}
const checkbox=code=>{const parent=nodes().find(n=>n.type==='label'&&n.key===code);assert.ok(parent,`Missing village ${code}`);return nodes(parent).find(n=>n.type==='input');};
async function choose(label,value){select(label).props.onChange({target:{value}});await settle();}
async function click(label){await button(label).props.onClick();await settle();}
function snapshot(name){if(!process.env.SUPERVISOR_PREVIEW_DIR)return;const escape=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');function html(node){if(Array.isArray(node))return node.map(html).join('');if(!node||typeof node!=='object')return node==null||typeof node==='boolean'?'':escape(node);if(node.type==='fragment')return html(node.props.children);const attrs=Object.entries(node.props).filter(([key,v])=>key!=='children'&&!key.startsWith('on')&&v!=null&&v!==false).map(([key,v])=>` ${key==='className'?'class':key}="${escape(v)}"`).join('');return `<${node.type}${attrs}>${html(node.props.children)}</${node.type}>`;}writeFileSync(`${process.env.SUPERVISOR_PREVIEW_DIR}/${name}.html`,`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:18px;font:14px Arial;background:#f8fafc;height:100vh;box-sizing:border-box}*{box-sizing:border-box}${readFileSync('apps/admin/src/pages/SupervisorVillageAssignmentPage.module.css','utf8')}</style>${html(tree)}`);}

Page=await bundle('apps/admin/src/pages/SupervisorVillageAssignmentPage.tsx');reset();await settle();
assert.equal(select('Site').props.value,'2');assert.equal(select('Site').props.disabled,true);
assert(!text(select('Site')).includes('Chennai'),'Site manager only sees own site');
assert(text(select('Field Supervisor')).includes('Anita (first.supervisor)'));
assert(text(select('Field Supervisor')).includes('Anita (second.supervisor)'));
assert(!nodes().some(n=>n.type==='input'&&n.props.type==='checkbox'));
await choose('Field Supervisor','sup-one');
assert.equal(checkbox('20').props.checked,true);assert.equal(checkbox('21').props.checked,false);
const search=()=>nodes().find(n=>n.props['aria-label']==='Search villages');
search().props.onChange({target:{value:'mach'}});await settle();assert.equal(nodes().filter(n=>n.props.type==='checkbox').length,1);assert(checkbox('21'));
search().props.onChange({target:{value:'20'}});await settle();assert(checkbox('20'));
search().props.onChange({target:{value:''}});await settle();
await click('Select all villages');assert(checkbox('20').props.checked&&checkbox('21').props.checked);
let release;pendingPut=new Promise(resolve=>{release=resolve;});
const save=button('Save village access').props.onClick;const first=save();const second=save();await settle();
assert.equal(writes.length,1,'Double click creates only one save');
assert(select('Field Supervisor').props.disabled);assert(select('Site').props.disabled);assert(checkbox('21').props.disabled);assert(button('Saving...').props.disabled);
release();await Promise.all([first,second]);pendingPut=undefined;await settle();
assert.deepEqual(writes[0],{url:'/supervisor-village-assignments',body:{supervisor_user_id:'sup-one',site_id:2,locality_codes:['20','21']}});
assert.equal(select('Site').props.value,'2');assert.equal(select('Field Supervisor').props.value,'sup-one');assert(checkbox('20').props.checked&&checkbox('21').props.checked);assert(text().includes('access saved'));
const previewVillages=data[2].localities; data[2].localities=[...previewVillages,...Array.from({length:28},(_,i)=>({locality_code:String(i+30),locality_name:`Example village ${i+1}`}))]; await click('Refresh'); snapshot('manager-villages'); data[2].localities=previewVillages; await click('Refresh');
await choose('Field Supervisor','sup-two');assert(!checkbox('20').props.checked&&!checkbox('21').props.checked);
await click('Select all villages');await click('Clear selection');await click('Save village access');assert.deepEqual(writes.at(-1).body.locality_codes,[]);
putError=new Error('Permission changed');await click('Save village access');assert(text().includes('Permission changed'));assert(!nodes().some(n=>n.type==='section'));
await click('Refresh');assert(!text().includes('Permission changed'));assert.equal(select('Field Supervisor').props.value,'sup-two');
await click('Save village access');assert.equal(writes.length,4);

reset();authUser={user_id:'central',role:'central_admin',totp_enabled:true};await settle();assert.equal(select('Site').props.disabled,false);assert(text(select('Site')).includes('Chennai'));
await choose('Field Supervisor','sup-one');
let resolveStale;pendingGet=new Promise(resolve=>{resolveStale=resolve;});await click('Refresh');assert(select('Field Supervisor').props.disabled);
await choose('Site','4');assert.equal(select('Field Supervisor').props.value,'');assert(text().includes('Chennai Supervisor'));assert(!text().includes('Bukharpur'));
resolveStale(fixtures()[2]);await settle();assert(text().includes('Chennai Supervisor'));assert(!text().includes('Bukharpur'),'Old site response cannot overwrite current site');
await choose('Field Supervisor','ch-sup');assert(checkbox('04').props.checked);
await click('Clear selection');await click('Save village access');assert.equal(writes.at(-1).body.site_id,4);assert.equal(writes.at(-1).body.supervisor_user_id,'ch-sup');

reset();authUser={user_id:'s',role:'field_supervisor',site_id:2,totp_enabled:true};await settle();assert.equal(tree.type,'redirect');assert.equal(tree.props.to,'/dashboard');assert.equal(requests.length,0,'Supervisor cannot request assignment-management data');
const Layout=await bundle('apps/admin/src/components/Layout.tsx');Page=Layout;reset();await settle();assert.deepEqual(nodes().filter(n=>n.type==='a').map(n=>[n.props.href,text(n)]),[['/dashboard','Dashboard']]);
for(const role of ['central_admin','site_data_manager']){authUser={...authUser,role};dirty=true;await settle();assert(nodes().some(n=>n.type==='a'&&n.props.href==='/supervisor-village-assignment'));}
const Protected=await bundle('apps/admin/src/components/ProtectedRoute.tsx');Page=Protected;authUser={...authUser,role:'field_supervisor'};
for(const path of ['/users','/tasks','/form-data-export','/supervisor-village-assignment','/staff-dashboard']){pathname=path;dirty=true;await settle();assert.equal(tree.type,'redirect');assert.equal(tree.props.to,'/dashboard');}
for(const path of ['/dashboard','/security/totp-setup']){pathname=path;dirty=true;await settle();assert.equal(tree.type,'outlet');}
authUser={...authUser,totp_enabled:false};pathname='/dashboard';dirty=true;await settle();assert.equal(tree.props.to,'/security/totp-setup');
const rolesSource=readFileSync('apps/admin/src/pages/UsersPage.tsx','utf8');assert(!/^[ \t]*"supervisor",?\s*$/m.test(rolesSource),'No duplicate Supervisor role added');
console.log('Supervisor village assignment and dashboard-only UI regression checks passed');
