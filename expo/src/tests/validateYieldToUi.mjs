/**
 * Pure test for the chunk+yield helper syncService uses to keep heavy
 * synchronous SQLite batch work from freezing the UI thread during a sync.
 */
import assert from "node:assert/strict";

const { yieldToUi, forEachChunk, CHUNK_SIZE } = await import("../lib/yieldToUi.js");

assert.equal(typeof CHUNK_SIZE, "number");
assert.ok(CHUNK_SIZE > 0);

// yieldToUi resolves on its own (a macrotask boundary), not synchronously.
{
  let resolved = false;
  const promise = yieldToUi().then(() => {
    resolved = true;
  });
  assert.equal(resolved, false);
  await promise;
  assert.equal(resolved, true);
}

// forEachChunk splits items at the given chunk boundaries, in order.
{
  const seenChunks = [];
  await forEachChunk([1, 2, 3, 4, 5], 2, async (chunk) => {
    seenChunks.push(chunk);
  });
  assert.deepEqual(seenChunks, [[1, 2], [3, 4], [5]]);
}

// forEachChunk awaits fn(chunk) fully before starting the next chunk.
{
  const events = [];
  await forEachChunk([1, 2, 3, 4], 2, async (chunk) => {
    events.push(`start:${chunk.join(",")}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    events.push(`end:${chunk.join(",")}`);
  });
  assert.deepEqual(events, ["start:1,2", "end:1,2", "start:3,4", "end:3,4"]);
}

// forEachChunk yields to the UI thread between chunks, but not after the last one.
{
  let yieldCount = 0;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, delay, ...args) => {
    if (delay === 0) yieldCount += 1;
    return originalSetTimeout(fn, delay, ...args);
  };
  try {
    await forEachChunk([1, 2, 3, 4, 5], 2, async () => {});
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
  // 3 chunks -> 2 yields between them, none after the last chunk.
  assert.equal(yieldCount, 2);
}

// A single chunk (items.length <= size) never yields.
{
  let yieldCount = 0;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, delay, ...args) => {
    if (delay === 0) yieldCount += 1;
    return originalSetTimeout(fn, delay, ...args);
  };
  try {
    await forEachChunk([1, 2], 5, async () => {});
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
  assert.equal(yieldCount, 0);
}

// Empty/invalid input is a no-op and never calls fn.
{
  let calls = 0;
  await forEachChunk([], 10, async () => {
    calls += 1;
  });
  await forEachChunk(undefined, 10, async () => {
    calls += 1;
  });
  await forEachChunk(null, 10, async () => {
    calls += 1;
  });
  assert.equal(calls, 0);
}

// A non-positive/invalid size falls back to a single chunk of all items.
{
  const seenChunks = [];
  await forEachChunk([1, 2, 3], 0, async (chunk) => {
    seenChunks.push(chunk);
  });
  assert.deepEqual(seenChunks, [[1, 2, 3]]);
}

console.log("Yield-to-UI chunk helper validation passed");
