/**
 * Minimal in-memory fake matching the subset of the expo-sqlite sync API
 * (runSync / getAllSync / getFirstSync) that taskSchema.js and the
 * repositories built on it use. Records every call so tests can assert on
 * exact SQL issued and ordering, and lets tests seed canned query results.
 */
export function createFakeSqliteDb({ getAllSyncResults = () => [] } = {}) {
  const calls = [];

  return {
    calls,
    runSync(sql, params = []) {
      calls.push({ method: "runSync", sql, params });
      return { changes: 0 };
    },
    getAllSync(sql, params = []) {
      calls.push({ method: "getAllSync", sql, params });
      return getAllSyncResults(sql, params);
    },
    getFirstSync(sql, params = []) {
      calls.push({ method: "getFirstSync", sql, params });
      const rows = getAllSyncResults(sql, params);
      return (rows && rows[0]) || null;
    },
  };
}
