import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { getPreparedSurveyJson } from "../../../../expo/src/modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import { FORM_EXPORT_MASK, maskFormExportValue } from "../lib/formExportPrivacy";

const require = createRequire(import.meta.url);

test("BHQ exports stored GPS coordinates without changing answers, scope or other forms", async () => {
  let formCode = "HHQ";
  const formJson = { pages: [{ elements: [
    { type: "text", name: "head_name" },
    { type: "text", name: "hhq_contact_mobile" },
  ] }] };
  const responses = [
    { form_response_id: "with-gps", household_id: "2-10-0001-01", submitted_by_user_id: "worker", answers_json: {
      head_name: "Head", hhq_gps_latitude: 0, hhq_gps_longitude: 77.123456,
      hhq_contact_mobile_numbers: [{ mobile_number: "9876543210" }],
    } },
    { form_response_id: "legacy", household_id: "2-10-0002-01", answers_json: { head_name: "Legacy" } },
  ];
  const originalAnswers = JSON.stringify(responses);
  const tables = {
    formResponses: { form_code: "form_code", created_at: "created_at" },
    users: { user_id: "user_id", username: "username", display_name: "display_name" },
  };
  let scopeCalls = 0;
  const capabilities: string[] = [];
  const modules: Record<string, unknown> = {
    express: { Router: require("express").Router },
    "drizzle-orm": {
      eq: (field: string, value: unknown) => ({ field, value }),
      and: (...conditions: unknown[]) => conditions,
      desc: (field: string) => field,
      inArray: (field: string, values: unknown[]) => ({ field, values }),
    },
    "../db": { schema: tables, db: {
      select() { return { from(table: unknown) { return { where(conditions: any) {
        if (table === tables.users) return Promise.resolve([{ user_id: "worker", username: "staff", display_name: "Field worker" }]);
        assert.equal(table, tables.formResponses);
        assert.deepEqual(JSON.parse(JSON.stringify(conditions)), [{ field: "form_code", value: formCode }, { site_id: 2 }]);
        return { orderBy: async () => responses };
      } }; } }; },
    } },
    "../lib/errors": { sendError: () => assert.fail("Export unexpectedly failed") },
    "../lib/pagination": {},
    "../lib/areaScope": { appendAreaScopeCondition: async (user: any, table: unknown, conditions: unknown[]) => {
      assert.equal(user.site_id, 2); assert.equal(table, tables.formResponses);
      scopeCalls++; conditions.push({ site_id: user.site_id });
    } },
    "../lib/dataAccess": { requireDataAccess: (capability: string) => {
      capabilities.push(capability); return (_req: unknown, _res: unknown, next: () => void) => next();
    }, getRequestDataAccessProfile: async () => ({ can_access_pii: true, can_access_deidentified_exports: true }) },
    "../../../../expo/src/modules/questionnaires/questionnaireSurveyJsonTransforms.js": { getPreparedSurveyJson },
    "../lib/formExportPrivacy": { FORM_EXPORT_MASK, maskFormExportValue },
    "../lib/formLanguage": { getEffectiveFormJson: async (code: string, siteId: number) => {
      assert.equal(code, formCode); assert.equal(siteId, 2); return formJson;
    } },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("./form-responses.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: any = {};
  runInNewContext(compiled, { exports, console, require(name: string) {
    assert.ok(name in modules, `Unexpected dependency ${name}`); return modules[name];
  } });
  const route = exports.default.stack.find((layer: any) => layer.route?.path === "/export").route;
  assert.equal(route.stack.length, 2, "Raw-CRF access middleware remains registered before the handler");
  assert.ok(capabilities.includes("can_access_raw_crfs"));
  async function download() {
    let status = 0, body = "", headers: Record<string, string> = {};
    const res = {
      status(value: number) { status = value; return this; },
      set(value: Record<string, string>) { headers = value; return this; },
      send(value: string) { body = value; },
    };
    await route.stack.at(-1).handle({ query: { form_code: ` ${formCode.toLowerCase()} ` }, user: { site_id: 2 } }, res);
    assert.equal(status, 200);
    assert.equal(headers["Content-Type"], "text/csv; charset=utf-8");
    assert.ok(body.startsWith("\uFEFF"));
    const rows = body.slice(1).trimEnd().split("\r\n").map(row => row.split(","));
    return { names: rows[0], rows: rows.slice(1) };
  }
  const gps = await download();
  const latitude = gps.names.indexOf("hhq_gps_latitude"), longitude = gps.names.indexOf("hhq_gps_longitude");
  assert.ok(latitude >= 0 && longitude >= 0, "Client-injected GPS fields must be included even when absent from the raw definition");
  assert.equal(gps.rows[0][latitude], "0", "Zero latitude is a coordinate, not a missing answer");
  assert.equal(gps.rows[0][longitude], "77.123456");
  assert.equal(gps.rows[1][latitude], "", "Legacy rows without GPS stay blank");
  assert.equal(gps.rows[1][longitude], "");
  assert.equal(gps.rows[0][gps.names.indexOf("submitted_by_username")], "staff");
  assert.equal(gps.rows[0][gps.names.indexOf("hhq_contact_mobile")], "9876543210");
  formJson.pages[0].elements.push({ type: "text", name: "hhq_gps_latitude" }, { type: "text", name: "hhq_gps_longitude" });
  const deduplicated = await download();
  assert.equal(deduplicated.names.filter(key => key === "hhq_gps_latitude").length, 1);
  assert.equal(deduplicated.names.filter(key => key === "hhq_gps_longitude").length, 1);
  formJson.pages[0].elements.splice(2);
  formCode = "WQ";
  const other = await download();
  assert.deepEqual(other.names, gps.names.filter(key => !key.startsWith("hhq_gps_")), "Other form exports do not gain BHQ GPS columns");
  assert.equal(scopeCalls, 3);
  assert.equal(JSON.stringify(responses), originalAnswers, "Export never changes stored answers");
});

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let index = text.startsWith("\uFEFF") ? 1 : 0; index < text.length; index++) {
    const value = text[index];
    if (value === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && value === ",") { row.push(cell); cell = ""; }
    else if (!quoted && value === "\r" && text[index + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; index++; }
    else cell += value;
  }
  return rows;
}

test("BHQ roster split, coded/labelled data, submitter filters and privacy preserve scope and evidence", async () => {
  let formCode = "HHQ";
  const fields = [
    { type: "radiogroup", name: "hhq_site_id", choices: [{ value: 2, text: "Static site" }] },
    { type: "radiogroup", name: "hhq_locality_code", choices: [{ value: "01", text: "Sunped" }, { value: "99", text: "Wrong static locality" }] },
    { type: "radiogroup", name: "status", choices: [{ value: 1, text: { default: "Accepted" } }, { value: 2, text: "Declined" }] },
    { type: "checkbox", name: "many", choices: [{ value: "A", text: "Option A" }, { value: "B", text: "Option B" }] },
    { type: "multipletext", name: "birth_date", items: [{ name: "month", unknownChoice: { value: 98, text: { default: "Unknown month" } } }, { name: "year", unknownChoice: { value: 9998, text: "Unknown year" } }] },
    { type: "paneldynamic", name: "history", templateElements: [{ type: "radiogroup", name: "outcome", choices: [{ value: 1, text: "Born Alive" }] }] },
    { type: "text", name: "hhq_household_head_name" }, { type: "text", name: "hhq_household_address" },
    { type: "text", name: "hhq_contact_mobile" },
    { type: "paneldynamic", name: "hhq_household_members", templateElements: [
      { type: "text", name: "member_name" }, { type: "text", name: "member_individual_id" },
      { type: "radiogroup", name: "member_sex", choices: [{ value: 2, text: "Female" }, { value: 1, text: "Male" }] },
      { type: "radiogroup", name: "member_marital_status", choices: [{ value: 3, text: "Widowed" }] },
      { type: "multipletext", name: "member_residence_duration", specialChoices: [{ name: "member_living_since_birth", value: 95, text: "Living since birth" }], items: [{ name: "years" }, { name: "months" }] },
      { type: "radiogroup", name: "member_living_since_birth", choices: [{ value: 95, text: "Living since birth" }] },
    ] },
  ];
  let formJson: any = { pages: [{ elements: fields }] };
  const responses: any[] = [
    { form_response_id: "response-a", household_id: "2-10-0001A-01", submitted_by_user_id: "worker-a", site_id: 2, device_id: "phone-a", answers_json: {
      status: 1, many: ["A", "B", "unknown"], birth_date: { month: "98", year: 9998 }, history: [{ outcome: 1, note: "unchanged" }],
      hhq_household_head_name: "Private Head", hhq_household_address: "Private address", hhq_gps_latitude: 0, hhq_gps_longitude: 77.3,
      hhq_contact_mobile_numbers: [{ mobile_number: "9876543210" }],
      hhq_household_members: [
        { member_name: 'Asha, "Devi"\nsecond line', member_individual_id: "2-10-0001A-01-01", member_sex: "2", member_marital_status: 3, member_residence_duration: { living_since_birth: 95 }, member_living_since_birth: 95, legacy_note: "Original member note", extra_private_field: "Unknown identity 9876543210" },
        { member_name: "Second woman", member_individual_id: "2-10-0001A-01-02", member_sex: 77, member_marital_status: null, member_residence_duration: { years: "05", months: "00" } },
      ],
    } },
    { form_response_id: "empty-roster", household_id: "2-10-0002-01", submitted_by_user_id: "worker-b", site_id: 2, answers_json: { status: 2, hhq_household_members: [] } },
    { form_response_id: "legacy", household_id: "2-10-0003-01", site_id: 2, answers_json: { status: 999 } },
    { form_response_id: "outside-scope", household_id: "3-10-0001-01", submitted_by_user_id: "worker-other", site_id: 3, answers_json: { hhq_household_members: [{ member_name: "Secret outside site" }] } },
  ];
  const evidence = JSON.stringify(responses);
  let canPii = true, canDeidentified = true, reads = 0;
  const tables = { formResponses: { form_code: "form_code", submitted_by_user_id: "submitted_by_user_id", created_at: "created_at" }, users: { user_id: "user_id" }, studySites: {}, studyLocalities: {} };
  let visibleSites: (number | null)[] = [2];
  const submitters = [{ user_id: "worker-a", username: "staff-a", display_name: "Worker A" }, { user_id: "worker-b", username: "staff-b", display_name: "Worker B" }, { user_id: "worker-other", username: "other", display_name: "Other site" }];
  const modules: Record<string, unknown> = {
    express: { Router: require("express").Router },
    "drizzle-orm": { eq: (field: string, value: unknown) => ({ field, value }), and: (...conditions: unknown[]) => conditions, desc: (field: string) => field, inArray: (field: string, values: unknown[]) => ({ field, values }) },
    "../db": { schema: tables, db: { select() { return { from(table: unknown) {
      if (table === tables.studySites) return Promise.resolve([{ site_id: 1, site_name: "Bareilly" }, { site_id: 2, site_name: "Ballabhgarh" }]);
      if (table === tables.studyLocalities) return Promise.resolve([{ site_id: 1, locality_code: "01", locality_name: "Bareilly locality" }, { site_id: 2, locality_code: "01", locality_name: "Ballabhgarh locality" }]);
      return { where(conditions: any) {
      reads++;
      if (table === tables.users) return Promise.resolve(submitters.filter((user) => conditions.values.includes(user.user_id)));
      assert.equal(table, tables.formResponses);
      assert.ok(conditions.some((condition: any) => condition.site_id === 2), "Every export query must carry server area scope");
      assert.equal(conditions[0].value, formCode);
      const rows = responses.filter((response) => visibleSites.includes(response.site_id) && conditions.every((condition: any) => condition.field !== "submitted_by_user_id" || response.submitted_by_user_id === condition.value));
      return { orderBy: async () => rows, then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject) };
    } }; } }; } } },
    "../lib/errors": { sendError: (res: any, status: number, code: string, message: string) => res.status(status).json({ code, message }), sendSuccess: (res: any, data: unknown) => res.status(200).json({ data }) },
    "../lib/pagination": {},
    "../lib/areaScope": { appendAreaScopeCondition: async (_user: unknown, _table: unknown, conditions: unknown[]) => conditions.push({ site_id: 2 }) },
    "../lib/dataAccess": { requireDataAccess: () => (_req: unknown, _res: unknown, next: () => void) => next(), getRequestDataAccessProfile: async () => ({ can_access_pii: canPii, can_access_deidentified_exports: canDeidentified }) },
    "../lib/formLanguage": { getEffectiveFormJson: async () => formJson },
    "../../../../expo/src/modules/questionnaires/questionnaireSurveyJsonTransforms.js": { getPreparedSurveyJson },
    "../lib/formExportPrivacy": { FORM_EXPORT_MASK, maskFormExportValue },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("./form-responses.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: any = {};
  runInNewContext(compiled, { exports, console, require(name: string) { assert.ok(name in modules, name); return modules[name]; } });
  async function download(query: Record<string, unknown> = {}, path = "/export") {
    const route = exports.default.stack.find((layer: any) => layer.route?.path === path).route;
    let status = 0, body: any, headers: Record<string, string> = {};
    const res = { status(code: number) { status = code; return this; }, set(values: Record<string, string>) { headers = values; return this; }, send(value: string) { body = value; }, json(value: unknown) { body = value; } };
    await route.stack.at(-1).handle({ query: { form_code: formCode, ...query }, user: { site_id: 2 } }, res);
    const parsed = typeof body === "string" ? parseCsv(body) : [];
    return { status, body, headers, names: parsed[0] || [], rows: parsed.slice(1) };
  }
  const normal = await download();
  assert.equal(normal.status, 200); assert.equal(normal.rows.length, 3);
  assert.equal(normal.rows[0][normal.names.indexOf("hhq_household_members")], 'Asha, "Devi"\nsecond line, Second woman');
  assert.ok(!normal.names.includes("member_sex")); assert.ok(!normal.names.includes("member_name"));
  assert.equal(normal.rows[0][normal.names.indexOf("hhq_gps_latitude")], "0");
  // Site-specific runtime masters take precedence over static questionnaire examples.
  visibleSites = [1, 2, null];
  responses[0].answers_json.hhq_site_id = 1; // Conflicts with authoritative site 2.
  responses[0].answers_json.hhq_locality_code = "01";
  responses[1].site_id = 1;
  responses[1].answers_json.hhq_site_id = 1;
  responses[1].answers_json.hhq_locality_code = "01";
  responses[2].site_id = null;
  responses[2].answers_json.hhq_site_id = 1;
  responses[2].answers_json.hhq_locality_code = "01";
  const masterLabels = await download({ value_format: "labels" });
  const localityColumn = masterLabels.names.indexOf("hhq_locality_code");
  assert.equal(masterLabels.rows[0][localityColumn], "Ballabhgarh locality", "Response site metadata determines locality despite conflicting answer");
  assert.equal(masterLabels.rows[1][localityColumn], "Bareilly locality", "Repeated locality code uses its own response site");
  assert.equal(masterLabels.rows[2][localityColumn], "Bareilly locality", "Missing site metadata falls back to the stored site answer");
  assert.equal(masterLabels.rows[0][masterLabels.names.indexOf("hhq_site_id")], "Bareilly");
  responses[0].answers_json.hhq_site_id = 99;
  responses[0].answers_json.hhq_locality_code = "99";
  const missingMaster = await download({ value_format: "labels" });
  assert.equal(missingMaster.rows[0][localityColumn], "99", "Missing locality master retains code instead of static label");
  assert.equal(missingMaster.rows[0][missingMaster.names.indexOf("hhq_site_id")], "99");
  const masterCoded = await download();
  assert.equal(masterCoded.rows[1][localityColumn], "01", "Coded export preserves leading zero in locality code");
  for (let index = 0; index < 3; index++) {
    responses[index].site_id = 2;
    delete responses[index].answers_json.hhq_site_id;
    delete responses[index].answers_json.hhq_locality_code;
  }
  visibleSites = [2];
  const members = await download({ export_type: "members" });
  assert.equal(members.rows.length, 2); assert.equal(new Set(members.names).size, members.names.length);
  assert.equal(members.rows[0][members.names.indexOf("household_id")], "2-10-0001A-01");
  assert.equal(members.rows[1][members.names.indexOf("member_individual_id")], "2-10-0001A-01-02");
  assert.equal(members.rows[0][members.names.indexOf("member_sex")], "2");
  assert.equal(members.rows[1][members.names.indexOf("member_marital_status")], "");
  assert.equal(members.rows[0][members.names.indexOf("legacy_note")], "Original member note");
  responses[0].answers_json.hhq_household_id = "2-10-legacy-01";
  const authoritative = await download({ export_type: "members" });
  assert.equal(authoritative.rows[0][authoritative.names.indexOf("household_id")], "2-10-0001A-01", "Stored response identity wins over a conflicting answer");
  responses[0].household_id = null;
  const legacyIdentity = await download({ export_type: "members" });
  assert.equal(legacyIdentity.rows[0][legacyIdentity.names.indexOf("household_id")], "2-10-legacy-01", "Legacy member export uses its exact stored household answer when metadata is absent");
  responses[0].household_id = "2-10-0001A-01";
  delete responses[0].answers_json.hhq_household_id;
  const labelled = await download({ export_type: "members", value_format: "labels" });
  assert.equal(labelled.rows[0][labelled.names.indexOf("member_sex")], "Female");
  assert.equal(labelled.rows[0][labelled.names.indexOf("member_marital_status")], "Widowed");
  assert.equal(labelled.rows[1][labelled.names.indexOf("member_sex")], "77", "Unknown codes stay unchanged");
  assert.equal(labelled.rows[0][labelled.names.indexOf("member_residence_duration")], "living_since_birth: Living since birth");
  assert.ok(labelled.headers["Content-Disposition"].includes("bhq-members-uncoded.csv"));
  const hidden = await download({ export_type: "members", privacy: "non_pis", value_format: "labels" });
  assert.equal(hidden.rows.length, 2); assert.ok(!hidden.body.includes("Asha")); assert.ok(!hidden.body.includes("Private address"));
  assert.equal(hidden.rows[0][hidden.names.indexOf("member_name")], "***");
  assert.equal(hidden.rows[0][hidden.names.indexOf("member_sex")], "Female");
  assert.equal(hidden.rows[0][hidden.names.indexOf("submitted_by_name")], "***");
  assert.equal(hidden.rows[0][hidden.names.indexOf("legacy_note")], "***");
  assert.equal(members.rows[0][members.names.indexOf("extra_private_field")], "Unknown identity 9876543210");
  assert.equal(hidden.rows[0][hidden.names.indexOf("extra_private_field")], "***", "Unclassified legacy member columns cannot leak through non-PIS export");
  const hiddenHousehold = await download({ privacy: "non_pis" });
  for (const key of ["hhq_household_head_name", "hhq_household_address", "hhq_contact_mobile", "hhq_gps_latitude", "hhq_gps_longitude"]) {
    assert.equal(hiddenHousehold.rows[0][hiddenHousehold.names.indexOf(key)], "***", `${key}: non-PIS masks identifiers before serialization`);
  }
  assert.ok(!hiddenHousehold.body.includes("Second woman"));
  assert.ok(!hiddenHousehold.body.includes("9876543210"));
  assert.equal((await download({ submitted_by_user_id: "worker-b" })).rows.length, 1);
  assert.equal((await download({ submitted_by_user_id: "worker-other" })).rows.length, 0, "User filter cannot widen scope");
  const options = await download({}, "/export-submitters");
  assert.deepEqual(JSON.parse(JSON.stringify(options.body.data)).map((user: any) => user.user_id), ["worker-a", "worker-b"]);
  canPii = false;
  assert.equal((await download()).status, 403);
  assert.equal((await download({ privacy: "non_pis" })).status, 200);
  assert.ok((await download({}, "/export-submitters")).body.data.every((user: any) => user.username === null && user.display_name === null));
  canDeidentified = false;
  assert.equal((await download({ privacy: "non_pis" })).status, 403);
  canPii = canDeidentified = true;
  const beforeInvalid = reads;
  for (const query of [{ export_type: "invalid" }, { value_format: "invalid" }, { privacy: "invalid" }, { submitted_by_user_id: [] }]) assert.equal((await download(query)).status, 400);
  assert.equal(reads, beforeInvalid, "Invalid modes must fail before response reads");
  for (const code of ["WQ", "HRF", "PEF", "UF", "PFF", "POF", "BAF", "SBF", "NFF", "CDF", "PSF"]) {
    formCode = code;
    const coded = await download();
    assert.equal((await download({ value_format: "coded", privacy: "pis" })).body, coded.body, `${code}: defaults preserve coded output`);
    const decoded = await download({ value_format: "labels" });
    assert.deepEqual(decoded.names, coded.names, `${code}: choice labels do not change columns`);
    assert.equal(decoded.rows[0][decoded.names.indexOf("status")], "Accepted");
    assert.equal(decoded.rows[0][decoded.names.indexOf("many")], "Option A, Option B, unknown");
    assert.equal(decoded.rows[0][decoded.names.indexOf("birth_date")], "month: Unknown month; year: Unknown year");
    assert.equal(decoded.rows[0][decoded.names.indexOf("history")], "outcome: Born Alive; note: unchanged");
    assert.equal((await download({ export_type: "members" })).status, 400);
    assert.equal((await download({ privacy: "non_pis" })).status, 200);
  }
  formCode = "WQ";
  formJson = JSON.parse(readFileSync(new URL("../../../../expo/src/data/forms/baseline_woman_s_questionnaire_v2026.05.09.json", import.meta.url), "utf8"));
  const grade = "wq_01_respondent_s_backgr_what_is_the_highest_grade_you_completed";
  responses[0].answers_json[grade] = 5;
  const nativeGrade = await download({ value_format: "labels" });
  assert.equal(nativeGrade.rows[0][nativeGrade.names.indexOf(grade)], "5", "Prepared free-entry years must not decode as a retired raw option");
  delete responses[0].answers_json[grade];
  assert.equal(JSON.stringify(responses), evidence, "Every export is read-only and keeps original stored answers");
});
