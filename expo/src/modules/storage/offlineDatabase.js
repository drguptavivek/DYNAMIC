/**
 * Owns the single Expo SQLite connection shared by offline repositories in this JS runtime.
 */
import { Platform } from "react-native";

import * as WebSQLite from "../../shims/expo-sqlite.web.js";

const DATABASE_NAME = "dynamic_offline.db";

let database = null;

function getSQLiteModule() {
  if (Platform.OS === "web") {
    return WebSQLite;
  }

  // Metro resolves this require statically at bundle time. It must stay a
  // plain require (not eval("require"), which breaks release bundles because
  // require is module-scoped, not a global) and must only execute on native
  // runtimes; the web branch above returns the shim first.
  return require("expo-sqlite");
}

export function getOfflineDatabase() {
  if (!database) {
    const SQLite = getSQLiteModule();
    database = SQLite.openDatabaseSync(DATABASE_NAME);
  }
  return database;
}
