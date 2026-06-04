import { Client } from "pg";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test";

function getMaintenanceUrl(databaseUrl: string): { maintenanceUrl: string; databaseName: string } {
  const url = new URL(databaseUrl);
  const databaseName = url.pathname.replace(/^\//, "");

  if (!databaseName) {
    throw new Error("TEST_DATABASE_URL must include a database name");
  }

  url.pathname = "/postgres";
  return { maintenanceUrl: url.toString(), databaseName };
}

async function ensureTestDatabase() {
  const { maintenanceUrl, databaseName } = getMaintenanceUrl(testDatabaseUrl);
  const client = new Client({ connectionString: maintenanceUrl });
  await client.connect();

  try {
    const existing = await client.query("select 1 from pg_database where datname = $1", [
      databaseName,
    ]);

    if (existing.rowCount === 0) {
      await client.query(`create database ${quoteIdentifier(databaseName)}`);
      console.log(`Created test database ${databaseName}`);
    } else {
      console.log(`Test database ${databaseName} already exists`);
    }
  } finally {
    await client.end();
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

ensureTestDatabase().catch((error) => {
  console.error(error);
  process.exit(1);
});
