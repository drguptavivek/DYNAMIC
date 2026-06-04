export function getPagination(query: Record<string, unknown>): {
  page: number;
  perPage: number;
  offset: number;
} {
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10));
  const perPage = Math.min(100, Math.max(1, parseInt(String(query.per_page ?? "50"), 10)));
  return { page, perPage, offset: (page - 1) * perPage };
}
