import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { transformSync } from "@babel/core";
import { getNativeFormText, formatNativeFormText } from "../lib/nativeFormText.js";
import { NATIVE_FORM_DIALOG_TEXT } from "../lib/nativeFormDialogText.js";

const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
let width = 400;
const context = {
  React, NATIVE_FORM_DIALOG_TEXT, getNativeFormText, formatNativeFormText,
  useState: (value) => [value, () => {}],
  useWindowDimensions: () => ({ width }),
  StyleSheet: { create: (value) => value },
  ...Object.fromEntries(["Modal", "Pressable", "ScrollView", "Text", "View"].map((type) => [type, type])),
  buildNativeSurveyPreview: () => [{ name: "page", title: "अनुभाग", questions: [{ name: "members", title: "सदस्य", panelRows: [{ index: 1, questions: [] }] }] }],
};
for (const file of ["SectionNavigator.js", "renderers/PreviewRenderer.js"]) {
  const source = fs.readFileSync(new URL(`../components/forms/${file}`, import.meta.url), "utf8")
    .replace(/^import[\s\S]*?;/gm, "").replace(/^export /gm, "");
  // Distinct contexts keep each component's module-level styles private.
  const host = { ...context };
  vm.runInNewContext(transformSync(`${source}\nthis.component = ${file.startsWith("Section") ? "SectionNavigator" : "PreviewRenderer"};`, {
    babelrc: false, configFile: false, plugins: ["@babel/plugin-transform-react-jsx"],
  }).code, host);
  context[file] = host.component;
}
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (typeof tree.type === "function") return nodes(tree.type(tree.props));
  return [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)];
}
const nativeText = Object.fromEntries(Object.keys(NATIVE_FORM_DIALOG_TEXT).map((key) => [key, { default: NATIVE_FORM_DIALOG_TEXT[key], hi: `हिंदी ${key}` }]));
nativeText.section_progress_description.hi = "{title} - {status} - {number}";
nativeText.preview_row.hi = "पंक्ति {number}";
const model = { locale: "hi", nativeText };
const section = { name: "a", title: "पहचान", applicable: true, status: "complete", isCurrent: true, total: 2, answered: 2 };
let selected;
const closes = [];
const props = { model, drawerOpen: true, sections: [section], onSelect: (value) => { selected = value; }, onDrawerOpenChange: (value) => closes.push(value) };
let all = nodes(context["SectionNavigator.js"](props));
for (const key of ["section_sections", "section_questionnaire_sections", "section_select_to_continue", "section_close", "section_complete"]) {
  assert.ok(all.some((node) => node.type === "Text" && node.props.children.includes(`हिंदी ${key}`)), key);
}
assert.ok(all.some((node) => node.props.accessibilityLabel === "पहचान - हिंदी section_complete - 1"));
all.find((node) => node.type === "Pressable" && node.props.disabled === false).props.onPress();
assert.equal(selected, section);
assert.equal(closes.at(-1), false);
all.find((node) => node.props.accessibilityLabel === "हिंदी section_close_navigator").props.onPress();
assert.equal(closes.at(-1), false);
all.find((node) => node.type === "Modal").props.onRequestClose();
assert.equal(closes.at(-1), false);
width = 900;
selected = null;
all = nodes(context["SectionNavigator.js"](props));
all.find((node) => node.type === "Pressable").props.onPress();
assert.equal(selected, section);
assert.ok(all.some((node) => node.type === "Text" && node.props.children.includes("हिंदी section_complete")));
all = nodes(context["renderers/PreviewRenderer.js"]({ model, locale: "hi" }));
assert.ok(all.some((node) => node.type === "Text" && node.props.children.includes("पंक्ति 1")));
assert.equal(formatNativeFormText(model, "preview_row", "Row {number}", { number: 2 }, "en"), "Row 2");
console.log("Native form section drawer and preview translations preserve callbacks and English fallback.");
