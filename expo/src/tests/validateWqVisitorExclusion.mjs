import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Model } from "survey-core";

import {
  WQ_RESIDENCE_DURATION_FIELD,
  applyWqVisitorSurveyRouting,
  canCorrectExcludedWqResponse,
  isWqVisitorAnswers,
} from "../modules/questionnaires/wqVisitorExclusion.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

assert.equal(isWqVisitorAnswers({ [WQ_RESIDENCE_DURATION_FIELD]: 96 }), true);
assert.equal(isWqVisitorAnswers({ [WQ_RESIDENCE_DURATION_FIELD]: 95 }), false);

const submittedAt = "2026-09-17T10:00:00.000Z";
const excludedResponse = {
  form_code: "WQ",
  sync_status: "pending",
  server_response_status: "wq_visitor_excluded",
  submitted_at: submittedAt,
};
assert.equal(canCorrectExcludedWqResponse(excludedResponse, Date.parse("2026-09-17T10:09:59.000Z")), true);
assert.equal(canCorrectExcludedWqResponse(excludedResponse, Date.parse("2026-09-17T10:10:00.000Z")), false);
assert.equal(canCorrectExcludedWqResponse({ ...excludedResponse, sync_status: "synced" }, Date.parse("2026-09-17T10:01:00.000Z")), false);

const surveyJson = {
  pages: [
    { name: "background", elements: [{ type: "text", name: WQ_RESIDENCE_DURATION_FIELD }] },
    { name: "reproduction", visibleIf: "{consent} = 1", elements: [{ type: "text", name: "reproduction_value" }] },
    { name: "page_outcome", visibleIf: "{stopped} = 1", elements: [{ type: "text", name: "result" }] },
  ],
};
applyWqVisitorSurveyRouting(surveyJson);
assert.match(surveyJson.pages[1].visibleIf, /!= 96/);
assert.match(surveyJson.pages[2].visibleIf, /= 96/);

const routedSurvey = new Model(surveyJson);
routedSurvey.setValue(WQ_RESIDENCE_DURATION_FIELD, 96);
assert.equal(routedSurvey.getPageByName("background").isVisible, true);
assert.equal(routedSurvey.getPageByName("reproduction").isVisible, false);
assert.equal(routedSurvey.getPageByName("page_outcome").isVisible, true);
routedSurvey.setValue(WQ_RESIDENCE_DURATION_FIELD, 12);
routedSurvey.setValue("consent", 1);
routedSurvey.setValue("stopped", 0);
assert.equal(routedSurvey.getPageByName("reproduction").isVisible, true);
assert.equal(routedSurvey.getPageByName("page_outcome").isVisible, false);

const dashboard = read("expo/src/modules/questionnaires/QuestionnaireDashboard.js");
assert.match(dashboard, /Are you Really a Visitor \?/);
assert.match(dashboard, /If yes you will be excluded from this study\./);
assert.match(dashboard, /This women is Excluded From study/);
assert.match(dashboard, /correctionResponseId: correctionContext\?\.responseId/);

const historyScreen = read("expo/src/modules/questionnaires/FormSubmissionListScreen.js");
assert.match(historyScreen, /formatWqVisitorCorrectionRemaining/);
assert.match(historyScreen, /correctionResponseId=/);

const eventProcessor = read("apps/api/src/services/eventProcessor.ts");
assert.match(eventProcessor, /event_type: "wq_visitor_excluded"/);
assert.match(eventProcessor, /closed_reason: "wq_visitor_excluded"/);

console.log("Validated WQ Q9 visitor exclusion, correction window, and routing.");
