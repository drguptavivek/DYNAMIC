import assert from "node:assert/strict";
import { test } from "node:test";
import router from "./corrections";

async function memberCorrection(role: string, body: unknown) {
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === "/members/:id/corrections" && entry.route.methods.post);
  const req: any = { params: { id: "member" }, user: { sub: "actor", role, site_id: 1 }, body };
  let status = 200;
  let response: any;
  const res: any = { status: (value: number) => { status = value; return res; },
    json: (value: unknown) => { response = value; return res; } };
  let authorized = false;
  layer.route.stack[0].handle(req, res, () => { authorized = true; });
  if (authorized) await layer.route.stack[1].handle(req, res);
  return { status, response };
}

test("Site Data Manager may reach strict sex validation but cannot broaden legacy correction fields", async () => {
  assert.equal((await memberCorrection("site_data_manager", { field: "sex", old_value: 1, new_value: 2, reason: " " })).status, 400);
  assert.equal((await memberCorrection("site_data_manager", { field: "name", old_value: "A", new_value: "B" })).status, 403);
  assert.equal((await memberCorrection("field_worker", { field: "sex", old_value: 1, new_value: 2, reason: "verified" })).status, 403);
});

test("unsupported and reverse sex changes cannot reach the legacy direct-update path", async () => {
  for (const role of ["central_admin", "site_research_scientist"]) {
    for (const body of [{ field: "sex", old_value: 2, new_value: 1, reason: "verified" },
      { field: "sex", old_value: "1", new_value: "2", reason: "verified" }]) {
      assert.equal((await memberCorrection(role, body)).status, 400);
    }
  }
});

test("generic changes require preview and strict supported fields before database access", async () => {
  for (const body of [{ changes: { sex: 2 }, reason: "Verified" },
    { changes: { name: "Changed" }, reason: "Verified", preview_token: "a".repeat(64) },
    { changes: { wq_pregnant: 3 }, reason: "Verified", preview_token: "a".repeat(64) }]) {
    assert.equal((await memberCorrection("site_data_manager", body)).status, 400);
  }
});

test("field staff cannot reach correction context or preview", () => {
  for (const path of ["/members/:id/correction-context", "/members/:id/correction-preview"]) {
    const route = (router as any).stack.find((entry: any) => entry.route?.path === path).route;
    let status = 200, next = false;
    const res: any = { status: (value: number) => { status = value; return res; }, json: () => res };
    route.stack[0].handle({ user: { role: "field_worker" } }, res, () => { next = true; });
    assert.equal(status, 403); assert.equal(next, false);
  }
});
