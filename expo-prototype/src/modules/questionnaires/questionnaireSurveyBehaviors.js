import {
  attachHouseholdSurveyBehaviors,
  refreshHouseholdSurveyBehaviors,
} from "../../lib/householdSurveyBehaviors.js";

export function attachQuestionnaireSurveyBehaviors(model, form, options = {}) {
  attachHouseholdSurveyBehaviors(
    model,
    form,
    options.onHouseholdSave,
    options.householdBehaviorOptions || {}
  );
}

export function refreshQuestionnaireSurveyBehaviors(model, form) {
  refreshHouseholdSurveyBehaviors(model, form);
}
