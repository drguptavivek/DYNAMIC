import assert from "node:assert/strict";
import test from "node:test";
import { db,schema } from "../db";
import router from "./dashboard-household-forms";
test("saved form endpoint rejects invalid actors and filters before database reads",async()=>{
  const original=db.execute;const originalSelect=db.select;let reads=0;let formRows:any[]=[];
  (db as any).select=(columns:any)=>({from:(table:any)=>({where:async()=>{
    if(table!==schema.formAttachments)return [];
    assert.deepEqual(Object.keys(columns).sort(),["attachment_id","question_name","display_name","report_sequence","image_sequence","ultrasound_date","mime_type"].sort());
    return [{attachment_id:"image",question_name:"anc",display_name:"ANC card",report_sequence:1,image_sequence:1,ultrasound_date:null,mime_type:"image/png"}];
  }})});
  (db as any).execute=async()=>{reads++;return {rows:formRows};};
  const handler=(router as any).stack.find((layer:any)=>layer.route).route.stack.at(-1).handle;
  async function get(role:string,query:any){let status=0,body:any;await handler({user:{sub:"actor",role,site_id:2},query},{status(value:number){status=value;return this;},json(value:any){body=value;},setHeader(){}});return {status,body};}
  try{
    assert.equal((await get("field_worker",{household_id:"hh",user_id:"worker"})).status,403);
    assert.equal((await get("central_admin",{household_id:"hh"})).status,400);
    assert.equal((await get("site_data_manager",{household_id:"hh",user_id:"worker",period:"range",date_from:"2026-11-03",date_to:"2026-11-01"})).status,400);
    assert.equal(reads,0);
    const result=await get("site_data_manager",{household_id:"hh",user_id:"worker",period:"all"});
    assert.equal(result.status,200);assert.deepEqual(result.body.data,{household_id:"hh",forms:[]});assert.equal(reads,1);
    formRows=[{form_response_id:"saved",form_code:"HHQ",form_version:"historic",site_id:2,submitted_by_user_id:"worker",
      submitted_at:"2026-11-13",prefill_snapshot_json:JSON.stringify({hhq_site_id:2,hhq_household_members:[{member_name:"Saved Member",member_sex:2}]}),
      answers_json:JSON.stringify({hhq_language_questionnaire:7,hhq_competent_respondent_available:1,hhq_consent_study_provide_pis_explain_study_adult_member:1,hhq_result_interview:1})}];
    const filled=await get("site_data_manager",{household_id:"hh",user_id:"worker",period:"all"});
    assert.equal(filled.status,200);assert.equal(filled.body.data.forms[0].form_version,"historic");
    assert.ok(filled.body.data.forms[0].definition_version);assert.match(filled.body.data.forms[0].definition_note,/currently published/);
    assert.match(JSON.stringify(filled.body.data.forms[0].preview),/Saved Member/);
    assert.equal(filled.body.data.forms[0].attachments[0].display_name,"ANC card");
    assert.equal(filled.body.data.forms[0].attachments[0].relative_path,undefined);
    assert.equal(filled.body.data.forms[0].answers_json,undefined,"Only labeled app review output is exposed");

  }finally{(db as any).execute=original;(db as any).select=originalSelect;}
});
