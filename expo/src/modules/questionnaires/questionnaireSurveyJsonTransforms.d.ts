/** Pure canonical mobile questionnaire preparation, shared by the API editor. */
export const WQ_BORN_ALIVE_CHILD_FOLLOWUPS_NAME: string;
export const WQ_FOLLOWUP_PREGNANCY_INDEX_NAME: string;
export const WQ_FOLLOWUP_CHILD_INDEX_NAME: string;
export const WQ_FOLLOWUP_COMPLETED_NAME: string;
export const WQ_PREGNANCY_ROW_ID_NAME: string;
export const WQ_REPRODUCTION_COMPARISON_NAME: string;
export function getPreparedSurveyJson(form: Record<string, unknown>): Record<string, unknown>;
export function prepareQuestionnaireSurveyJson(form: Record<string, unknown>): Record<string, unknown>;
export function normalizeQuestionnaireSurveyData<T extends Record<string, unknown>>(form: Record<string, unknown>, data: T): T;
export function getQuestionnairePageIntro(form: Record<string, unknown>, pageName: string, survey?: unknown): string;
