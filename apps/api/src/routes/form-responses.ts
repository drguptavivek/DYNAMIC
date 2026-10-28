import { Router, Request, Response } from "express";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { sendError, sendSuccess } from "../lib/errors";
import { getPagination } from "../lib/pagination";
import { appendAreaScopeCondition } from "../lib/areaScope";
import { getRequestDataAccessProfile, requireDataAccess } from "../lib/dataAccess";
import { getEffectiveFormJson } from "../lib/formLanguage";
import { getPreparedSurveyJson } from "../../../../expo/src/modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import { FORM_EXPORT_MASK, maskFormExportValue } from "../lib/formExportPrivacy";

const router = Router();

type ExportField = { key: string; choices: Map<string, string>; definition: Record<string, unknown> };
const HOUSEHOLD_MEMBERS = "hhq_household_members";

function exportChoices(item: Record<string, unknown>): Map<string, string> {
  const result = new Map<string, string>();
  const choices = [
    ...(Array.isArray(item.choices) ? item.choices : []),
    ...(Array.isArray(item.specialChoices) ? item.specialChoices : []),
    ...(item.unknownChoice ? [item.unknownChoice] : []),
  ];
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const entry = choice as Record<string, unknown>;
    const localized = entry.text && typeof entry.text === "object" ? entry.text as Record<string, unknown> : null;
    const text = localized ? localized.default || localized.en : entry.text;
    if (entry.value !== undefined && typeof text === "string" && text.trim()) result.set(String(entry.value), text);
  }
  return result;
}

function collectExportFields(value: unknown, fields: ExportField[] = [], skipRosterChildren = false): ExportField[] {
  if (!value || typeof value !== "object") return fields;
  const item = value as Record<string, unknown>;
  if (typeof item.name === "string" && (typeof item.type === "string" || Array.isArray(item.choices))) {
    const key = item.name;
    // `name` is the canonical variable_name used by Form Language Management
    // and by answers_json; sourceCode is metadata, not the answer key.
    fields.push({ key, choices: exportChoices(item), definition: item });
  }
  if (skipRosterChildren && item.name === HOUSEHOLD_MEMBERS) return fields;
  for (const child of Object.values(item)) {
    if (Array.isArray(child)) child.forEach((entry) => collectExportFields(entry, fields, skipRosterChildren));
    else if (child && typeof child === "object") collectExportFields(child, fields, skipRosterChildren);
  }
  return fields;
}

function rosterFields(value: unknown): ExportField[] {
  if (!value || typeof value !== "object") return [];
  const item = value as Record<string, unknown>;
  if (item.name === HOUSEHOLD_MEMBERS) return collectExportFields(item).filter((field) => field.key !== HOUSEHOLD_MEMBERS);
  return Object.values(item).flatMap((child) => Array.isArray(child) ? child.flatMap(rosterFields) : rosterFields(child));
}

function householdMembers(answers: Record<string, unknown>): Record<string, unknown>[] {
  const roster = answers[HOUSEHOLD_MEMBERS];
  return Array.isArray(roster) ? roster.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : [];
}

function displayLabeledAnswer(value: unknown, definition?: Record<string, unknown>, fields?: Map<string, ExportField>): string {
  if (Array.isArray(value)) return value.map((entry) => displayLabeledAnswer(entry, definition, fields)).join(", ");
  if (value === undefined || value === null) return "";
  if (typeof value !== "object") return definition ? exportChoices(definition).get(String(value)) ?? String(value) : String(value);
  return Object.entries(value as Record<string, unknown>).map(([name, entry]) => {
    const children = ["items", "elements", "templateElements", "columns"].flatMap((key) => Array.isArray(definition?.[key]) ? definition[key] as unknown[] : []);
    let child = children.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).name === name) as Record<string, unknown> | undefined;
    if (!child && ["panel", "paneldynamic"].includes(String(definition?.type))) child = fields?.get(name)?.definition;
    // The residence widget stores its named special selection in a compound value too.
    if (!child && name === "living_since_birth" && definition?.name === "member_residence_duration") {
      child = fields?.get("member_living_since_birth")?.definition;
    }
    return `${name}: ${displayLabeledAnswer(entry, child, fields)}`;
  }).join("; ");
}

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  let text = Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value);
  // Some legacy timestamp payloads contain one literal quote pair; remove it
  // before CSV escaping so Excel does not display triple quotes.
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function displayAnswer(value: unknown, key?: string): string {
  // Preserve the exact stored answer: option values remain their numeric/string
  // codes. Only the household roster itself stays structured JSON; derived
  // repeat columns are flattened for clean spreadsheet display.
  if (Array.isArray(value)) {
    if (key === "hhq_household_members") return JSON.stringify(value);
    return value.map((entry) => displayAnswer(entry)).join(", ");
  }
  if (value === undefined || value === null) return "";
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([name, entry]) => `${name}: ${displayAnswer(entry)}`)
      .join("; ");
  }
  return String(value);
}

function answerForField(answers: Record<string, unknown>, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(answers, key)) return answers[key];

  // HHQ's renderer upgrades the legacy single-mobile field to a repeat panel;
  // export it back under the canonical language-management variable name.
  if (key === "hhq_contact_mobile" && Array.isArray(answers.hhq_contact_mobile_numbers)) {
    const numbers = answers.hhq_contact_mobile_numbers
      .map((row) => row && typeof row === "object" ? (row as Record<string, unknown>).mobile_number : undefined)
      .filter((value) => value !== undefined && value !== null && value !== "");
    return numbers.length === 1 ? numbers[0] : numbers;
  }

  // Repeated household/member answers are stored as rows inside a panel. If
  // the language definition exposes a nested variable as a column, collect
  // that variable from every stored row instead of returning a blank cell.
  const nestedValues: unknown[] = [];
  for (const value of Object.values(answers)) {
    if (!Array.isArray(value)) continue;
    for (const row of value) {
      if (row && typeof row === "object" && Object.prototype.hasOwnProperty.call(row, key)) {
        nestedValues.push((row as Record<string, unknown>)[key]);
      }
    }
  }
  return nestedValues.length > 0 ? nestedValues : undefined;
}

router.get("/export-submitters", requireDataAccess("can_access_raw_crfs"), async (req: Request, res: Response) => {
  try {
    const formCode = typeof req.query.form_code === "string" ? req.query.form_code.trim().toUpperCase() : "";
    if (!formCode) {
      sendError(res, 400, "FORM_CODE_REQUIRED", "form_code is required for a form-wise export");
      return;
    }
    const conditions: any[] = [eq(schema.formResponses.form_code, formCode)];
    await appendAreaScopeCondition(req.user!, schema.formResponses, conditions);
    const responses = await db.select({ submitted_by_user_id: schema.formResponses.submitted_by_user_id })
      .from(schema.formResponses).where(and(...conditions));
    const ids = [...new Set(responses.map((row) => row.submitted_by_user_id).filter((id): id is string => Boolean(id)))];
    const submitters = ids.length ? await db.select({ user_id: schema.users.user_id, username: schema.users.username, display_name: schema.users.display_name })
      .from(schema.users).where(inArray(schema.users.user_id, ids)) : [];
    submitters.sort((a, b) => (a.display_name || a.username).localeCompare(b.display_name || b.username));
    const profile = await getRequestDataAccessProfile(req);
    sendSuccess(res, profile.can_access_pii ? submitters : submitters.map((user) => ({ user_id: user.user_id, username: null, display_name: null })));
  } catch (error) {
    console.error("List export submitters error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

/** Download all submitted answers for one form with raw variable values. */
router.get("/export", requireDataAccess("can_access_raw_crfs"), async (req: Request, res: Response) => {
  try {
    const formCode = typeof req.query.form_code === "string" ? req.query.form_code.trim().toUpperCase() : "";
    if (!formCode) {
      sendError(res, 400, "FORM_CODE_REQUIRED", "form_code is required for a form-wise export");
      return;
    }
    const exportType = req.query.export_type ?? "form";
    const valueFormat = req.query.value_format ?? "coded";
    const privacy = req.query.privacy ?? "pis";
    if (!["form", "members"].includes(exportType as string) ||
      !["coded", "labels"].includes(valueFormat as string) || !["pis", "non_pis"].includes(privacy as string) ||
      (req.query.submitted_by_user_id !== undefined && (typeof req.query.submitted_by_user_id !== "string" || !req.query.submitted_by_user_id.trim())) ||
      (exportType === "members" && formCode !== "HHQ")) {
      sendError(res, 400, "INVALID_EXPORT_MODE", "Select a valid export type and value format; member export is available only for BHQ");
      return;
    }
    const profile = await getRequestDataAccessProfile(req);
    const capability = privacy === "non_pis" ? "can_access_deidentified_exports" : "can_access_pii";
    if (!profile[capability]) {
      sendError(res, 403, "INSUFFICIENT_DATA_ACCESS", `Requires ${capability}`);
      return;
    }
    const conditions: any[] = [eq(schema.formResponses.form_code, formCode)];
    if (typeof req.query.submitted_by_user_id === "string") conditions.push(eq(schema.formResponses.submitted_by_user_id, req.query.submitted_by_user_id.trim()));
    await appendAreaScopeCondition(req.user!, schema.formResponses, conditions);
    const [responses, formJson] = await Promise.all([
      db.select().from(schema.formResponses).where(and(...conditions)).orderBy(desc(schema.formResponses.created_at)),
      getEffectiveFormJson(formCode, req.user?.site_id ?? undefined),
    ]);
    if (!formJson) {
      sendError(res, 404, "FORM_NOT_FOUND", `Form code ${formCode} not found`);
      return;
    }
    const submitterIds = [...new Set(
      responses
        .map((response) => response.submitted_by_user_id)
        .filter((userId): userId is string => Boolean(userId)),
    )];
    const submitters = submitterIds.length > 0
      ? await db
          .select({
            user_id: schema.users.user_id,
            username: schema.users.username,
            display_name: schema.users.display_name,
          })
          .from(schema.users)
          .where(inArray(schema.users.user_id, submitterIds))
      : [];
    const submitterById = new Map(submitters.map((user) => [user.user_id, user]));
    // BHQ locality codes repeat between sites; runtime master options replace
    // the questionnaire's static examples and must also drive labelled exports.
    const [sites, localities] = formCode === "HHQ" && valueFormat === "labels"
      ? await Promise.all([db.select().from(schema.studySites), db.select().from(schema.studyLocalities)])
      : [[], []];
    const siteLabels = new Map(sites.map((site) => [String(site.site_id), site.site_name]));
    const localityLabels = new Map(localities.map((locality) => [JSON.stringify([String(locality.site_id), locality.locality_code]), locality.locality_name]));
    const preparedForm = valueFormat === "labels" || (exportType === "members" && privacy === "non_pis") ? getPreparedSurveyJson(formJson) : undefined;
    const labelFields = valueFormat === "labels" && preparedForm
      ? new Map(collectExportFields(preparedForm).map((field) => [field.key, field]))
      : undefined;
    const fields = exportType === "members" ? rosterFields(formJson) : collectExportFields(formJson, [], formCode === "HHQ");
    const knownMemberKeys = new Set([...fields, ...(preparedForm ? rosterFields(preparedForm) : [])].map((field) => field.key));
    if (exportType === "members") {
      for (const response of responses) {
        for (const member of householdMembers((response.answers_json || {}) as Record<string, unknown>)) {
          for (const key of Object.keys(member)) fields.push({ key, choices: new Map(), definition: {} });
        }
      }
    }
    // GPS controls are injected by the BHQ app and are absent from the raw form definition.
    if (formCode === "HHQ" && exportType !== "members") {
      for (const key of ["hhq_gps_latitude", "hhq_gps_longitude"]) fields.push({ key, choices: new Map(), definition: {} });
    }
    const uniqueFields = [...new Map(fields.map((field) => [field.key, field])).values()];
    const metadataHeaders = [
      "form_response_id",
      "household_id",
      "subject_type",
      "subject_id",
      "form_version",
      "submitted_at",
      "submitted_by_user_id",
      "submitted_by_username",
      "submitted_by_name",
      "device_id",
    ];
    const fieldHeaders = uniqueFields.map((field) => field.key);
    if (exportType === "members") {
      const used = new Set(metadataHeaders);
      fieldHeaders.forEach((key, index) => {
        while (used.has(key)) key = `member_${key}`;
        fieldHeaders[index] = key;
        used.add(key);
      });
    }
    const headers = [...metadataHeaders, ...fieldHeaders];
    const rows = responses.flatMap((response) => {
      const rawAnswers = (response.answers_json || {}) as Record<string, unknown>;
      const answers = (privacy === "non_pis" ? maskFormExportValue("", rawAnswers) : rawAnswers) as Record<string, unknown>;
      const submitter = response.submitted_by_user_id
        ? submitterById.get(response.submitted_by_user_id)
        : undefined;
      const rawMetadata = [
        response.form_response_id,
        exportType === "members" && response.household_id == null && typeof rawAnswers.hhq_household_id === "string"
          ? rawAnswers.hhq_household_id : response.household_id,
        response.subject_type,
        response.subject_id,
        response.form_version,
        response.synced_at || response.created_at,
        response.submitted_by_user_id,
        submitter?.username,
        submitter?.display_name,
        response.device_id,
      ];
      const metadata = privacy === "non_pis" ? rawMetadata.map((value, index) => maskFormExportValue(metadataHeaders[index], value)) : rawMetadata;
      const display = (value: unknown, field: ExportField) => {
        if (valueFormat === "labels" && formCode === "HHQ") {
          if (field.key === "hhq_site_id") return value == null ? "" : siteLabels.get(String(value)) ?? String(value);
          if (field.key === "hhq_locality_code") {
            const siteId = response.site_id ?? rawAnswers.hhq_site_id;
            return value == null ? "" : localityLabels.get(JSON.stringify([String(siteId), String(value)])) ?? String(value);
          }
        }
        return valueFormat === "labels"
          ? displayLabeledAnswer(value, labelFields?.get(field.key)?.definition, labelFields)
          : displayAnswer(value, field.key);
      };
      if (exportType === "members") return householdMembers(answers).map((member) => [
        ...metadata,
        ...uniqueFields.map((field) => {
          const value = member[field.key];
          if (privacy === "non_pis" && !knownMemberKeys.has(field.key) && value !== undefined && value !== null && value !== "") return FORM_EXPORT_MASK;
          return valueFormat === "coded" && value && typeof value === "object" && !Array.isArray(value)
            ? JSON.stringify(value) : display(value, field);
        }),
      ]);
      return [[...metadata, ...uniqueFields.map((field) => formCode === "HHQ" && field.key === HOUSEHOLD_MEMBERS
        ? householdMembers(answers).map((member) => member.member_name).filter((name) => name !== undefined && name !== null && name !== "").join(", ")
        : display(answerForField(answers, field.key), field))]];
    });
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
    const filename = exportType === "members" ? "bhq-members" : `${formCode === "HHQ" ? "bhq" : formCode.toLowerCase()}-form-responses`;
    res.status(200).set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=${filename}${privacy === "non_pis" ? "-non-pis" : ""}${valueFormat === "labels" ? "-uncoded" : ""}.csv` }).send(`\uFEFF${csv}`);
  } catch (error) {
    console.error("Export form responses error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

/**
 * GET /api/v1/form-responses
 * List form responses with filtering and pagination
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      task_id: taskId,
      form_code: formCode,
      household_id: householdId,
      sync_status: syncStatus,
      page: pageStr,
      per_page: perPageStr,
    } = req.query;

    const { page, perPage, offset } = getPagination({
      page: pageStr,
      per_page: perPageStr,
    });

    const conditions: any[] = [];

    if (taskId) {
      conditions.push(eq(schema.formResponses.task_id, taskId as string));
    }

    if (formCode) {
      conditions.push(eq(schema.formResponses.form_code, formCode as string));
    }

    if (householdId) {
      conditions.push(eq(schema.formResponses.household_id, householdId as string));
    }

    if (syncStatus) {
      // Map sync_status to response_status if needed
      conditions.push(eq(schema.formResponses.response_status, syncStatus as string));
    }
    await appendAreaScopeCondition(req.user!, schema.formResponses, conditions);

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(schema.formResponses)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult[0]?.count || 0;

    // Get paginated results
    const responses = await db
      .select({
        id: schema.formResponses.form_response_id,
        task_id: schema.formResponses.task_id,
        form_code: schema.formResponses.form_code,
        form_version: schema.formResponses.form_version,
        submitted_at: schema.formResponses.synced_at,
        sync_status: schema.formResponses.response_status,
        device_id: schema.formResponses.device_id,
        submitted_by_user_id: schema.formResponses.submitted_by_user_id,
      })
      .from(schema.formResponses)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.formResponses.created_at))
      .limit(perPage)
      .offset(offset);

    sendSuccess(res, responses, 200, { total, page, per_page: perPage });
  } catch (error) {
    console.error("List form responses error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

/**
 * GET /api/v1/form-responses/:id
 * Get full form response with task summary
 */
router.get("/:id", requireDataAccess("can_access_raw_crfs"), async (req: Request, res: Response) => {
  try {
    const responseId = req.params.id;
    const conditions = [eq(schema.formResponses.form_response_id, responseId)];
    await appendAreaScopeCondition(req.user!, schema.formResponses, conditions);

    // Get form response
    const [response] = await db
      .select()
      .from(schema.formResponses)
      .where(and(...conditions));

    if (!response) {
      sendError(res, 404, "FORM_RESPONSE_NOT_FOUND", "Form response not found");
      return;
    }

    // Get task summary if task_id exists
    let taskSummary = null;
    if (response.task_id) {
      const [task] = await db
        .select({
          id: schema.followUpTasks.task_id,
          task_type: schema.followUpTasks.task_type,
          target_date: schema.followUpTasks.target_date,
          household_id: schema.followUpTasks.household_id,
          subject_id: schema.followUpTasks.subject_id,
        })
        .from(schema.followUpTasks)
        .where(eq(schema.followUpTasks.task_id, response.task_id));

      taskSummary = task || null;
    }

    // Parse answers_json if stored as string
    const answers =
      typeof response.answers_json === "string"
        ? JSON.parse(response.answers_json)
        : response.answers_json;

    // Parse prefill_snapshot_json if stored as string
    const prefillSnapshot =
      typeof response.prefill_snapshot_json === "string"
        ? JSON.parse(response.prefill_snapshot_json)
        : response.prefill_snapshot_json;

    const result = {
      ...response,
      answers_json: answers,
      prefill_snapshot_json: prefillSnapshot,
      task: taskSummary,
    };

    sendSuccess(res, result);
  } catch (error) {
    console.error("Get form response error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

export default router;
