import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

test("saved English overrides reach synced forms, native text and version checksums", async () => {
  const sourceForm = {
    title: "Household form",
    pages: [{ name: "page", elements: [{
      name: "water", type: "radiogroup", title: "Water source", description: "Choose one",
      choices: [{ value: 1, text: "Piped water" }, { value: 2, text: "Well" }],
    }] }],
    nativeText: { save: "Save" },
  };
  const sourceBefore = JSON.stringify(sourceForm);
  const stored: Record<string, unknown> = { hi: { water: { title: "Hindi water", choices: { "1": "Hindi pipe" } } } };
  const fields = { site_id: "site_id", form_code: "form_code", language_code: "language_code", translations_json: "translations_json" };
  const modules: Record<string, unknown> = {
    "node:crypto": { createHash },
    "drizzle-orm": { eq: (field: string, value: unknown) => ({ field, value }), and: (...conditions: unknown[]) => conditions },
    "../db": { schema: { formLanguageTranslations: fields }, db: {
      select() { return { from() { return { where(conditions: { field: string; value: string }[]) {
        const language = conditions.find(condition => condition.field === "language_code")!.value;
        return Promise.resolve(stored[language] ? [{ site_id: 0, translations_json: stored[language] }] : []);
      } }; } }; },
      insert() { return { values(row: { site_id: number; form_code: string; language_code: string; translations_json: unknown }) {
        assert.equal(row.site_id, 0);
        assert.equal(row.form_code, "HHQ");
        return { async onConflictDoUpdate() { stored[row.language_code] = row.translations_json; } };
      } }; },
    } },
    "./formCatalog": {
      getFormJson: (code: string) => code === "HHQ" ? sourceForm : null,
      getLatestFormMetadata: (code: string) => code === "HHQ" ? { form_code: code, version: "1", checksum: "bundled" } : null,
      getAllFormMetadata: () => [{ form_code: "HHQ", version: "1", checksum: "bundled" }],
    },
    "../../../../shared/formTranslation.cjs": require("../../../../shared/formTranslation.cjs"),
  };
  const compiled = ts.transpileModule(readFileSync(new URL("./formLanguage.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: any = {};
  runInNewContext(compiled, { exports, require(name: string) {
    assert.ok(name in modules, `Unexpected dependency ${name}`);
    return modules[name];
  } });
  const before = await exports.getEffectiveFormMetadata("HHQ", 1);
  const english = {
    "@form": { title: "Updated household form" },
    water: { title: "Updated water source", description: "Select one source", choices: { "1": "Water piped home" } },
    "@native:save": { title: "Save interview" },
  };
  await exports.saveFormTranslations({ siteId: 1, formCode: "hhq", languageCode: " EN ", translations: english });
  const effective = await exports.getEffectiveFormJson("HHQ", 1);
  const question = effective.pages[0].elements[0];
  assert.equal(effective.title.en, english["@form"].title);
  assert.equal(question.title.en, english.water.title);
  assert.equal(question.description.en, english.water.description);
  assert.equal(question.choices[0].text.en, english.water.choices["1"]);
  assert.equal(question.choices[1].text, "Well", "Unedited English retains its bundled text");
  assert.equal(question.title.hi, "Hindi water");
  assert.equal(question.choices[0].text.hi, "Hindi pipe");
  assert.equal(effective.native_form_translations.en["@native:save"].title, "Save interview");
  assert.equal(effective.native_form_translations.en.water.title, english.water.title);
  assert.equal(effective.native_form_translations.hi.water.title, "Hindi water");
  assert.equal(JSON.stringify(sourceForm), sourceBefore, "Applying edits never mutates the bundled source");
  const after = await exports.getEffectiveFormMetadata("HHQ", 1);
  assert.notEqual(after.checksum, before.checksum);
  assert.equal(after.checksum, createHash("sha256").update(JSON.stringify(effective)).digest("hex"));
  const manifest = await exports.getEffectiveFormVersionManifest(1);
  assert.equal(manifest[0].checksum, after.checksum);
  const batch = await exports.getRequestedEffectiveFormsWithJson(["HHQ", "missing"], 1);
  assert.equal(batch.length, 1);
  assert.equal(batch[0].checksum, after.checksum);
  assert.equal(batch[0].json.pages[0].elements[0].title.en, english.water.title);
  english.water.title = "Revised water question";
  await exports.saveFormTranslations({ siteId: 1, formCode: "HHQ", languageCode: "en", translations: english });
  assert.notEqual((await exports.getEffectiveFormMetadata("HHQ", 1)).checksum, after.checksum);
  assert.equal(await exports.getEffectiveFormJson("missing", 1), null);
});
