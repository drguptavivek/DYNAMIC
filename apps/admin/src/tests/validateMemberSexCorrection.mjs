import assert from 'node:assert/strict';
import { build } from 'esbuild';
let user={user_id:'manager',role:'site_data_manager',site_id:2};
let confirmAnswer=true, prompts=[], posts=[], contextError='', previewError='', applyError='';
let saved=[], parentBusy=[], currentMember;
const member={household_member_id:'2-39-0001-01-02',household_id:'2-39-0001-01',member_number:2,name:'Example Member',sex:1,site_id:2};
const context={member_id:member.household_member_id,household_id:member.household_id,name:member.name,current:{sex:1,reported_age_years:10,marital_status:1,wq_pregnant:null},source_response_id:null,fields:[{key:'sex',label:'Sex',type:'choice',editable:true,options:[{value:1,label:'Male'},{value:2,label:'Female'}]},{key:'reported_age_years',label:'Age recorded at BHQ',type:'number',min:0,max:120,editable:true},{key:'marital_status',label:'Marital status',type:'choice',editable:true,options:[{value:1,label:'Currently married'},{value:7,label:'Never married'}]},{key:'wq_pregnant',label:'Pregnancy answer in saved BWQ',type:'choice',editable:false,options:[{value:1,label:'Yes'},{value:2,label:'No'},{value:98,label:'Unsure'}]}]};
let impact={preview_token:'current-fingerprint',changes:[{field:'sex',label:'Sex',old_value:1,new_value:2},{field:'reported_age_years',label:'Age recorded at BHQ',old_value:10,new_value:20}],tasks_to_create:[{form_code:'WQ',target_date:'2026-11-01'}],tasks_to_withdraw:[],warnings:[],can_apply:true};
globalThis.window={confirm:prompt=>{prompts.push(prompt);return confirmAnswer;}};
let slots=[],cursor=0,dirty=true,effects=[],tree, Page, pageProps={};
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
globalThis.memberCorrectionHarness={useAuth:()=>({user}),useParams:()=>({}),
 useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;dirty=true;}];},
 useEffect(callback,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=callback();});}},
 api:{getPage:async()=>({data:[member,{...member,household_member_id:'outside',site_id:4}],meta:{total:2,page:1,per_page:50}}),get:async()=>{if(contextError)throw new Error(contextError);return structuredClone(context);},post:async(path,body)=>{posts.push({path,body});if(path.endsWith('/correction-preview')){if(previewError)throw new Error(previewError);return structuredClone(impact);}if(applyError)throw new Error(applyError);return{message:'Correction saved.',created_tasks:1,withdrawn_tasks:0};}}
};
async function bundle(entry,mockPanel=false){const compiled=await build({entryPoints:[entry],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',plugins:[{name:'member-correction-mocks',setup(b){
 b.onResolve({filter:/^(react|react\/jsx-runtime|react-router-dom)$|\/lib\/(api|auth-context)$|\.css$/},a=>({path:a.path,namespace:'mock'}));
 if(mockPanel)b.onResolve({filter:/\/components\/MemberCorrectionPanel$/},a=>({path:a.path,namespace:'panel'}));
 b.onLoad({filter:/.*/,namespace:'panel'},()=>({contents:'export default props=>({type:"section",props:{...props,"data-panel":true}});'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='react'?'export const {useState,useEffect}=globalThis.memberCorrectionHarness;':a.path==='react/jsx-runtime'?'export const jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;export const Fragment="fragment";':a.path==='react-router-dom'?'export const {useParams}=globalThis.memberCorrectionHarness;':a.path.endsWith('/api')?'export const api=globalThis.memberCorrectionHarness.api;':a.path.endsWith('/auth-context')?'export const {useAuth}=globalThis.memberCorrectionHarness;':'export default new Proxy({}, {get:(_,k)=>String(k)});'}));
 }}]});const module={exports:{}};new Function('module','exports',compiled.outputFiles[0].text)(module,module.exports);return module.exports.default;}
function resolve(n){if(Array.isArray(n))return n.map(resolve);if(!n||typeof n!=='object')return n;if(typeof n.type==='function')return resolve(n.type(n.props));return{...n,props:{...n.props,children:resolve(n.props?.children)}};}
async function settle(){for(let pass=0;pass<35;pass++){if(dirty){dirty=false;cursor=0;tree=resolve(Page(pageProps));const work=effects;effects=[];work.forEach(cb=>cb());}await new Promise(done=>setImmediate(done));if(!dirty&&!effects.length)return;}assert.fail('Did not settle');}
function nodes(n=tree){if(Array.isArray(n))return n.flatMap(x=>nodes(x));if(!n||typeof n!=='object')return[];return[n,...nodes(n.props?.children ?? null)];}
function text(n=tree){if(Array.isArray(n))return n.map(text).join('');return n&&typeof n==='object'?text(n.props?.children ?? null):n==null||typeof n==='boolean'?'':String(n);}
const buttons=label=>nodes().filter(n=>n.type==='button'&&text(n)===label);
const button=label=>{const n=buttons(label)[0];assert.ok(n,`Missing ${label}`);return n;};
const field=label=>{const n=nodes().find(n=>n.props?.['aria-label']===label);assert.ok(n,label);return n;};
function reset(){for(const s of slots)s?.cleanup?.();slots=[];effects=[];dirty=true;}
Page=await bundle('apps/admin/src/pages/HouseholdMembersPage.tsx',true);await settle();assert.equal(buttons('Correct details').length,1,'only own-site members can be corrected');
confirmAnswer=false;button('Correct details').props.onClick();await settle();assert.ok(!nodes().some(n=>n.props?.['data-panel']));assert.equal(posts.length,0);
assert.ok(prompts[0].includes(member.name)&&prompts[0].includes(member.household_member_id));
confirmAnswer=true;button('Correct details').props.onClick();await settle();assert.ok(nodes().some(n=>n.props?.['data-panel']));
reset();user={...user,role:'site_investigator'};await settle();assert.equal(buttons('Correct details').length,0);
reset();Page=await bundle('apps/admin/src/components/MemberCorrectionPanel.tsx');pageProps={member,onCancel:()=>{},onSaved:m=>saved.push(m),onBusyChange:b=>parentBusy.push(b)};
contextError='Could not load current values';await settle();assert.ok(text().includes(contextError));assert.ok(!nodes().some(n=>n.type==='form'));
contextError='';button('Reload correction details').props.onClick();await settle();assert.equal(field('Pregnancy answer in saved BWQ').props.disabled,true,'cannot invent pregnancy before accepted BWQ');
assert.equal(button('Preview changes and tasks').props.disabled,true);
field('Sex').props.onChange({target:{value:'2'}});field('Age recorded at BHQ').props.onChange({target:{value:'20'}});nodes().find(n=>n.type==='textarea').props.onChange({target:{value:'  Verified member age and sex with supervisor.  '}});await settle();
previewError='Preview unavailable';await nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await settle();assert.ok(text().includes(previewError));assert.equal(buttons('Confirm corrections').length,0);
previewError='';await nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await settle();assert.ok(text().includes('Review before saving'));assert.equal(button('Confirm corrections').props.disabled,true);assert.deepEqual(posts.at(-1).body,{changes:{sex:2,reported_age_years:20},reason:'Verified member age and sex with supervisor.'});
nodes().find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});await settle();
confirmAnswer=false;const count=posts.length;await button('Confirm corrections').props.onClick();await settle();assert.equal(posts.length,count,'Cancel final confirmation never writes');
confirmAnswer=true;applyError='The preview is stale';await button('Confirm corrections').props.onClick();await settle();assert.ok(text().includes(applyError));assert.equal(buttons('Confirm corrections').length,0,'stale save requires new preview');assert.equal(saved.length,0);
applyError='';impact={...impact,can_apply:false,warnings:['Completed PEF needs central review.']};await nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await settle();assert.ok(text().includes(impact.warnings[0]));assert.equal(buttons('Confirm corrections').length,0);
impact={...impact,can_apply:true,warnings:[]};await nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await settle();
field('Age recorded at BHQ').props.onChange({target:{value:'21'}});await settle();assert.equal(buttons('Confirm corrections').length,0,'changing values invalidates impact preview');
await nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await settle();nodes().find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});await settle();await button('Confirm corrections').props.onClick();await settle();
assert.equal(posts.at(-1).body.preview_token,'current-fingerprint');assert.equal(posts.at(-1).body.changes.reported_age_years,21);assert.equal(saved.length,1);assert.ok(saved[0].includes('sync the app'));assert.equal(parentBusy.at(-1),false);
console.log('Generic correction UI: role/site, initial confirmation, context retry, source-aware fields, multi-field preview, blocked impact, stale retry, final confirmation, invalidation and exact save payload passed.');
