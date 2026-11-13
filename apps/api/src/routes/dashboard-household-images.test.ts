import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import os from "node:os";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {PgDialect} from "drizzle-orm/pg-core";
import {db,schema} from "../db";
import router from "./dashboard-household-forms";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=","base64");
test("inline image request rechecks current supervisor scope, completed form ownership and image safety",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"dynamic-dashboard-route-image-"));
  const original={select:db.select,execute:db.execute};const originalRoot=process.env.IMAGE_UPLOAD_ROOT;
  process.env.IMAGE_UPLOAD_ROOT=root;
  const form={form_response_id:"saved",form_code:"PEF",submitted_by_user_id:"worker"};
  let forms:any[]=[form],assigned=true;
  let attachment:any={attachment_id:"image",form_response_id:"saved",household_id:"hh",form_code:"PEF",uploaded_by_user_id:"worker",relative_path:"imageuploads/image.png",mime_type:"image/png"};
  const dialect=new PgDialect();let fileLookups=0;
  (db as any).execute=async(query:any)=>({rows:dialect.sqlToQuery(query).sql.includes("and false")?[]:forms});
  (db as any).select=()=>({from(table:unknown){const chain:any={innerJoin(){return chain;},where(condition:any){
    const rows=table===schema.users?[{user_id:"sup",role:"field_supervisor",site_id:2,active:true}]:table===schema.userAreaAssignments?(assigned?[{locality_code:"39",active_from:null,active_to:null}]:[]):[attachment];
    if(table===schema.formAttachments){fileLookups++;const compiled=dialect.sqlToQuery(condition);assert.ok(compiled.params.includes("image"));assert.ok(compiled.params.includes("saved"));assert.ok(compiled.params.includes("hh"));}
    return {limit:async()=>rows,then(resolve:any,reject:any){return Promise.resolve(rows).then(resolve,reject);}};
  }};return chain;}});
  const handler=(router as any).stack.find((layer:any)=>layer.route?.path==="/attachments/:id").route.stack.at(-1).handle;
  async function image(query:any={household_id:"hh",user_id:"worker",period:"all"},id="image"){
    let status=200,body:any;const headers:any={};
    await handler({user:{sub:"sup",role:"field_supervisor",site_id:2},params:{id},query},{setHeader(name:string,value:any){headers[name]=value;},status(value:number){status=value;return this;},json(value:any){body=value;},send(value:any){body=value;}});
    return {status,body,headers};
  }
  try{
    await writeFile(path.join(root,"image.png"),png);
    const success=await image();assert.equal(success.status,200);assert.deepEqual(success.body,png);
    assert.equal(success.headers["Content-Type"],"image/png");assert.equal(success.headers["Cache-Control"],"no-store");assert.equal(success.headers["X-Content-Type-Options"],"nosniff");
    fileLookups=0;assigned=false;assert.equal((await image()).status,404);assert.equal(fileLookups,0,"Revoked village blocks bytes before attachment lookup");assigned=true;
    forms=[];assert.equal((await image()).status,404);forms=[form];
    attachment.form_response_id="foreign";assert.equal((await image()).status,404);attachment.form_response_id="saved";
    attachment.uploaded_by_user_id="other";assert.equal((await image()).status,404);attachment.uploaded_by_user_id="worker";
    attachment.household_id="foreign";assert.equal((await image()).status,404);attachment.household_id="hh";
    assert.equal((await image(undefined,"../image")).status,404);
    attachment.mime_type="image/svg+xml";assert.equal((await image()).status,415);attachment.mime_type="image/png";
    attachment.relative_path="imageuploads/../outside.png";assert.equal((await image()).status,404);
    attachment.relative_path="imageuploads/missing.png";assert.equal((await image()).status,404);
    assert.equal((await image({household_id:"hh",period:"all"})).status,400);
  }finally{Object.assign(db,original);if(originalRoot===undefined)delete process.env.IMAGE_UPLOAD_ROOT;else process.env.IMAGE_UPLOAD_ROOT=originalRoot;await rm(root,{recursive:true,force:true});}
});
