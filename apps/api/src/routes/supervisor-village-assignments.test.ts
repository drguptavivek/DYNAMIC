import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { db, schema } from "../db";
import router from "./supervisor-village-assignments";
import { getSupervisorLocalities } from "../lib/supervisorVillageAssignments";

// In-memory query fixture: no PostgreSQL connection or shared data mutations.
test("supervisor village management enforces actor/site/locality scope and atomic replacement", async () => {
  const original = { select: db.select, transaction: db.transaction };
  const dialect = new PgDialect();
  let areas: any[] = [
    { user_id: "manager", site_id: 2, locality_code: "39", role: "site_data_manager", active_from: null, active_to: null },
    { user_id: "supervisor", site_id: 2, locality_code: "39", role: "field_supervisor", active_from: null, active_to: null },
    { user_id: "supervisor", site_id: 2, locality_code: "40", role: "field_supervisor", active_from: null, active_to: null },
    { user_id: "other", site_id: 2, locality_code: "39", role: "field_worker", active_from: null, active_to: null },
  ];
  let account: any = { user_id: "supervisor", username: "sup", display_name: "Supervisor", site_id: 2, role: "field_supervisor", active: true };
  const localities = [{ site_id: 2, locality_code: "39", locality_name: "Village 39" }, { site_id: 2, locality_code: "40", locality_name: "Village 40" }];
  const matches = (row: any, condition: any) => {
    const { sql, params } = dialect.sqlToQuery(condition);
    for (const match of sql.matchAll(/"[^"]+"\."([^"]+)" = \$(\d+)/g)) if (row[match[1]] !== params[Number(match[2])-1]) return false;
    for (const match of sql.matchAll(/"[^"]+"\."([^"]+)" in \(([^)]+)\)/g)) {
      const values = [...match[2].matchAll(/\$(\d+)/g)].map(m => params[Number(m[1])-1]);
      if (!values.includes(row[match[1]])) return false;
    }
    return true;
  };
  const select: any = () => ({ from(table: unknown) {
    let condition: any;
    const rows = () => (table === schema.users ? [account] : table === schema.studyLocalities ? localities : areas)
      .filter(row => !condition || matches(row, condition));
    const query: any = { where(value: any) { condition=value; return query; }, limit() { return Promise.resolve(rows()); },
      for() { return Promise.resolve(rows()); }, innerJoin() { return query; }, then(resolve: any, reject: any) { return Promise.resolve(rows()).then(resolve,reject); } };
    return query;
  } });
  let transactions = 0, failInsert = false;
  (db as any).select = select;
  (db as any).transaction = async (callback: any) => {
    transactions++;
    const before = structuredClone(areas);
    try { return await callback({ select,
      delete(table: unknown) { assert.equal(table, schema.userAreaAssignments); return { where: async (condition: any) => { areas=areas.filter(row=>!matches(row,condition)); } }; },
      insert(table: unknown) { assert.equal(table, schema.userAreaAssignments); return { values: async (values: any[]) => { if (failInsert) throw Error("Fixture insert failure"); areas.push(...values); } }; },
    }); } catch(error) { areas=before; throw error; }
  };
  async function request(method: "get"|"put", role: string, siteId: number|null, body?: any, query: any = {site_id: 2}) {
    const route=(router as any).stack.find((layer: any)=>layer.route?.methods[method]).route;
    const req={ user:{sub: role === "site_data_manager" ? "manager" : "admin", role, site_id:siteId}, body, query };
    let status=0,result:any;
    const res={status(value:number){status=value;return this;},json(value:any){result=value;}};
    const guard=(router as any).stack.find((layer:any)=>!layer.route).handle;
    let allowed=false; guard(req,res,()=>{allowed=true;});
    if(allowed) await route.stack[0].handle(req,res);
    return {status,result};
  }
  try {
    const options=await request("get","site_data_manager",2);
    assert.equal(options.status,200);
    assert.deepEqual(options.result.data.localities.map((x:any)=>x.locality_code),["39"]);
    assert.deepEqual(options.result.data.supervisors[0].assigned_locality_codes,["39"]);
    assert.equal((await request("get","site_data_manager",1)).status,403);
    assert.equal((await request("get","field_supervisor",2)).status,403);
    assert.equal((await request("put","site_data_manager",2,{supervisor_user_id:"supervisor",site_id:2,locality_codes:["40"]})).status,403);
    assert.equal(transactions,0);
    const saved=await request("put","site_data_manager",2,{supervisor_user_id:"supervisor",site_id:2,locality_codes:[]});
    assert.equal(saved.status,200);
    assert.deepEqual(areas.filter(x=>x.user_id==="supervisor").map(x=>x.locality_code),["40"],"Preserve assignments outside manager villages");
    assert.ok(areas.some(x=>x.user_id==="other"),"Preserve other roles and users");
    assert.equal((await request("put","central_admin",null,{supervisor_user_id:"supervisor",site_id:2,locality_codes:["39","40"]})).status,200);
    assert.deepEqual(areas.filter(x=>x.user_id==="supervisor").map(x=>x.locality_code),["39","40"]);
    account.role="field_worker";
    assert.equal((await request("put","central_admin",null,{supervisor_user_id:"supervisor",site_id:2,locality_codes:[]})).status,400);
    account.role="field_supervisor";
    failInsert=true;
    const before=structuredClone(areas), originalError=console.error;
    try { console.error=()=>{}; assert.equal((await request("put","central_admin",null,{supervisor_user_id:"supervisor",site_id:2,locality_codes:["39"]})).status,500); }
    finally { console.error=originalError; }
    assert.deepEqual(areas,before,"Failed replacement rolls back every area change");
    const user:any={sub:"supervisor",role:"field_supervisor",site_id:2};
    assert.deepEqual(await getSupervisorLocalities(user),["39","40"]);
    account.site_id=1; assert.deepEqual(await getSupervisorLocalities(user),[]);
    account.site_id=2;account.active=false;assert.deepEqual(await getSupervisorLocalities(user),[]);
    account.active=true;account.role="field_worker";assert.deepEqual(await getSupervisorLocalities(user),[]);
  } finally { Object.assign(db,original); }
});
