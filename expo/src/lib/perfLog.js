/**
 * Lightweight app timing log that works in release builds.
 *
 * Spans (form open, draft save, sync, worklist load, app init, ...) are
 * buffered in memory and flushed to the `app_timings` SQLite table on native
 * (localStorage on web). The profile screen summarises them and exports the
 * raw rows as JSON through the share sheet, so they can be analysed off the
 * device without a debugger.
 *
 * No react-native imports here: this module is unit-tested in Node.
 */

export const PERF_LOG_MAX_ROWS = 10000;
export const PERF_LOG_WEB_KEY = "dynamic_app_timings_v1";
const FLUSH_DELAY_MS = 750;
const MAX_BUFFER = 200;

const config = {
  enabled: true,
  getDb: null, // () => sqlite-like db with runSync/getAllSync
  appVersion: "",
  deviceId: "",
  now: () => Date.now(),
  monotonic:
    typeof globalThis.performance?.now === "function"
      ? () => globalThis.performance.now()
      : () => Date.now(),
};

let buffer = [];
let flushTimer = null;

export function configurePerfLog(options = {}) {
  Object.assign(config, options);
}

export function __resetPerfLogForTests() {
  buffer = [];
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}

function hasWebStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

async function resolveDb() {
  if (config.getDb) return config.getDb();
  if (hasWebStorage()) return null;
  const { getDb } = await import("../modules/tasks/taskSchema.js");
  return getDb();
}

function safeJson(value) {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/** Adds one finished span. `durationMs` is required; `meta` is any small object. */
export function recordTiming({ name, durationMs, meta = null, at } = {}) {
  if (!config.enabled || !name) return null;
  const row = {
    name: String(name),
    duration_ms: Math.max(0, Math.round(Number(durationMs) * 100) / 100),
    meta: safeJson(meta),
    at: at || new Date(config.now()).toISOString(),
    app_version: config.appVersion || null,
    device_id: config.deviceId || null,
  };
  buffer.push(row);
  if (buffer.length >= MAX_BUFFER) {
    flushPerfLog().catch(() => {});
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushPerfLog().catch(() => {});
    }, FLUSH_DELAY_MS);
  }
  return row;
}

/**
 * Starts a span. Returns `end(extraMeta)`, which records it and returns the
 * duration in ms. Calling end twice is a no-op.
 */
export function startTiming(name, meta = null) {
  const startedAt = config.monotonic();
  let done = false;
  return function end(extraMeta) {
    if (done) return null;
    done = true;
    const durationMs = config.monotonic() - startedAt;
    const merged =
      meta || extraMeta ? { ...(meta || {}), ...(extraMeta || {}) } : null;
    recordTiming({ name, durationMs, meta: merged });
    return durationMs;
  };
}

/** Times an async function; records `ok: false` with the error name on failure. */
export async function timeAsync(name, fn, meta = null) {
  const end = startTiming(name, meta);
  try {
    const result = await fn();
    end({ ok: true });
    return result;
  } catch (error) {
    end({ ok: false, error: error?.name || "Error" });
    throw error;
  }
}

function readWebRows() {
  try {
    const rows = JSON.parse(window.localStorage.getItem(PERF_LOG_WEB_KEY) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeWebRows(rows) {
  window.localStorage.setItem(PERF_LOG_WEB_KEY, JSON.stringify(rows));
}

export async function flushPerfLog() {
  if (!buffer.length) return 0;
  const rows = buffer;
  buffer = [];
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const db = await resolveDb();
  if (!db) {
    if (!hasWebStorage()) return 0;
    const existing = readWebRows();
    const merged = [...existing, ...rows].slice(-PERF_LOG_MAX_ROWS);
    writeWebRows(merged);
    return rows.length;
  }
  try {
    db.runSync("BEGIN");
    for (const row of rows) {
      db.runSync(
        "INSERT INTO app_timings (name, duration_ms, meta, at, app_version, device_id) VALUES (?, ?, ?, ?, ?, ?)",
        [row.name, row.duration_ms, row.meta, row.at, row.app_version, row.device_id]
      );
    }
    db.runSync(
      `DELETE FROM app_timings WHERE id IN (
         SELECT id FROM app_timings ORDER BY id DESC LIMIT -1 OFFSET ?
       )`,
      [PERF_LOG_MAX_ROWS]
    );
    db.runSync("COMMIT");
  } catch (error) {
    try {
      db.runSync("ROLLBACK");
    } catch {
      // ignore
    }
    console.warn("Could not persist app timings:", error);
  }
  return rows.length;
}

export async function listTimings({ limit = PERF_LOG_MAX_ROWS } = {}) {
  await flushPerfLog();
  const db = await resolveDb();
  if (!db) {
    return hasWebStorage() ? readWebRows().slice(-limit) : [];
  }
  const rows = db.getAllSync(
    "SELECT id, name, duration_ms, meta, at, app_version, device_id FROM app_timings ORDER BY id DESC LIMIT ?",
    [limit]
  );
  return rows.reverse();
}

export async function clearTimings() {
  buffer = [];
  const db = await resolveDb();
  if (!db) {
    if (hasWebStorage()) window.localStorage.removeItem(PERF_LOG_WEB_KEY);
    return;
  }
  db.runSync("DELETE FROM app_timings");
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

/** Per-name count / avg / p50 / p95 / max, sorted by total time descending. */
export function summarizeTimings(rows = []) {
  const byName = new Map();
  for (const row of rows) {
    const name = String(row?.name || "");
    if (!name) continue;
    const value = Number(row.duration_ms);
    if (!Number.isFinite(value)) continue;
    if (!byName.has(name)) byName.set(name, { durations: [], lastAt: "" });
    const entry = byName.get(name);
    entry.durations.push(value);
    if (String(row.at || "") > entry.lastAt) entry.lastAt = String(row.at || "");
  }
  return [...byName.entries()]
    .map(([name, { durations, lastAt }]) => {
      const sorted = [...durations].sort((a, b) => a - b);
      const total = sorted.reduce((sum, value) => sum + value, 0);
      return {
        name,
        count: sorted.length,
        totalMs: Math.round(total),
        avgMs: Math.round(total / sorted.length),
        p50Ms: Math.round(percentile(sorted, 50)),
        p95Ms: Math.round(percentile(sorted, 95)),
        maxMs: Math.round(sorted[sorted.length - 1]),
        lastAt,
      };
    })
    .sort((a, b) => b.totalMs - a.totalMs);
}

/** JSON document with metadata, per-name summary and raw rows (meta parsed). */
export function buildTimingExport(rows = [], { appVersion = config.appVersion, deviceId = config.deviceId, exportedAt } = {}) {
  const timings = rows.map((row) => {
    let meta = null;
    try {
      meta = row.meta ? JSON.parse(row.meta) : null;
    } catch {
      meta = row.meta;
    }
    return {
      name: row.name,
      duration_ms: Number(row.duration_ms),
      at: row.at,
      meta,
      app_version: row.app_version || null,
    };
  });
  return JSON.stringify(
    {
      kind: "dynamic-app-timings",
      version: 1,
      exported_at: exportedAt || new Date(config.now()).toISOString(),
      app_version: appVersion || null,
      device_id: deviceId || null,
      row_count: timings.length,
      summary: summarizeTimings(rows),
      timings,
    },
    null,
    2
  );
}
