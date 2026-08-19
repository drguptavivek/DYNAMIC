/**
 * Supplies the event-listener and focus surfaces Survey Core probes on React Native's
 * DOM-less window.
 */
import { Question, SurveyModel } from "survey-core";

if (typeof window !== "undefined") {
  if (typeof window.addEventListener !== "function") {
    window.addEventListener = () => {};
  }
  if (typeof window.removeEventListener !== "function") {
    window.removeEventListener = () => {};
  }
}

if (typeof document === "undefined") {
  // Survey Core's error-focus path reads settings.environment (a browser DOM) without a
  // guard, so page validation throws without a document and silently kills Next/Complete
  // presses. Native renderers own scrolling and focus, so disable the DOM helpers.
  SurveyModel.prototype.scrollElementToTop = function scrollElementToTopNoOp() {};
  Question.prototype.focusInputElement = function focusInputElementNoOp() {};
}
