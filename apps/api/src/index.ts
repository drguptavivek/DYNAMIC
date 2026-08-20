import "dotenv/config";
import { createApp } from "./app";
import { ensureDatabaseReady } from "./lib/dbEnsure";

const PORT = process.env.PORT || 3310;

async function main() {
  // Recreate schema + dev seed automatically when the database was reset, so
  // the API, admin console, and field app stay functional without manual
  // db-push/db-seed steps (development runs only).
  await ensureDatabaseReady();

  const app = createApp();

  app.listen(PORT, () => {
    console.log(`DYNAMIC API listening on port ${PORT}`);
  });
}

void main();

