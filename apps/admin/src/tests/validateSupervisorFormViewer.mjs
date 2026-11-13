import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

let slots=[],cursor=0,dirty=true,effects=[],tree,nextResponse;
const requests=[], downloads=[], createdUrls=[], revokedUrls=[];
let nextDownload;
const originalCreate=URL.createObjectURL, originalRevoke=URL.revokeObjectURL;
URL.createObjectURL=blob=>{assert(blob instanceof Blob);const url=`blob:test-${createdUrls.length+1}`;createdUrls.push(url);return url;};
URL.revokeObjectURL=url=>revokedUrls.push(url);
let closed=0;
let props={householdId:'2-20-0001-01',userId:'worker-one',siteId:2,localityCode:'20',period:'range',dateFrom:'2026-11-10',dateTo:'2026-11-12',onClose:()=>{closed++;}};
const response=(household=props.householdId)=>({household_id:household,forms:[
  {form_response_id:'bhq-1',form_code:'HHQ',form_version:'v1',definition_version:'v2',definition_note:'Current published definition used for this saved form.',subject_id:household,submitted_at:'2026-11-11T06:00:00Z',submitted_by_user_id:'worker-one',language_code:'hi',title:'Baseline Household Questionnaire',preview:[{name:'household',title:'Household details',questions:[{name:'head',title:'Head name',value:'Anita'},{name:'location',title:'GPS coordinates',value:'28.123, 77.456'},{name:'members',title:'Household members',panelRows:[{index:1,questions:[{name:'name',title:'Member name',value:'Member One'},{name:'sex',title:'Sex',value:'Female'}]},{index:2,questions:[{name:'name',title:'Member name',value:'Member Two'},{name:'age',title:'Age',value:'19'}]}]}]}]},
  {form_response_id:'bwq-2',form_code:'WQ',form_version:'v2',subject_id:`${household}-02`,submitted_at:'2026-11-12T06:00:00Z',submitted_by_user_id:'worker-one',language_code:'hi',title:'Baseline Woman Questionnaire',preview:[{name:'reproduction',title:'Pregnancy history',questions:[{name:'pregnant',title:'Are you pregnant?',value:'No'},{name:'children',title:'Children',panelRows:[{index:1,questions:[{name:'name',title:'Child name',value:'Child One'},{name:'outcome',title:'Outcome',value:'Live birth'}]},{index:2,questions:[{name:'name',title:'Child name',value:'Child Two'},{name:'outcome',title:'Outcome',value:'Stillbirth'}]}]},{name:'notes',title:'Notes',value:'<img src=x onerror=alert(1)>'}]}]},
]});
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
class FakeElement {focus(){document.activeElement=this;}contains(element){return element===this||controls.includes(element);}querySelectorAll(){return controls;}}
globalThis.HTMLElement=FakeElement;
const previousFocus=new FakeElement();
const listeners=new Map();
globalThis.document={activeElement:previousFocus,body:{style:{overflow:'auto'}},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
let controls=[];
globalThis.viewerHarness={
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{const next=typeof value==='function'?value(slots[i]):value;if(!Object.is(next,slots[i])){slots[i]=next;dirty=true;}}];},
  useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
  useEffect(callback,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=callback();});}},
  api:{get:async url=>{requests.push(url);const pending=nextResponse;nextResponse=undefined;return pending?await pending:structuredClone(response());},download:async url=>{downloads.push(url);const pending=nextDownload;nextDownload=undefined;return pending?await pending:new Blob(['image-bytes'],{type:'image/png'});}},
};
const result=await build({entryPoints:['apps/admin/src/components/SupervisorFormViewer.tsx'],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',plugins:[{name:'viewer-test',setup(builder){
  builder.onResolve({filter:/^(react|react\/jsx-runtime)$|\/lib\/api$|\.css$/},args=>({path:args.path,namespace:'mock'}));
  builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='react'?'export const {useState,useEffect,useRef}=globalThis.viewerHarness;':args.path==='react/jsx-runtime'?'export const jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;export const Fragment="fragment";':args.path.endsWith('/api')?'export const api=globalThis.viewerHarness.api;':'export default new Proxy({}, {get:(_,key)=>String(key)});'}));
}}]});
const module={exports:{}};new Function('module','exports',result.outputFiles[0].text)(module,module.exports);const Page=module.exports.default;
function resolve(node){if(Array.isArray(node))return node.map(resolve);if(!node||typeof node!=='object')return node;if(typeof node.type==='function')return resolve(node.type(node.props));const element=new FakeElement();if(node.props.ref)node.props.ref.current=element;const next={...node,props:{...node.props,children:resolve(node.props.children)}};if(node.type==='button'||node.type==='select'||node.props.tabIndex===0)controls.push(element);return next;}
async function settle(){for(let pass=0;pass<35;pass++){if(dirty){dirty=false;cursor=0;controls=[];tree=resolve(Page(props));const pending=effects;effects=[];pending.forEach(fn=>fn());}await new Promise(done=>setImmediate(done));if(!dirty&&!effects.length)return;}assert.fail('Viewer never settled');}
function nodes(node=tree){if(Array.isArray(node))return node.flatMap(item=>nodes(item??null));if(!node||typeof node!=='object')return [];return [node,...nodes(node.props?.children??null)];}
function text(node=tree){if(Array.isArray(node))return node.map(item=>text(item??null)).join('');return node&&typeof node==='object'?text(node.props?.children??null):node==null||typeof node==='boolean'?'':String(node);}
const button=label=>{const found=nodes().find(n=>n.type==='button'&&text(n)===label);assert.ok(found,label);return found;};
const selection=()=>nodes().find(n=>n.type==='select');
async function click(label){await button(label).props.onClick();await settle();}
function snapshot(name="saved-form-viewer"){if(!process.env.SUPERVISOR_PREVIEW_DIR)return;const escape=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');function html(node){if(Array.isArray(node))return node.map(html).join('');if(!node||typeof node!=='object')return node==null||typeof node==='boolean'?'':escape(node);if(node.type==='fragment')return html(node.props.children);const attrs=Object.entries(node.props).filter(([key,v])=>!['children','ref'].includes(key)&&!key.startsWith('on')&&v!=null&&v!==false).map(([key,v])=>` ${key==='className'?'class':key==='tabIndex'?'tabindex':key}="${escape(v)}"`).join('');return `<${node.type}${attrs}>${html(node.props.children)}</${node.type}>`;}writeFileSync(`${process.env.SUPERVISOR_PREVIEW_DIR}/${name}.html`,`<!doctype html><meta charset="utf-8"><style>body{margin:0;font:14px Arial}*{box-sizing:border-box}${readFileSync('apps/admin/src/components/SupervisorFormViewer.module.css','utf8')}</style>${html(tree).replace(/blob:test-\d+/g,"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=")}`);}
let resolveFirst;nextResponse=new Promise(resolve=>{resolveFirst=resolve;});await settle();assert(text().includes('Loading saved forms...'));assert.equal(document.body.style.overflow,'hidden');assert(nodes().some(n=>n.props.role==='dialog'&&n.props['aria-modal']==='true'));
resolveFirst(response());await settle();
const params=new URLSearchParams(requests[0].split('?')[1]);assert.equal(params.get('household_id'),props.householdId);assert.equal(params.get('user_id'),'worker-one');assert.equal(params.get('period'),'range');assert.equal(params.get('date_from'),'2026-11-10');assert.equal(params.get('date_to'),'2026-11-12');assert.equal(params.get('site_id'),'2');assert.equal(params.get('locality_code'),'20');
assert(text().includes('Current published definition used for this saved form.'));assert(text().includes('Definition version: v2'));assert(text(selection()).includes('BHQ'));assert(text(selection()).includes('BWQ'));assert(text().includes('Member One')&&text().includes('Member Two'));assert(text().includes('GPS coordinates'));assert(text().includes('28.123, 77.456'));assert(text().includes('Entry 1')&&text().includes('Entry 2'));
assert.equal(nodes().filter(n=>n.type==='button').length,1,'Preview exposes close only');assert(!nodes().some(n=>['input','textarea','form'].includes(n.type)),'No editing or submit controls');assert(!nodes().some(n=>n.props.dangerouslySetInnerHTML),'Text never rendered as HTML');
snapshot();selection().props.onChange({target:{value:'bwq-2'}});await settle();assert(text().includes('Child One')&&text().includes('Child Two'));assert(text().includes('Live birth')&&text().includes('Stillbirth'));assert(text().includes('<img src=x onerror=alert(1)>'));assert(!nodes().some(n=>n.type==='img'));
let prevented=false;listeners.get('keydown')({key:'Escape',preventDefault(){prevented=true;}});assert.equal(closed,1);assert(prevented);
document.activeElement=controls.at(-1);listeners.get('keydown')({key:'Tab',shiftKey:false,preventDefault(){}});assert.equal(document.activeElement,controls[0]);document.activeElement=controls[0];listeners.get('keydown')({key:'Tab',shiftKey:true,preventDefault(){}});assert.equal(document.activeElement,controls.at(-1));
let resolveOld;nextResponse=new Promise(resolve=>{resolveOld=resolve;});props={...props,householdId:'2-20-0002-01',period:'date',date:'2026-11-12'};dirty=true;await settle();assert(!text().includes('Member One'),'Prior household data removed while loading');
props={...props,householdId:'2-20-0003-01',period:'all'};dirty=true;await settle();assert(text().includes('2-20-0003-01'));resolveOld(response('2-20-0002-01'));await settle();assert(!text().includes('2-20-0002-01'),'Late response ignored');assert(text().includes('2-20-0003-01'));
assert(!new URLSearchParams(requests.at(-1).split('?')[1]).has('date'),'All data does not carry date filters');
nextResponse=Promise.reject(new Error('Village access revoked'));props={...props,householdId:'2-20-0004-01'};dirty=true;await settle();assert(text().includes('Village access revoked'));assert(nodes().some(n=>n.props.role==='alert'));await click('Try again');assert(!text().includes('Village access revoked'));assert(text().includes('2-20-0004-01'));
nextResponse=Promise.resolve({household_id:'2-20-0004-01',forms:[]});await click('Close');props={...props,period:'today'};dirty=true;await settle();assert(text().includes('No saved forms match'));
nextResponse=Promise.resolve(response('wrong-household'));props={...props,period:'date'};dirty=true;await settle();assert(text().includes('could not be verified'));assert(!text().includes('Member One'));
const imageResponse=response();
imageResponse.forms[0].attachments=[{attachment_id:'anc-image',question_name:'head',display_name:'ANC card',report_sequence:1,image_sequence:1,ultrasound_date:null,mime_type:'image/png'},{attachment_id:'extra-image',question_name:'hidden-file-field',display_name:'Ultrasound report',report_sequence:2,image_sequence:1,ultrasound_date:'2026-11-10',mime_type:'image/jpeg'}];
imageResponse.forms[1].attachments=[{attachment_id:'bwq-image',question_name:'notes',display_name:'BWQ report',report_sequence:1,image_sequence:1,ultrasound_date:null,mime_type:'image/png'}];
let resolveImage;nextDownload=new Promise(resolve=>{resolveImage=resolve;});nextResponse=Promise.resolve(imageResponse);await click('Try again');
assert.equal(downloads.length,2,'Only the selected form image files are fetched');assert(downloads.every(url=>!url.includes('bwq-image')));assert(text().includes('Loading image...'));assert(text().includes('Uploaded images'));assert(text().includes('2026-11-10'));
assert.equal(nodes().filter(n=>n.type==='img').length,1);
const imageParams=new URLSearchParams(downloads[0].split('?')[1]);assert.equal(imageParams.get('household_id'),props.householdId);assert.equal(imageParams.get('user_id'),'worker-one');assert.equal(imageParams.get('period'),'date');assert.equal(imageParams.get('date'),'2026-11-12');assert(!downloads[0].includes('access_token'),'Bearer helper used without credentials in URL');
resolveImage(new Blob(['anc'],{type:'image/png'}));await settle();assert.equal(nodes().filter(n=>n.type==='img').length,2);assert(nodes().filter(n=>n.type==='img').every(n=>n.props.src.startsWith('blob:')&&n.props.alt));
const headAnswer=nodes().find(n=>n.props.className==='answer'&&text(n).includes('Head name'));assert(nodes(headAnswer).some(n=>n.type==='img'&&n.props.alt.includes('ANC card')),'Matching images render inside their question');
snapshot('saved-form-viewer-images');
const firstUrls=nodes().filter(n=>n.type==='img').map(n=>n.props.src);
nextDownload=Promise.reject(new Error('Image access expired'));selection().props.onChange({target:{value:'bwq-2'}});await settle();assert(firstUrls.every(url=>revokedUrls.includes(url)),'Form change revokes old blob URLs');assert(text().includes('Image access expired'));assert(!nodes().some(n=>n.type==='img'));
await click('Retry images');assert.equal(nodes().filter(n=>n.type==='img').length,1);assert(nodes().some(n=>n.type==='img'&&n.props.alt.includes('BWQ report')));const bwqUrl=nodes().find(n=>n.type==='img').props.src;
let staleImage;nextDownload=new Promise(resolve=>{staleImage=resolve;});selection().props.onChange({target:{value:'bhq-1'}});await settle();assert(revokedUrls.includes(bwqUrl));const urlsBeforeStale=createdUrls.length;
props={...props,householdId:'2-20-0008-01'};dirty=true;await settle();assert(!nodes().some(n=>n.type==='img'),'New household never shows previous household image');staleImage(new Blob(['old-image']));await settle();assert.equal(createdUrls.length,urlsBeforeStale,'Cancelled image downloads never create object URLs');
nextResponse=Promise.resolve({...response(),forms:[{...response().forms[0],attachments:[imageResponse.forms[0].attachments[0]]}]});props={...props,period:'all'};dirty=true;await settle();assert.equal(nodes().filter(n=>n.type==='img').length,1);const finalUrl=nodes().find(n=>n.type==='img').props.src;
slots.forEach(slot=>slot?.cleanup?.());assert(revokedUrls.includes(finalUrl),'Closing viewer revokes its object URLs');URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;
assert.equal(document.body.style.overflow,'auto');assert.equal(document.activeElement,previousFocus);assert.equal(listeners.has('keydown'),false);
const actualApi=await build({entryPoints:['apps/admin/src/lib/api.ts'],bundle:true,write:false,format:'cjs',platform:'node',define:{'import.meta.env.VITE_API_BASE_URL':'"/api/v1"'}});
const apiModule={exports:{}};new Function('module','exports',actualApi.outputFiles[0].text)(apiModule,apiModule.exports);
const savedFetch=globalThis.fetch,savedStorage=globalThis.localStorage;let authenticatedRequest;
globalThis.localStorage={getItem:key=>key==='access_token'?'test-bearer':null};globalThis.fetch=async(url,options)=>{authenticatedRequest={url,options};return new Response(new Blob(['private-image'],{type:'image/png'}),{status:200});};
try {const blob=await apiModule.exports.api.download('/dashboard/household-forms/attachments/anc-image?household_id=2-20-0001-01&user_id=worker-one&period=all');assert(blob instanceof Blob);assert.equal(authenticatedRequest.options.headers.Authorization,'Bearer test-bearer');assert(!authenticatedRequest.url.includes('test-bearer'));assert(authenticatedRequest.url.startsWith('/api/v1/dashboard/household-forms/attachments/'));} finally {globalThis.fetch=savedFetch;if(savedStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=savedStorage;}
console.log('Saved form viewer readonly, repeat rows, authenticated inline images, object URL cleanup, cancellation and keyboard checks passed');
