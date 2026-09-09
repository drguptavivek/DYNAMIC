/** Verifies the leaf-question render memo (questionRenderMemo.js) skips no-op re-renders. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Model } from "survey-core";

const {
  LEAF_RENDERER_KINDS,
  buildQuestionRenderSignature,
  areQuestionRendererPropsEqual,
} = await import("../components/forms/questionRenderMemo.js");
const { prepareQuestionnaireSurveyJson } = await import(
  "../modules/questionnaires/questionnaireSurveyJsonTransforms.js"
);
const { getNativeRendererKind, setNativeQuestionValue } = await import(
  "../components/forms/nativeSurveyModel.js"
);

const root = path.dirname(fileURLToPath(import.meta.url));
const wqPath = path.resolve(root, "../data/forms/baseline_woman_s_questionnaire_v2026.05.09.json");
const wq = JSON.parse(fs.readFileSync(wqPath, "utf8"));

const LOCALE = "default";
const noop = () => {};
const focus = () => {};
const renderFn = () => {};

function buildModel() {
  return new Model(prepareQuestionnaireSurveyJson(wq));
}

function baseProps(question, overrides = {}) {
  return {
    question,
    locale: LOCALE,
    onChange: noop,
    onRequestTopLevelFocus: focus,
    renderQuestion: renderFn,
    renderRevision: 1,
    ...overrides,
  };
}

// --- A leaf question's classification ---
{
  const model = buildModel();
  const leaf = model.getQuestionByName("wq_woman_available");
  assert.equal(getNativeRendererKind(leaf), "select-one");
  assert.ok(LEAF_RENDERER_KINDS.has("select-one"), "select-one must be a leaf renderer kind");
}

// --- Leaf question: an unrelated answer change must be a no-op re-render ---
{
  const model = buildModel();
  const leaf = model.getQuestionByName("wq_woman_available");
  const sig1 = buildQuestionRenderSignature(leaf, LOCALE);
  const prevProps = baseProps(leaf, {
    renderSignature: sig1,
    answerData: { ...model.data },
  });

  setNativeQuestionValue(model.getQuestionByName("wq_name_woman"), "Asha");
  const sig2 = buildQuestionRenderSignature(leaf, LOCALE);
  assert.equal(sig2, sig1, "an unrelated field change must not alter the leaf question's signature");

  const nextProps = baseProps(leaf, {
    renderRevision: 2,
    renderSignature: sig2,
    answerData: { ...model.data },
  });
  assert.equal(
    areQuestionRendererPropsEqual(prevProps, nextProps),
    true,
    "leaf renderer must skip re-render when an unrelated answer changes"
  );
}

// --- Leaf question: its own value changing must force a re-render ---
{
  const model = buildModel();
  const leaf = model.getQuestionByName("wq_woman_available");
  const sig1 = buildQuestionRenderSignature(leaf, LOCALE);
  const prevProps = baseProps(leaf, {
    renderSignature: sig1,
    answerData: { ...model.data },
  });

  setNativeQuestionValue(leaf, 2);
  const sig2 = buildQuestionRenderSignature(leaf, LOCALE);
  assert.notEqual(sig2, sig1, "the question's own value must be part of its signature");

  const nextProps = baseProps(leaf, {
    renderRevision: 2,
    renderSignature: sig2,
    answerData: { ...model.data },
  });
  assert.equal(
    areQuestionRendererPropsEqual(prevProps, nextProps),
    false,
    "leaf renderer must re-render when its own value changes"
  );
}

// --- Leaf question: a visibility change must force a re-render ---
{
  const model = buildModel();
  const leaf = model.getQuestionByName("wq_woman_available");
  const sig1 = buildQuestionRenderSignature(leaf, LOCALE);
  const prevProps = baseProps(leaf, {
    renderSignature: sig1,
    answerData: { ...model.data },
  });

  leaf.visible = false;
  const sig2 = buildQuestionRenderSignature(leaf, LOCALE);
  assert.notEqual(sig2, sig1, "visibility must be part of the signature");

  const nextProps = baseProps(leaf, {
    renderRevision: 2,
    renderSignature: sig2,
    answerData: { ...model.data },
  });
  assert.equal(
    areQuestionRendererPropsEqual(prevProps, nextProps),
    false,
    "leaf renderer must re-render when its visibility changes"
  );
}

// --- Leaf question: an errors change must force a re-render ---
{
  const model = buildModel();
  const leaf = model.getQuestionByName("wq_woman_available");
  const sig1 = buildQuestionRenderSignature(leaf, LOCALE);
  const prevProps = baseProps(leaf, {
    renderSignature: sig1,
    answerData: { ...model.data },
  });

  leaf.addError("Test error");
  const sig2 = buildQuestionRenderSignature(leaf, LOCALE);
  assert.notEqual(sig2, sig1, "validation errors must be part of the signature");

  const nextProps = baseProps(leaf, {
    renderRevision: 2,
    renderSignature: sig2,
    answerData: { ...model.data },
  });
  assert.equal(
    areQuestionRendererPropsEqual(prevProps, nextProps),
    false,
    "leaf renderer must re-render when its errors change"
  );
}

// --- Leaf question: a title-interpolation input change must force a re-render ---
{
  const model = buildModel();
  const occupation = model.getQuestionByName(
    "wq_04_husband_s_backgroun_if_1_1_currently_married_what_is_your_last"
  );
  assert.equal(getNativeRendererKind(occupation), "text");
  assert.ok(LEAF_RENDERER_KINDS.has("text"));
  const maritalStatusCheck = model.getQuestionByName(
    "wq_04_husband_s_backgroun_check_answer_to_marital_status_on_01_respo"
  );

  setNativeQuestionValue(maritalStatusCheck, 1);
  const sig1 = buildQuestionRenderSignature(occupation, LOCALE);
  const prevProps = baseProps(occupation, {
    renderSignature: sig1,
    answerData: { ...model.data },
  });

  setNativeQuestionValue(maritalStatusCheck, 3);
  const sig2 = buildQuestionRenderSignature(occupation, LOCALE);
  assert.notEqual(
    sig2,
    sig1,
    "husband-occupation title wording depends on the marital-status-check field"
  );

  const nextProps = baseProps(occupation, {
    renderRevision: 2,
    renderSignature: sig2,
    answerData: { ...model.data },
  });
  assert.equal(
    areQuestionRendererPropsEqual(prevProps, nextProps),
    false,
    "leaf renderer must re-render when a field its title interpolates from changes"
  );
}

// --- Leaf question: a locale change must force a re-render ---
{
  const model = buildModel();
  const leaf = model.getQuestionByName("wq_woman_available");
  const sig = buildQuestionRenderSignature(leaf, LOCALE);
  const prevProps = baseProps(leaf, {
    locale: "default",
    renderSignature: sig,
    answerData: { ...model.data },
  });
  const nextProps = baseProps(leaf, {
    locale: "hi",
    renderRevision: 2,
    renderSignature: sig,
    answerData: { ...model.data },
  });
  assert.equal(
    areQuestionRendererPropsEqual(prevProps, nextProps),
    false,
    "leaf renderer must re-render when the active locale changes"
  );
}

// --- Dependent (non-leaf) kind: any revision change forces a re-render ---
{
  const model = buildModel();
  const dependent = model.getQuestionByName(
    "wq_02_reproduction_sum_answers_to_3_5_and_7_enter_total_if_no"
  );
  assert.equal(getNativeRendererKind(dependent), "calculate");
  assert.ok(!LEAF_RENDERER_KINDS.has("calculate"), "calculate must not be a leaf renderer kind");

  const sig = buildQuestionRenderSignature(dependent, LOCALE);
  const answerData = { ...model.data };
  const prevProps = baseProps(dependent, {
    renderSignature: sig,
    answerData,
  });
  const nextProps = baseProps(dependent, {
    renderRevision: 2,
    renderSignature: sig,
    answerData,
  });
  assert.equal(
    areQuestionRendererPropsEqual(prevProps, nextProps),
    false,
    "dependent kinds must re-render on every revision bump even with an unchanged signature"
  );
}

console.log("Validated question render memo comparator.");
