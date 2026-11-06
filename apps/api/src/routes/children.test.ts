import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import router from './children';
import { db, schema } from '../db';

test('children lists return the same child identity, age and locality contract with and without search', async () => {
  const original = db.select;
  const selections: any[] = [];
  const predicates: string[] = [];
  (db as any).select = (fields: any) => ({ from(table: any) {
    assert.equal(table, schema.children);
    const builder: any = {
      leftJoin() { return this; },
      where(condition: any) {
        if (condition) predicates.push(new PgDialect().sqlToQuery(condition).sql);
        if (fields.count) return Promise.resolve([{ count: 1 }]);
        selections.push(fields); return this;
      },
      orderBy() { return this; }, limit() { return this; },
      offset() { return Promise.resolve([{ child_id: 'child-1', sex: 2, birth_date: '2026-10-01', age_months: 1, locality_code: '39', mother_name: 'Mother' }]); },
    }; return builder;
  }});
  try {
    const handler = (router as any).stack.find((layer: any) => layer.route?.path === '/').route.stack.at(-1).handle;
    for (const search of ['', 'child-1']) {
      let body: any;
      await handler({ query: { search, site_id: '2', locality_code: '39', current_vital_status: 'alive' }, user: { sub: 'admin', role: 'central_admin' }, dataAccessProfile: { can_access_pii: false } }, {
        status(status: number) { assert.equal(status, 200); return this; }, json(value: any) { body = value; },
      });
      assert.equal(body.meta.total, 1);
      assert.deepEqual(body.data[0], { child_id: 'child-1', sex: 2, birth_date: '2026-10-01', age_months: 1, locality_code: '39', mother_name: null });
    }
    assert.ok(selections.length >= 2);
    for (const fields of selections) {
      assert.equal(fields.child_id, schema.children.child_id);
      assert.equal(fields.locality_code, schema.households.locality_code);
      const age = new PgDialect().sqlToQuery(fields.age_months).sql;
      assert.match(age, /Asia\/Kolkata/);
      assert.match(age, /else null end/);
    }
    assert.ok(predicates.every(query => query.includes('site_id') && query.includes('locality_code') && query.includes('current_vital_status')));
    assert.ok(predicates.some(query => query.includes('ilike')));
  } finally { (db as any).select = original; }
});
