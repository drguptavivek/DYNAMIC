import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getAllFormMetadata, getFormJson, getPreparedFormJson } from "./formCatalog";
import { getPreparedSurveyJson } from "../../../../expo/src/modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import { flattenFormText, applyFormTextTranslations, extractFormTextTranslations } from "../../../../shared/formTranslation.cjs";

test("all twelve admin inventories exactly match Android preparation and keep raw protocol JSON intact", () => {
  for (const metadata of getAllFormMetadata()) {
    const raw = getFormJson(metadata.form_code)!;
    const before = structuredClone(raw);
    const prepared = getPreparedFormJson(metadata.form_code)!;
    assert.deepEqual(prepared, getPreparedSurveyJson(raw), metadata.form_code);
    assert.deepEqual(raw, before);
    const rows = flattenFormText(prepared);
    assert.ok(rows.length > 0);
    assert.equal(new Set(rows.map(row => row.name)).size, rows.length, `${metadata.form_code}: unique translation keys`);
    const dictionary = Object.fromEntries(rows.map(row => [row.name, { ...(row.title && { title: `HI:${row.title}`.trim() }), ...(row.description && { description: `HI:${row.description}`.trim() }), ...(row.choices.length && { choices: Object.fromEntries(row.choices.map(choice => [choice.value, `HI:${choice.text}`.trim()])) }) }]).filter(([, entry]) => Object.keys(entry).length));
    const translated = applyFormTextTranslations(prepared, "hi", dictionary);
    assert.deepEqual(extractFormTextTranslations(translated, "hi"), dictionary, metadata.form_code);
    assert.deepEqual(getFormJson(metadata.form_code), before);
    assert.deepEqual(getFormJson(metadata.form_code), JSON.parse(readFileSync(path.resolve(process.cwd().endsWith(path.join("apps", "api")) ? "../../expo/src/data/forms" : "expo/src/data/forms", metadata.file_name), "utf8")));
  }
});

test("current mobile-only PEF, PFF and WQ fields are editable alongside headings", () => {
  const inventory = (code: string) => flattenFormText(getPreparedFormJson(code)!);
  const pef = inventory("PEF");
  assert.ok(pef.some(row => row.name === "pef_ultrasound_reports"));
  assert.ok(pef.some(row => row.name === "pef_anc_card_image"));
  assert.ok(inventory("PFF").some(row => row.name.endsWith(":html") && row.title.includes("reported dead")));
  assert.ok(inventory("WQ").some(row => row.name === "wq_woman_mobile_numbers"));
  assert.ok(inventory("HHQ").some(row => row.kind === "page"));
  assert.ok(inventory("HHQ").some(row => row.kind === "native"));
});
