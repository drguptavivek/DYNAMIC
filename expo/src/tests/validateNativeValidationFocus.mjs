/** Runs the real native navigation handlers with isolated Survey Core and native layout refs. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { transformSync } from "@babel/core";
import { createSurveyModel } from "../polyfills/surveyCoreNative.js";
import * as native from "../components/forms/nativeSurveyModel.js";
import * as focus from "../components/forms/nativeValidationFocus.js";
import * as memo from "../components/forms/questionRenderMemo.js";
import * as navigation from "../modules/questionnaires/surveyNavigation.js";

const source = fs.readFileSync(new URL("../components/forms/NativeSurveyRenderer.js", import.meta.url), "utf8");
const compiled = transformSync(source, { babelrc: false, configFile: false,
  plugins: ["@babel/plugin-transform-react-jsx", "@babel/plugin-transform-modules-commonjs"] }).code;
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

function mount(model, { width = 390, compactPager = false, validationFocusRequest, onCompleteRequested } = {}) {
  const slots = [], effects = [], frames = [], scrolls = [];
  let cursor = 0, dirty = true, tree, props;
  const react = {
    createElement: (type, properties, ...children) => ({ type, props: { ...properties, children } }),
    forwardRef: (component) => component,
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[i].value, (value) => { const next = typeof value === "function" ? value(slots[i].value) : value;
        if (!Object.is(slots[i].value, next)) { slots[i].value = next; dirty = true; } }]; },
    useRef(current) { const i = cursor++; slots[i] ??= { current }; return slots[i]; },
    useMemo(create, deps) { const i = cursor++; if (!slots[i] || !sameDeps(slots[i].deps, deps)) slots[i] = { value: create(), deps }; return slots[i].value; },
    useEffect(callback, deps) { const i = cursor++; if (!slots[i] || !sameDeps(slots[i].deps, deps)) { slots[i] = { deps }; effects.push(callback); } },
    useImperativeHandle(ref, create) { cursor++; ref.current = create(); },
  };
  react.useCallback = (callback, deps) => react.useMemo(() => callback, deps);
  const imports = {
    react,
    "react-native": { Platform: { OS: "web" }, Keyboard: { addListener: () => ({ remove() {} }) },
      useWindowDimensions: () => ({ width }), StyleSheet: { create: (styles) => styles },
      View: "View", ScrollView: "ScrollView", Text: "Text", Pressable: "Pressable" },
    "@expo/vector-icons/MaterialCommunityIcons": "Icon",
    "./nativeSurveyModel.js": native, "./nativeValidationFocus.js": focus,
    "./questionRenderMemo.js": memo, "./renderers/NativeQuestionRenderer.js": { NativeQuestionRenderer: "Question" },
    "./SectionNavigator.js": { SectionNavigator: "Sections" }, "../../modules/questionnaires/surveyNavigation.js": navigation,
  };
  const context = { exports: {}, require: (id) => { assert.ok(id in imports, `Unexpected import ${id}`); return imports[id]; },
    requestAnimationFrame: (callback) => { frames.push(callback); return frames.length; }, cancelAnimationFrame() {}, setTimeout, clearTimeout };
  vm.runInNewContext(compiled, context);
  const ref = { current: null };
  props = { model, answerData: model.data, compactPager, validationFocusRequest, onCompleteRequested };
  function nodes(node = tree, found = []) { if (!node || typeof node !== "object") return found;
    if (Array.isArray(node)) { node.forEach((item) => nodes(item, found)); return found; }
    found.push(node); nodes(node.props?.children, found); return found; }
  function settle() {
    for (let i = 0; i < 15 && (dirty || effects.length || frames.length); i++) {
      if (dirty) { dirty = false; cursor = 0; tree = context.exports.NativeSurveyRenderer(props, ref);
        for (const node of nodes()) {
          const fake = { scrollTo: (options) => scrolls.push(options), measureLayout: (_parent, done) => done(0, 610) };
          if (typeof node.props.ref === "function") node.props.ref(fake);
          else if (node.props.ref) node.props.ref.current = fake;
          node.props.onLayout?.({ nativeEvent: { layout: { y: 90 } } });
        }
      }
      effects.splice(0).forEach((effect) => effect()); frames.splice(0).forEach((frame) => frame());
    }
  }
  settle();
  return { ref, nodes, scrolls, settle,
    update(next) { props = { ...props, ...next, answerData: model.data }; dirty = true; settle(); },
    async next() { const button = nodes().find((node) => ["Next section", "Review and submit"].includes(node.props.accessibilityLabel));
      await button.props.onPress(); settle(); },
    request() { return nodes().find((node) => node.type === "Question")?.props.validationFocusRequest; },
    reveal(question, y = 940) { const owner = nodes().find((node) => node.type === "Question");
      owner.props.onRegisterQuestion(question, { measureLayout: (_parent, done) => done(0, y) });
      owner.props.onQuestionLayout(question); settle(); },
  };
}

function fourChildren() {
  const model = createSurveyModel({ pages: [{ name: "children", elements: [
    { type: "paneldynamic", name: "children", templateElements: [
      { type: "text", name: "child_name", isRequired: true },
      { type: "text", name: "detail", title: "Child detail", isRequired: true },
    ] }, { type: "text", name: "after_children" },
  ] }, { name: "outcome", elements: [{ type: "text", name: "result" }] }] });
  model.data = { children: [0, 1, 2, 3].map((index) => ({ child_name: `Test child ${index + 1}`, detail: index < 2 ? "Entered" : "" })) };
  return model;
}
for (const [width, compactPager] of [[390, false], [1280, false], [390, true]]) {
  const model = fourChildren(), original = JSON.stringify(model.data);
  const panel = model.getQuestionByName("children");
  const third = panel.panels[2].getQuestionByName("detail"), fourth = panel.panels[3].getQuestionByName("detail");
  const renderer = mount(model, { width, compactPager });
  await renderer.next();
  assert.equal(model.currentPage.name, "children");
  assert.equal(renderer.request().question, third, "Blocked Next must identify the actual third child's field, not the first matching name");
  assert.equal(JSON.stringify(model.data), original, "Revealing an error must not change study answers");
  renderer.reveal(third);
  assert.ok(renderer.scrolls.some(({ y }) => y >= 800), "Nested field layout must scroll beyond the panel header on mobile and desktop");
  third.value = "Corrected";
  await renderer.next();
  assert.equal(renderer.request().question, fourth, "Correcting the first error must reveal the next child's field");
  assert.notEqual(renderer.request().question, panel.panels[0].getQuestionByName("detail"));
}

const crossPage = fourChildren();
crossPage.currentPage = crossPage.getPageByName("outcome");
const target = crossPage.getQuestionByName("children").panels[2].getQuestionByName("detail");
target.validate();
const restored = mount(crossPage, { validationFocusRequest: { question: target, sequence: 1 } });
assert.equal(crossPage.currentPage.name, "children", "A focus request queued while preview unmounts the renderer must reveal the actual errored page");
assert.equal(restored.request().question, target);
assert.equal(restored.ref.current.focusQuestion(target), true);
restored.settle();
assert.equal(restored.request().question, target, "Imperative focus accepts the actual repeat question instance");
const blockedPage = createSurveyModel({ pages: [
  { name: "current", elements: [{ type: "text", name: "current_answer" }] },
  { name: "blocked", elements: [{ type: "text", name: "later_answer" }] },
] });
blockedPage.onCurrentPageChanging.add((_model, options) => { options.allow = false; });
const blockedRenderer = mount(blockedPage);
assert.equal(blockedRenderer.ref.current.focusQuestion(blockedPage.getQuestionByName("later_answer")), false);
blockedRenderer.settle();
assert.equal(blockedPage.currentPage.name, "current", "Error focus must respect a blocked page transition");
console.log("Native validation navigation targets exact repeated questions, deferred layouts and cross-page requests on mobile/desktop.");

const compound = createSurveyModel({ pages: [{ name: "measurements", elements: [
  { type: "multipletext", name: "duration", items: [{ name: "days", isRequired: true }, { name: "months" }] },
] }, { name: "outcome", elements: [{ type: "text", name: "result" }] }] });
compound.data = { duration: { months: "03" } };
const compoundRenderer = mount(compound);
await compoundRenderer.next();
assert.equal(compoundRenderer.request().question, compound.getQuestionByName("duration"),
  "A multiple-text item's editor error must reveal its containing question");
assert.equal(compound.currentPage.name, "measurements");

const emptyPanel = createSurveyModel({ pages: [{ name: "roster", elements: [
  { type: "paneldynamic", name: "children", templateElements: [{ type: "text", name: "child_name" }] },
] }, { name: "outcome", elements: [{ type: "text", name: "result" }] }] });
emptyPanel.onValidateQuestion.add((_model, options) => { if (options.name === "children" && !options.value?.length) options.error = "Add a child before continuing."; });
const emptyRenderer = mount(emptyPanel);
await emptyRenderer.next();
assert.equal(emptyRenderer.request().question, emptyPanel.getQuestionByName("children"),
  "An empty repeat's own count error must retain the visible panel target");

const completing = fourChildren();
completing.currentPage = completing.getPageByName("outcome");
let submissions = 0, finalRenderer;
finalRenderer = mount(completing, { onCompleteRequested: (model) => {
  if (!model.validate()) { finalRenderer.ref.current.focusQuestion(
    model.getQuestionByName("children").panels[2].getQuestionByName("detail")); return; }
  submissions++;
} });
await finalRenderer.next();
assert.equal(submissions, 0, "Failed final validation cannot complete the form");
assert.equal(completing.currentPage.name, "children");
assert.equal(finalRenderer.request().question, completing.getQuestionByName("children").panels[2].getQuestionByName("detail"));
console.log("Compound-field, empty-repeat and final-validation focus cases passed.");
