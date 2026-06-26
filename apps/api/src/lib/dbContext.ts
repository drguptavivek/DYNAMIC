import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "../db";

const dbContext = new AsyncLocalStorage<typeof db>();

export function getDb(): typeof db {
  return dbContext.getStore() ?? db;
}

export async function runWithDb<T>(client: typeof db, fn: () => Promise<T>): Promise<T> {
  return dbContext.run(client, fn);
}
