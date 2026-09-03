import assert from "node:assert";

import { LIST_PAGE_SIZE, getPagedItems } from "../lib/listPaging.js";

function makeItems(count) {
  return Array.from({ length: count }, (_, index) => index);
}

function run() {
  assert.strictEqual(LIST_PAGE_SIZE, 100, "LIST_PAGE_SIZE should default to 100");

  // Empty list.
  {
    const result = getPagedItems([], 1);
    assert.deepStrictEqual(result.items, []);
    assert.strictEqual(result.hasMore, false);
    assert.strictEqual(result.total, 0);
    assert.strictEqual(result.shown, 0);
  }

  // Fewer than a page.
  {
    const items = makeItems(37);
    const result = getPagedItems(items, 1);
    assert.strictEqual(result.items.length, 37);
    assert.deepStrictEqual(result.items, items);
    assert.strictEqual(result.hasMore, false);
    assert.strictEqual(result.total, 37);
    assert.strictEqual(result.shown, 37);
  }

  // Exactly 100.
  {
    const items = makeItems(100);
    const result = getPagedItems(items, 1);
    assert.strictEqual(result.items.length, 100);
    assert.strictEqual(result.hasMore, false);
    assert.strictEqual(result.total, 100);
    assert.strictEqual(result.shown, 100);
  }

  // 250 items across pages 1, 2, 3.
  {
    const items = makeItems(250);

    const page1 = getPagedItems(items, 1);
    assert.strictEqual(page1.shown, 100);
    assert.strictEqual(page1.total, 250);
    assert.strictEqual(page1.hasMore, true);
    assert.deepStrictEqual(page1.items, items.slice(0, 100));

    const page2 = getPagedItems(items, 2);
    assert.strictEqual(page2.shown, 200);
    assert.strictEqual(page2.total, 250);
    assert.strictEqual(page2.hasMore, true);
    assert.deepStrictEqual(page2.items, items.slice(0, 200));

    const page3 = getPagedItems(items, 3);
    assert.strictEqual(page3.shown, 250);
    assert.strictEqual(page3.total, 250);
    assert.strictEqual(page3.hasMore, false);
    assert.deepStrictEqual(page3.items, items.slice(0, 250));

    // A page beyond the data should clamp to the full set, not error.
    const page4 = getPagedItems(items, 4);
    assert.strictEqual(page4.shown, 250);
    assert.strictEqual(page4.hasMore, false);
  }

  // Custom pageSize.
  {
    const items = makeItems(45);
    const page1 = getPagedItems(items, 1, 20);
    assert.strictEqual(page1.shown, 20);
    assert.strictEqual(page1.hasMore, true);
    assert.strictEqual(page1.total, 45);

    const page2 = getPagedItems(items, 2, 20);
    assert.strictEqual(page2.shown, 40);
    assert.strictEqual(page2.hasMore, true);

    const page3 = getPagedItems(items, 3, 20);
    assert.strictEqual(page3.shown, 45);
    assert.strictEqual(page3.hasMore, false);
  }

  console.log("validateListPaging: all assertions passed");
}

run();
