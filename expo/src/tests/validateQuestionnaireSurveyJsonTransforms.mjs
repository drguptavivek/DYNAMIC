import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { prepareQuestionnaireSurveyJson } = await import(
  "../modules/questionnaires/questionnaireSurveyJsonTransforms.js"
);

const root = path.dirname(fileURLToPath(import.meta.url));
const hhqPath = path.resolve(
  root,
  "../data/forms/baseline_household_questionnaire_v2026.05.09.json"
);
const hhq = JSON.parse(fs.readFileSync(hhqPath, "utf8"));

function findElementByName(surveyJson, name) {
  const queue = surveyJson.pages.flatMap((page) => page.elements || []);
  while (queue.length) {
    const element = queue.shift();
    if (element.name === name) return element;
    if (Array.isArray(element.elements)) queue.push(...element.elements);
    if (Array.isArray(element.templateElements)) queue.push(...element.templateElements);
  }
  return null;
}

const surveyJson = prepareQuestionnaireSurveyJson(hhq);
const mobilePanel = findElementByName(surveyJson, "hhq_contact_mobile_numbers");
const singleMobile = findElementByName(surveyJson, "hhq_contact_mobile");

assert.equal(singleMobile, null);
assert.equal(mobilePanel.type, "paneldynamic");
assert.equal(mobilePanel.panelCount, 1);
assert.equal(mobilePanel.minPanelCount, 1);
assert.equal(mobilePanel.isRequired, undefined);
assert.equal(mobilePanel.templateElements.length, 1);
assert.equal(mobilePanel.templateElements[0].name, "mobile_number");
assert.equal(mobilePanel.templateElements[0].inputType, "tel");
assert.equal(mobilePanel.templateElements[0].isRequired, true);
assert.deepEqual(mobilePanel.templateElements[0].validators, [
  {
    type: "regex",
    regex: "^[0-9]{10}$",
    text: {
      default: "Enter exactly 10 digits.",
      hi: "",
      kn: "",
      mr: "",
      ta: "",
      te: "",
      ur: ""
    }
  }
]);

console.log("Validated questionnaire SurveyJS JSON transforms.");
