export const LIST_PAGE_SIZE = 100;

/**
 * Pure helper: slices `items` down to the first `page * pageSize` entries.
 * No React imports here so this stays trivially unit-testable.
 *
 * @param {Array} items - full in-memory list (already filtered/sorted/grouped).
 * @param {number} page - 1-based page number.
 * @param {number} pageSize - rows per page (default LIST_PAGE_SIZE).
 * @returns {{ items: Array, hasMore: boolean, total: number, shown: number }}
 */
export function getPagedItems(items, page, pageSize = LIST_PAGE_SIZE) {
  const source = Array.isArray(items) ? items : [];
  const total = source.length;
  const safePageSize = Number(pageSize) > 0 ? Number(pageSize) : LIST_PAGE_SIZE;
  const safePage = Number(page) > 0 ? Number(page) : 1;
  const limit = safePage * safePageSize;
  const paged = source.slice(0, limit);
  const shown = paged.length;
  const hasMore = shown < total;
  return { items: paged, hasMore, total, shown };
}
