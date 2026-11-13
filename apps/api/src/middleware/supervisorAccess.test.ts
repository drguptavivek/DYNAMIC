import assert from "node:assert/strict";
import test from "node:test";
import { supervisorRequestAllowed, requireAuth, optionalAuth } from "./auth";
import { signAccessToken } from "../lib/jwt";
import { markAccessSessionActive } from "../lib/tokenSessionCache";
import { getDataAccessProfile } from "../lib/dataAccess";

test("Supervisor route allowlist exposes only dashboard, profile and essential authentication", async () => {
  for (const path of ["/api/v1/dashboard/operations", "/api/v1/dashboard/assigned-households", "/api/v1/dashboard/household-forms", "/api/v1/users/me"]) {
    assert.ok(supervisorRequestAllowed("GET",path+"/?site_id=9"));
    assert.equal(supervisorRequestAllowed("PUT",path),false);
  }
  assert.ok(supervisorRequestAllowed("GET","/api/v1/dashboard/household-forms/attachments/image-1?user_id=worker"));
  assert.equal(supervisorRequestAllowed("POST","/api/v1/dashboard/household-forms/attachments/image-1"),false);
  assert.equal(supervisorRequestAllowed("GET","/api/v1/dashboard/household-forms/attachments/image-1/more"),false);
  for (const path of ["/api/v1/auth/logout", "/api/v1/auth/totp/setup", "/api/v1/auth/totp/enable"]) assert.ok(supervisorRequestAllowed("POST",path));
  for (const path of ["/api/v1/users", "/api/v1/users/me/qr-login", "/api/v1/households", "/api/v1/form-responses/export", "/api/v1/sync/pull", "/api/v1/supervisor-village-assignments", "/api/v1/dashboard/site-form-totals"]) {
    assert.equal(supervisorRequestAllowed("GET",path),false);
  }
  const profile=await getDataAccessProfile({role:"field_supervisor"} as any);
  assert.deepEqual(profile,{can_access_pii:true,can_access_raw_crfs:false,can_access_deidentified_exports:false,can_access_aggregate_dashboards:true,can_access_admin_audit:false});
});
test("both required and optional authentication block direct Supervisor reads and writes", async () => {
  const session="supervisor-auth-fixture";
  await markAccessSessionActive(session,new Date(Date.now()+60000));
  const token=signAccessToken({sub:"supervisor",username:"sup",role:"field_supervisor",site_id:2},session);
  for (const middleware of [requireAuth,optionalAuth]) for (const [method,path,allowed] of [
    ["GET","/api/v1/dashboard/operations?period=all",true],
    ["GET","/api/v1/households",false], ["POST","/api/v1/sync/push",false],
  ] as const) {
    let status=0,next=false;
    const req:any={headers:{authorization:"Bearer "+token},method,originalUrl:path};
    const res:any={status(value:number){status=value;return this;},json(){}};
    await middleware(req,res,()=>{next=true;});
    assert.equal(next,allowed);assert.equal(status,allowed?0:403);
  }
});
