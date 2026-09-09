/**
 * Cooperative-yield helpers for chunking heavy synchronous SQLite work
 * (getAllSync/runSync execute on the JS thread and block rendering) so a
 * running sync can hand control back to the UI thread between chunks
 * instead of freezing it for the whole batch.
 */

export function yieldToUi() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export const CHUNK_SIZE = 200;

/**
 * Splits items into chunks of `size`, awaiting `fn(chunk)` for each chunk and
 * yielding to the UI thread between chunks (not after the last one).
 * @param {Array} items
 * @param {number} size
 * @param {(chunk: Array) => Promise<void>|void} fn
 */
export async function forEachChunk(items, size, fn) {
  if (!Array.isArray(items) || items.length === 0) return;
  const chunkSize = Number.isFinite(size) && size > 0 ? size : items.length;

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await fn(chunk);
    if (i + chunkSize < items.length) {
      await yieldToUi();
    }
  }
}
