/**
 * Owns the native Expo SQLite connection shared by offline repositories.
 */
import * as SQLite from "expo-sqlite";

const DATABASE_NAME = "dynamic_offline.db";

let database = null;

export function getOfflineDatabase() {
  if (!database) {
    database = SQLite.openDatabaseSync(DATABASE_NAME);
  }
  return database;
}
