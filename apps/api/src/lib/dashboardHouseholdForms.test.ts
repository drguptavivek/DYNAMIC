import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { dashboardScope } from "./operationsDashboard";
import { householdCompletedFormsSql,buildCompletedFormPreview,savedFormAnswers } from "./dashboardHouseholdForms";
import { getFormJson, getAllFormMetadata } from "./formCatalog";
const now=new Date("2026-11-13T12:00:00Z");
const supervisor:any={sub:"sup",role:"field_supervisor",site_id:2};

test("saved form read query binds household, submitting staff, current allocation and supervisor villages",()=>{
  const dialect=new PgDialect();
  for(const period of ["all","today","date","range"]) {
    const scope=dashboardScope(supervisor,{user_id:"worker",site_id:"9",locality_code:"39",period,
      ...(period==="date"?{date:"2026-11-02"}:{}),...(period==="range"?{date_from:"2026-11-01",date_to:"2026-11-02"}:{})},now,["39"]);
    const {sql,params}=dialect.sqlToQuery(householdCompletedFormsSql(scope,"2-39-0001-01"));
    assert.ok(params.includes("2-39-0001-01"));assert.ok(params.includes("worker"));assert.ok(params.includes(2));
    assert.ok(!params.includes(9),"Requested foreign site cannot broaden supervisor scope");
    assert.match(sql,/h\.locality_code in/);assert.match(sql,/f\.submitted_by_user_id=/);
    assert.match(sql,/field_worker_household_assignments a join users u/);
    assert.match(sql,/u\.site_id=h\.site_id/);assert.match(sql,/a\.household_id=h\.household_id and a\.user_id=/);
    assert.match(sql,/coalesce\(f\.response_status,'primary'\)='primary'/);
    assert.match(sql,/t\.status in \('completed','completed_on_time','completed_late'\)/);
    assert.match(sql,/wq_result_interview'='1'/);assert.match(sql,/hhq_result_interview'='10'/);
    assert.match(sql,/h\.baseline_enrollment_status='enrolled'/);
    assert.ok(params.includes(period==="range"||period==="date"?"2026-11-02T18:30:00.000Z":"2026-11-13T18:30:00.000Z"),"Inclusive IST end date");
    if(period==="range") assert.ok(params.includes("2026-11-01T00:00:00+05:30"));
  }
  const denied=dialect.sqlToQuery(householdCompletedFormsSql(dashboardScope(supervisor,{user_id:"worker"},now,[]),"hh"));
  assert.match(denied.sql,/and false/);
  assert.throws(()=>householdCompletedFormsSql(dashboardScope(supervisor,{},now,["39"]),"hh"),/INVALID_USER/);
  assert.throws(()=>householdCompletedFormsSql(dashboardScope(supervisor,{user_id:"worker"},now,["39"]),["hh"]),/INVALID_HOUSEHOLD/);
});
test("native review uses human-readable saved choices and separate member rows without altering answers",()=>{
  const answers={hhq_site_id:2,hhq_language_questionnaire:7,hhq_competent_respondent_available:1,
    hhq_consent_study_provide_pis_explain_study_adult_member:1,
    hhq_gps_latitude:28.12345,hhq_gps_longitude:77.12345,
    hhq_household_members:[{member_name:"First",member_sex:2,member_age_years:25},{member_name:"Second",member_sex:1,member_age_years:30}],hhq_result_interview:1};
  const before=structuredClone(answers);
  const rendered=buildCompletedFormPreview(getFormJson("HHQ")!,answers);
  assert.equal(rendered.language_code,"en");assert.ok(rendered.preview.length>1);
  const text=JSON.stringify(rendered.preview);assert.match(text,/First/);assert.match(text,/Second/);assert.match(text,/female/i);assert.match(text,/28.12345/);
  assert.ok(rendered.preview.some((page:any)=>page.questions.some((q:any)=>q.panelRows?.length===2)));
  assert.deepEqual(answers,before,"Read-only review must not modify persisted answers");
});

test("all bundled questionnaires render with the exact shared app model factory",()=>{
  for(const form of getAllFormMetadata()) {
    const result=buildCompletedFormPreview(getFormJson(form.form_code)!,{});
    assert.ok(Array.isArray(result.preview),form.form_code);
    assert.equal(typeof result.title,"string",form.form_code);
  }
  assert.deepEqual(savedFormAnswers('{"example":1}'),{example:1});
  assert.deepEqual(savedFormAnswers("not-json"),{});
});
