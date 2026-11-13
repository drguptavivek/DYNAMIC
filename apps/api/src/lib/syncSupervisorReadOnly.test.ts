import assert from "node:assert/strict";
import test from "node:test";
import { db,schema } from "../db";
import router from "../routes/sync";
test("legacy tokenless sync rejects supervisor device owners and record actors while preserving worker outboxes",async()=>{
  const original={select:db.select,insert:db.insert};
  let responses:any[][]=[],writes:any[]=[];
  (db as any).select=()=>({from:()=>({where:()=>({limit:async()=>responses.shift()||[]})})});
  (db as any).insert=(table:any)=>({values:async(row:any)=>{writes.push({table,row});}});
  const handler=(router as any).stack.find((layer:any)=>layer.route?.path==="/push").route.stack.at(-1).handle;
  async function push(ownerRole:string,records:any[]=[],actorRole?:string) {
    writes=[];responses=[[{device_id:"device",user_id:"owner",authorized:true}],[{role:ownerRole}]];
    if(actorRole) responses.push([{user_id:"actor",username:"actor",role:actorRole,site_id:2,active:true}]);
    let status=0,result:any;
    await handler({body:{device_id:"device",records}},{status(value:number){status=value;return this;},json(value:any){result=value;}});
    return {status,result};
  }
  try{
    assert.equal((await push("field_supervisor",[{type:"form_response",data:{id:"form",user_id:"worker"}}])).status,403);
    assert.equal(writes.length,0,"Supervisor-owned device cannot impersonate worker through tokenless upload");
    assert.equal((await push("field_worker",[{type:"form_response",data:{id:"form",user_id:"actor"}}],"field_supervisor")).status,403);
    assert.equal(writes.length,0,"Supervisor acting identity cannot write or log sync");
    const worker=await push("field_worker");assert.equal(worker.status,200);assert.equal(worker.result.data.accepted,0);
    assert.equal(writes.length,1);assert.equal(writes[0].table,schema.syncLogs,"Normal worker outbox flow unchanged");
  }finally{Object.assign(db,original);}
});
