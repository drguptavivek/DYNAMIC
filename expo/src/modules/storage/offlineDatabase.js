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

  const nativeRequire = eval("require");
  return nativeRequire("expo-sqlite");
}

export function getOfflineDatabase() {
  if (!database) {
    const SQLite = getSQLiteModule();
    database = SQLite.openDatabaseSync(DATABASE_NAME);
  }
  return database;
}
