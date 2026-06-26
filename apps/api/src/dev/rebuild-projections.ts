import {
  rebuildAllProjectionRows,
  rebuildHouseholdProjections,
  rebuildPregnancyProjection,
} from "../services/projectionReplay";

function getArgValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) {
    return process.argv[index + 1] ?? null;
  }

  return null;
}

async function main() {
  const householdId = getArgValue("household-id");
  const pregnancyId = getArgValue("pregnancy-id");

  if (householdId && pregnancyId) {
    throw new Error("Use either --household-id or --pregnancy-id, not both");
  }

  const result = pregnancyId
    ? await rebuildPregnancyProjection(pregnancyId)
    : householdId
      ? await rebuildHouseholdProjections(householdId)
      : await rebuildAllProjectionRows();

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
