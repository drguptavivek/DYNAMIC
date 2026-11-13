import { inArray, sql } from "drizzle-orm";
// @ts-expect-error Reuse the app model factory and its renderer metadata.
import { createSurveyModel } from "../../../../expo/src/polyfills/surveyCoreNative.js";
// @ts-expect-error Shared app locale restoration is JavaScript.
import { getDraftFormLocale } from "../../../../expo/src/lib/formLanguage.js";
import type { DashboardScope } from "./operationsDashboard";
import { getPreparedSurveyJson } from "../../../../expo/src/modules/questionnaires/questionnaireSurveyJsonTransforms.js";
// @ts-expect-error Shared app preview is JavaScript; runtime contract is covered by preview tests.
import { buildNativeSurveyPreview } from "../../../../expo/src/components/forms/nativeSurveyModel.js";

export function householdCompletedFormsSql(scope: DashboardScope, householdId: unknown) {
  if (!scope.user_id) throw new Error("INVALID_USER");
  if (typeof householdId !== "string" || !householdId.trim() || householdId.length > 200 || /[\x00-\x1f]/.test(householdId)) throw new Error("INVALID_HOUSEHOLD");
  const villages = scope.locality_codes === null ? sql`true` : scope.locality_codes.length ? inArray(sql`h.locality_code`, scope.locality_codes) : sql`false`;
  const start = `${scope.date_from ?? scope.date}T00:00:00+05:30`;
  const end = new Date(Date.parse(`${scope.period === "all" ? scope.as_of_date : scope.date_to ?? scope.date}T00:00:00+05:30`) + 86400000).toISOString();
  const at = sql`coalesce(f.created_offline_at,f.synced_at,f.created_at)`;
  return sql`select f.form_response_id,f.form_code,f.form_version,f.subject_id,f.site_id,f.locality_code,
    f.submitted_by_user_id,${at} submitted_at,f.answers_json,f.prefill_snapshot_json
    from form_responses f join households h on h.household_id=f.household_id and h.site_id=f.site_id and h.locality_code=f.locality_code
    left join follow_up_tasks t on t.task_id=f.task_id and t.household_id=h.household_id and t.site_id=h.site_id
    where h.household_id=${householdId} and (${scope.site_id}::integer is null or h.site_id=${scope.site_id})
      and (${scope.locality_code}::text is null or h.locality_code=${scope.locality_code}) and ${villages}
      and f.submitted_by_user_id=${scope.user_id} and coalesce(f.response_status,'primary')='primary'
      and ((f.form_code='HHQ' and (f.answers_json->>'hhq_result_interview'='1' or
        (f.answers_json->>'hhq_result_interview'='10' and h.baseline_enrollment_status='enrolled'
          and coalesce(h.cohort_status,'')<>'excluded' and h.closed_reason is null
          and t.status in ('completed','completed_on_time','completed_late'))))
        or (f.form_code='WQ' and f.answers_json->>'wq_result_interview'='1')
        or (f.form_code not in ('HHQ','WQ') and t.status in ('completed','completed_on_time','completed_late')
          and (f.form_code<>'HRF' or f.answers_json->>'hrf_result_interview'='1')))
      and ${at}<${end}::timestamptz and (${scope.period === "all"} or ${at}>=${start}::timestamptz)
      and exists(select 1 from field_worker_household_assignments a join users u on u.user_id=a.user_id and u.site_id=h.site_id
        where a.household_id=h.household_id and a.user_id=${scope.user_id})
    order by ${at},f.form_response_id`;
}

export function buildCompletedFormPreview(form: Record<string, any>, answers: Record<string, unknown>) {
  const prepared = getPreparedSurveyJson(form);
  const model = createSurveyModel(prepared);
  const locale = getDraftFormLocale({json_payload:answers},model);
  model.locale = locale;
  model.mode = "display";
  model.clearInvisibleValues = "none";
  model.data = structuredClone(answers);
  const preview = buildNativeSurveyPreview(model,locale);
  const title = model.title;
  model.dispose();
  return {language_code: locale === "default" ? "en" : locale,title,preview};
}

export function savedFormAnswers(value: unknown): Record<string, unknown> {
  if (typeof value === "string") { try { return savedFormAnswers(JSON.parse(value)); } catch { return {}; } }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {};
}
