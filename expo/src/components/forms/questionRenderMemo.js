/**
 * Pure (no react-native) memoization helpers for native question renderers.
 *
 * A "leaf" renderer kind draws its output purely from its own question (value,
 * title, description, choices, visibility, read-only state, errors). Those
 * renderers can skip re-rendering on every survey revision bump and instead
 * re-render only when something about their own question actually changed,
 * captured by `buildQuestionRenderSignature`. Every other kind (calculate,
 * display, db-check, dynamic-panel, and all wq-* composite renderers) reads
 * state beyond its own question, so it stays tied to `renderRevision` and
 * re-renders on every survey change, exactly like today.
 */
import {
  getNativeQuestionChoices,
  getNativeQuestionDescription,
  getNativeQuestionErrors,
  getNativeQuestionTitle,
  getNativeQuestionValue,
  getNativeRendererKind,
} from "./nativeSurveyModel.js";

export const LEAF_RENDERER_KINDS = new Set([
  "text",
  "number",
  "date",
  "select-one",
  "select-many",
  "grouped-coded-single-select",
  "household-member-dropdown",
  "note",
  "instruction",
  "camera",
  "gps",
  "file-picker",
  "multiple-text",
]);

export function isLeafRendererQuestion(question) {
  try {
    return LEAF_RENDERER_KINDS.has(getNativeRendererKind(question));
  } catch {
    return false;
  }
}

function safeStringifyValue(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function multipleTextItemErrorsSignature(question) {
  if (!Array.isArray(question?.items) || !question.items.length) return "";
  return question.items
    .map((item) => `${item?.name || ""}:${getNativeQuestionErrors(item?.editor ?? item).join("|")}`)
    .join(";");
}

/**
 * Builds a cheap-to-compute signature capturing everything a leaf renderer's
 * output could depend on: its own value, title (post-interpolation), description,
 * choices, visibility, read-only state, and validation errors (including
 * per-item errors for multiple-text). Two calls with an identical signature
 * mean the question would render identically.
 */
export function buildQuestionRenderSignature(question, locale = "default") {
  if (!question) return "";
  const isVisible = question.isVisible !== false;
  const isReadOnly = question.readOnly === true || question.isReadOnly === true;
  const errors = getNativeQuestionErrors(question);
  const itemErrors = multipleTextItemErrorsSignature(question);
  const title = getNativeQuestionTitle(question, locale);
  const description = getNativeQuestionDescription(question, locale);
  const choices = getNativeQuestionChoices(question, locale)
    .map((choice) => `${choice.value}:${choice.text}`)
    .join(",");
  const ownValue = safeStringifyValue(question.value);
  return [
    question.name,
    isVisible ? "v1" : "v0",
    isReadOnly ? "r1" : "r0",
    errors.length,
    itemErrors,
    title,
    description,
    choices,
    ownValue,
  ].join("");
}

function isObjectLike(value) {
  return value !== null && typeof value === "object";
}

function deepValueEqual(a, b) {
  if (a === b) return true;
  if (!isObjectLike(a) || !isObjectLike(b)) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
      if (!deepValueEqual(a[index], b[index])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepValueEqual(a[key], b[key])) return false;
  }
  return true;
}

/**
 * React.memo comparator for NativeQuestionRenderer. `renderSignature` must be
 * computed by the caller (see NativeSurveyRenderer) via
 * `buildQuestionRenderSignature` and passed as a prop alongside `renderRevision`.
 */
export function areQuestionRendererPropsEqual(previous, next) {
  if (previous.question !== next.question) return false;
  if (previous.locale !== next.locale) return false;
  if (previous.onChange !== next.onChange) return false;
  if (previous.onRequestTopLevelFocus !== next.onRequestTopLevelFocus) return false;
  if (previous.renderQuestion !== next.renderQuestion) return false;
  if (previous.renderSignature !== next.renderSignature) return false;

  const previousValue = getNativeQuestionValue(previous.question, previous.answerData);
  const nextValue = getNativeQuestionValue(next.question, next.answerData);
  if (!deepValueEqual(previousValue, nextValue)) return false;

  if (!isLeafRendererQuestion(next.question)) {
    if (previous.renderRevision !== next.renderRevision) return false;
  }

  return true;
}
