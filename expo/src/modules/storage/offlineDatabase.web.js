/**
 * Owns the web SQLite shim connection shared by offline repositories.
 */
import * as WebSQLite from "../../shims/expo-sqlite.web.js";

const DATABASE_NAME = "dynamic_offline.db";

let database = null;

export function getOfflineDatabase() {
  if (!database) {
    database = WebSQLite.openDatabaseSync(DATABASE_NAME);
  }
  return database;
}
