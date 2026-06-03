import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(root, "../data/forms");
const catalogPath = path.resolve(root, "../data/forms/index.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

if (!Array.isArray(catalog) || catalog.length === 0) {
  throw new Error("Form catalog is empty.");
}

for (const item of catalog) {
  const formPath = path.join(dataDir, item.file_name);
  const form = JSON.parse(fs.readFileSync(formPath, "utf8"));
  if (!form.form_code || !form.pages?.length) {
    throw new Error(`${item.file_name} is missing form_code or pages.`);
  }
  for (const page of form.pages) {
    if (!Array.isArray(page.elements)) {
      throw new Error(`${form.form_code} page ${page.name} has no elements array.`);
    }
  }
}

console.log(`Validated ${catalog.length} bundled questionnaires.`);
