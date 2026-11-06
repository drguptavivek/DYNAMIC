import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
let user={user_id:'manager',role:'site_data_manager',site_id:2};
const initial=[{household_member_id:'2-39-0001-01-02',household_id:'2-39-0001-01',member_number:2,name:'Example Member',sex:1,site_id:2,reported_age_years:28,marital_status:1,member_status:'active'}, {household_member_id:'2-39-0001-01-03',household_id:'2-39-0001-01',member_number:3,name:'Already Female',sex:2,site_id:2}, {household_member_id:'4-04-0001-01-01',household_id:'4-04-0001-01',member_number:1,name:'Outside site',sex:1,site_id:4}];
let members=structuredClone(initial), posts=[], pendingPost, postError;
let slots=[], cursor=0, dirty=true, effects=[],tree;
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
globalThis.memberCorrectionHarness={
 useAuth:()=>({user}),useParams:()=>({}),
 useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;dirty=true;}];},
 useRef(value){const i=cursor++;if(!(i in slots))slots[i]={current:value};return slots[i];},
 useEffect(callback,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=callback();});}},
 api:{getPage:async()=>({data:structuredClone(members),meta:{total:members.length,page:1,per_page:50}}),post:async(path,body)=>{posts.push({path,body});if(pendingPost)await pendingPost;if(postError)throw new Error(postError);members[0].sex=2;return {woman_questionnaire_eligible:true,bwq_task_created:true,bwq_task_exists:true};}}
};
const bundled=await build({entryPoints:['apps/admin/src/pages/HouseholdMembersPage.tsx'],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',plugins:[{name:'member-correction-mocks',setup(b){
 b.onResolve({filter:/^(react|react\/jsx-runtime|react-router-dom)$|\/lib\/(api|auth-context)$|\.css$/},a=>({path:a.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='react'?'export const {useState,useEffect,useRef}=globalThis.memberCorrectionHarness;':a.path==='react/jsx-runtime'?'export const jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;export const Fragment="fragment";':a.path==='react-router-dom'?'export const {useParams}=globalThis.memberCorrectionHarness;':a.path.endsWith('/api')?'export const api=globalThis.memberCorrectionHarness.api;':a.path.endsWith('/auth-context')?'export const {useAuth}=globalThis.memberCorrectionHarness;':'export default new Proxy({}, {get:(_,k)=>String(k)});'}));
}}]});
const module={exports:{}};new Function('module','exports',bundled.outputFiles[0].text)(module,module.exports);const Page=module.exports.default;
function resolve(n){if(Array.isArray(n))return n.map(resolve);if(!n||typeof n!=='object')return n;if(typeof n.type==='function')return resolve(n.type(n.props));return{...n,props:{...n.props,children:resolve(n.props?.children)}};}
async function settle(){for(let pass=0;pass<35;pass++){if(dirty){dirty=false;cursor=0;tree=resolve(Page());const work=effects;effects=[];work.forEach(cb=>cb());}await new Promise(done=>setImmediate(done));if(!dirty&&!effects.length)return;}assert.fail('Did not settle');}
function nodes(n=tree){if(Array.isArray(n))return n.flatMap(x=>nodes(x));if(!n||typeof n!=='object')return[];return[n,...nodes(n.props?.children ?? null)];}
function text(n=tree){if(Array.isArray(n))return n.map(text).join('');return n&&typeof n==='object'?text(n.props?.children ?? null):n==null||typeof n==='boolean'?'':String(n);}
const buttons=label=>nodes().filter(n=>n.type==='button'&&text(n)===label);
const button=label=>{const n=buttons(label)[0];assert.ok(n,`Missing ${label}`);return n;};
function open(){button('Correct to Female').props.onClick();}
function complete(){nodes().find(n=>n.type==='textarea').props.onChange({target:{value:'  Verified incorrect sex entry with field supervisor.  '}});nodes().find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});}
await settle();assert.equal(buttons('Correct to Female').length,1,'only male member inside own site offers correction');
open();await settle();assert.equal(button('Confirm correction').props.disabled,true);
if(process.env.MEMBER_CORRECTION_PREVIEW) {
 const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 function html(n){if(Array.isArray(n))return n.map(html).join('');if(!n||typeof n!=='object')return n==null||typeof n==='boolean'?'':escape(n);if(n.type==='fragment')return html(n.props.children);const attrs=Object.entries(n.props).filter(([k,v])=>!['children','ref'].includes(k)&&!k.startsWith('on')&&v!=null&&v!==false).map(([k,v])=>` ${k==='className'?'class':k}="${escape(v)}"`).join('');return `<${n.type}${attrs}>${html(n.props.children)}</${n.type}>`;}
 const css=['apps/admin/src/pages/HouseholdsPage.module.css','apps/admin/src/pages/HouseholdMemberCorrection.module.css'].map(p=>readFileSync(p,'utf8')).join('\n');
 writeFileSync(process.env.MEMBER_CORRECTION_PREVIEW,`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:16px;font:14px Arial;background:#f8fafc;height:100vh}${css}</style>${html(tree)}`);
}
let form=nodes().find(n=>n.type==='form');await form.props.onSubmit({preventDefault(){}});assert.equal(posts.length,0,'empty reason/confirmation must not submit');
complete();await settle();assert.equal(button('Confirm correction').props.disabled,false);
button('Cancel correction').props.onClick();await settle();assert.equal(posts.length,0);assert.ok(!nodes().some(n=>n.type==='form'));
open();await settle();complete();await settle();postError='Stale sex value; reload this member';
await nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await settle();assert.ok(text().includes(postError));assert.ok(nodes().some(n=>n.type==='form'),'failed request retains correction and reason');
postError=undefined;posts=[];let release;pendingPost=new Promise(done=>{release=done});
const save=nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await settle();assert.equal(button('Saving correction...').props.disabled,true);
release();pendingPost=undefined;await save;await settle();
assert.equal(posts.length,1);assert.deepEqual(posts[0],{path:'/members/2-39-0001-01-02/corrections',body:{field:'sex',old_value:1,new_value:2,reason:'Verified incorrect sex entry with field supervisor.'}});
assert.ok(text().includes('A BWQ task was created. Ask the assigned field worker to sync the app.'));
assert.ok(!nodes().some(n=>n.type==='form'));assert.equal(buttons('Correct to Female').length,0,'saved member refreshes as female');
for(const slot of slots)slot?.cleanup?.();slots=[];effects=[];dirty=true;members=structuredClone(initial);user={user_id:'observer',role:'site_investigator',site_id:2};await settle();assert.equal(buttons('Correct to Female').length,0,'read-only roles have no correction action');
console.log('Member sex correction UI: own-site male action, verified reason, cancellation, error retry, saving state, exact payload, refresh, and role restrictions passed.');
