import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export function renderMastersPage() {
  return readFileSync(join(backendRoot, "index.html"), "utf8");
}
