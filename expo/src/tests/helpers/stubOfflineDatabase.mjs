/**
 * Lets tests exercise taskSchema.js (and anything that requires it, e.g.
 * householdSync.js) for real, against a fake in-memory db, instead of the
 * native/web SQLite bindings pulled in by the real
 * ../modules/storage/offlineDatabase.js (which imports react-native, and
 * isn't loadable under a plain tsx/node process).
 *
 * These are plain CommonJS-style .js files (no "type": "module" in
 * package.json) transpiled by tsx, so `import` inside them compiles down to
 * `require`. That means we can pre-populate Node's CJS module cache
 * (Module._cache) for the exact resolved path of offlineDatabase.js with a
 * fake module whose exports return our fake db - Node's require() then
 * returns the cached fake instead of reading/executing the real file, so the
 * real file (and its react-native import) is never touched.
 *
 * Call this once per test process, before requiring taskSchema.js or any
 * module that transitively requires it.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const helperRoot = path.dirname(fileURLToPath(import.meta.url));
const offlineDatabasePath = path.resolve(helperRoot, "../../modules/storage/offlineDatabase.js");

export function stubOfflineDatabase(fakeDb, importMetaUrl) {
  const require = createRequire(importMetaUrl);

  const Module = require("module");
  const fakeModule = new Module(offlineDatabasePath);
  fakeModule.filename = offlineDatabasePath;
  fakeModule.loaded = true;
  fakeModule.exports = { getOfflineDatabase: () => fakeDb };
  Module._cache[offlineDatabasePath] = fakeModule;

  return require;
}
