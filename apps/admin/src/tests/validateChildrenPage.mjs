import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
let slots=[],cursor=0,effects=[],dirty=true,tree;
const requests=[];
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
globalThis.childrenHarness={
 useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;dirty=true;}];},
 useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},
 useCallback(callback,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,callback};return slots[i].callback;},
 useEffect(callback,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){slots[i]?.cleanup?.();const slot=slots[i]={deps};effects.push(()=>{slot.cleanup=callback();});}},
 api:{getPage:path=>new Promise((resolve,reject)=>requests.push({path,resolve,reject}))}
};
const result=await build({entryPoints:[fileURLToPath(new URL('../pages/ChildrenPage.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',plugins:[{name:'children-fixtures',setup(b){
 b.onResolve({filter:/^(react|react\/jsx-runtime|react-router-dom)$|\/lib\/api$|\.module\.css$/},a=>({path:a.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='react'?'export const {useState,useEffect,useRef,useCallback}=globalThis.childrenHarness;':a.path==='react/jsx-runtime'?'export const Fragment="fragment",jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;':a.path==='react-router-dom'?'export const Link="link";':a.path.endsWith('/api')?'export const api=globalThis.childrenHarness.api;':'export default new Proxy({}, {get:(_,key)=>key});'}));
}}]});
const compiled={exports:{}};new Function('module','exports',result.outputFiles[0].text)(compiled,compiled.exports);
function render(){for(let i=0;i<15&&dirty;i++){dirty=false;cursor=0;tree=compiled.exports.default();effects.splice(0).forEach(cb=>cb());}}
const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
const text=n=>n&&typeof n==='object'?[n.props?.children].flat(Infinity).map(text).join(''):String(n??'');
const field=label=>nodes(tree).find(n=>n.props?.['aria-label']===label);
const button=label=>nodes(tree).find(n=>n.type==='button'&&text(n)===label);
const flush=async()=>{await new Promise(done=>setImmediate(done));render();};
const last=()=>requests.at(-1);
async function resolve(data=[],total=data.length){const page=Number(new URL(last().path,'https://test.invalid').searchParams.get('page'));last().resolve({data,meta:{total,page,per_page:20}});await flush();}
function change(label,value){field(label).props.onChange({target:{value}});render();}
const row={child_id:'2-39-0001-01-02-1-1',sex:2,birth_date:'2026-10-01',age_months:1,birth_status:'live_birth',current_vital_status:'alive',locality_code:'39',mother_name:'Example Mother'};
render();assert.match(text(tree),/Loading children/);assert.equal(button('Next').props.disabled,true);
await resolve();assert.match(text(tree),/No children registered from study pregnancy outcomes yet/);assert.equal(nodes(tree).find(n=>n.type==='link').props.to,'/household-members');
change('Child or mother ID','none');await resolve();assert.match(text(tree),/No children match these filters/);assert.ok(!text(tree).includes('No children registered'));
change('Child or mother ID',' child-1 ');const old=last();change('Child or mother ID','2-39');assert.equal(new URL(last().path,'https://test.invalid').searchParams.get('search'),'2-39');await resolve([row],21);assert.ok(text(tree).includes(row.child_id));assert.ok(text(tree).includes('Female'));assert.ok(text(tree).includes('1m'));assert.ok(text(tree).includes('39'));assert.ok(text(tree).includes(row.mother_name));assert.equal(nodes(tree).find(n=>n.type==='tr'&&n.key===row.child_id)?.key,row.child_id);
old.resolve({data:[{...row,child_id:'STALE'}],meta:{total:1,page:1,per_page:20}});await flush();assert.ok(!text(tree).includes('STALE'));
button('Next').props.onClick();render();assert.equal(new URL(last().path,'https://test.invalid').searchParams.get('page'),'2');assert.equal(button('Previous').props.disabled,true);await resolve([row],21);assert.match(text(tree),/Page 2 of 2/);
change('Vital status','dead');assert.equal(new URL(last().path,'https://test.invalid').searchParams.get('page'),'1');assert.equal(new URL(last().path,'https://test.invalid').searchParams.get('current_vital_status'),'dead');last().reject(new Error('Cannot load registry'));await flush();assert.ok(nodes(tree).some(n=>n.props?.role==='alert'));assert.match(text(tree),/Count unavailable/);assert.ok(!text(tree).includes('No children registered'));assert.equal(button('Next').props.disabled,true);
button('Retry').props.onClick();render();await resolve([{...row,sex:1}],1);assert.ok(text(tree).includes('Male'));assert.ok(!text(tree).includes('Cannot load registry'));assert.ok(!text(tree).includes('Count unavailable'));
console.log('Children UI: real API child identity/sex/age/locality, registry versus filtered empty states, pagination, errors/retry and stale replies passed.');
