import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  getNativeKeyboardType,
  normalizeMultipleTextInputValue,
  sanitizeNativeInputValue,
} from "../components/forms/renderers/multipleTextValue.js";

assert.equal(getNativeKeyboardType({ inputType: "number" }), "number-pad");
assert.equal(
  getNativeKeyboardType({ inputType: "number", sourceType: "decimal" }),
  "decimal-pad"
);
assert.equal(
  getNativeKeyboardType({
    inputType: "text",
    renderAs: "numeric_textbox",
    validators: [{ type: "numeric" }],
  }),
  "number-pad"
);
assert.equal(
  getNativeKeyboardType({
    inputType: "text",
    validators: [{ type: "regex", regex: "^\\d{10}$" }],
  }),
  "number-pad"
);
assert.equal(
  getNativeKeyboardType({
    inputType: "text",
    validators: [{ type: "regex", regex: "^\\d+(\\.\\d{1,2})?$" }],
  }),
  "decimal-pad"
);
assert.equal(getNativeKeyboardType({ inputType: "tel" }), "phone-pad");
assert.equal(getNativeKeyboardType({ renderAs: "phone_textbox" }), "phone-pad");
assert.equal(
  getNativeKeyboardType({ name: "wq_woman_mobile", inputType: "text" }),
  "phone-pad"
);
assert.equal(getNativeKeyboardType({ inputType: "text" }), "default");
assert.equal(
  getNativeKeyboardType({ jsonObj: { inputType: "number", sourceType: "decimal" } }),
  "decimal-pad"
);
assert.equal(
  getNativeKeyboardType({
    inputType: "text",
    renderingHint: { render_as: "numeric_textbox" },
  }),
  "number-pad"
);

assert.equal(sanitizeNativeInputValue("+91 (987)-654", "phone-pad"), "91987654");
assert.equal(sanitizeNativeInputValue("1a-2", "number-pad"), "12");
assert.equal(sanitizeNativeInputValue("-1a.2.3", "decimal-pad"), "-1.23");
assert.equal(sanitizeNativeInputValue("a-1", "default"), "a-1");

const fixedWidth = {
  inputType: "number",
  preserveString: true,
  validators: [{ type: "regex", regex: "^\\d{4}$" }],
};
const fixedWidthResult = normalizeMultipleTextInputValue(fixedWidth, "00a12");
assert.equal(fixedWidthResult.keyboardType, "number-pad");
assert.equal(fixedWidthResult.sanitized, "0012");
assert.equal(fixedWidthResult.value, "0012");

const numericText = normalizeMultipleTextInputValue(
  { inputType: "text", renderAs: "numeric_textbox", preserveString: true },
  "007"
);
assert.equal(numericText.keyboardType, "number-pad");
assert.equal(numericText.value, "007");

const ordinaryText = normalizeMultipleTextInputValue({ inputType: "text" }, "A-1");
assert.equal(ordinaryText.keyboardType, "default");
assert.equal(ordinaryText.value, "A-1");

for (const rendererPath of [
  new URL("../components/forms/renderers/SelectOneRenderer.js", import.meta.url),
  new URL("../components/forms/renderers/MultipleTextRenderer.js", import.meta.url),
  new URL("../components/forms/renderers/WqLmpTimingRenderer.js", import.meta.url),
]) {
  const rendererSource = readFileSync(rendererPath, "utf8");
  assert.doesNotMatch(
    rendererSource,
    /placeholder\s*=\s*["']00["']/,
    `${rendererPath.pathname} must not display 00 as a numeric input placeholder`
  );
}

const multipleTextRendererSource = readFileSync(
  new URL("../components/forms/renderers/MultipleTextRenderer.js", import.meta.url),
  "utf8"
);
assert.match(
  multipleTextRendererSource,
  /String\(item\.placeholder \|\| ""\)\.trim\(\) === "00"/,
  "Multiple-text numeric fields must suppress metadata-provided 00 placeholders"
);

console.log("Validated native numeric, decimal, phone, and text keyboard selection.");
