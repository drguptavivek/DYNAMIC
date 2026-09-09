import { useEffect, useMemo, useState } from "react";

import { LIST_PAGE_SIZE, getPagedItems } from "./listPaging.js";

/**
 * React hook wrapper around getPagedItems. Resets to page 1 whenever the
 * `items` array identity changes (i.e. whenever filters/search/data change
 * and the caller passes a freshly-computed array).
 *
 * @param {Array} items - full in-memory list to page over.
 * @param {number} pageSize - rows per page (default LIST_PAGE_SIZE).
 */
export function useListPaging(items, pageSize = LIST_PAGE_SIZE) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [items]);

  const { items: pagedItems, hasMore, total, shown } = useMemo(
    () => getPagedItems(items, page, pageSize),
    [items, page, pageSize],
  );

  function showMore() {
    setPage((prev) => (hasMore ? prev + 1 : prev));
  }

  return { pagedItems, hasMore, showMore, shown, total };
}
