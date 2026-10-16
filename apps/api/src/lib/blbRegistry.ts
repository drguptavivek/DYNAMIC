/** Parser and row contract for the one-row-per-person Ballabgarh HDSS export. */

/** Validates HDSS source CSV locally without exposing participant values in errors. */
export const DEFAULT_HDSS_SOURCE_AGE_AS_OF = "2026-10-14";

const REQUIRED_COLUMNS = [
  "hdss_unique_id",
  "village_code",
  "village_name",
  "phc_code",
  "phc_name",
  "name",
  "age",
  "sex",
  "house_no",
  "family_no",
  "ind_no",
  "domicile",
  "curr_status",
  "death_date",
  "migrated_out_date",
  "migration_reason",
] as const;

export type HdssRegistryRow = {
  uid: string;
  village_code: string | null;
  village_name: string | null;
  phc_code: string | null;
  phc_name: string | null;
  name: string | null;
  age_years: number | null;
  sex: string | null;
  hh_list_no: string | null;
  family_no: string | null;
  ind_no: string | null;
  domicile: string | null;
  curr_status: string | null;
  death_date: string | null;
  migrated_out_date: string | null;
  migration_reason: string | null;
  source_age_as_of: string;
  status: "alive" | "dead" | "emigrated";
};

export type HdssParseIssue = {
  line: number;
  code:
    | "empty_file"
    | "missing_column"
    | "duplicate_column"
    | "malformed_csv"
    | "wrong_column_count"
    | "missing_uid"
    | "invalid_uid"
    | "duplicate_uid"
    | "invalid_age"
    | "invalid_sex"
    | "invalid_domicile"
    | "invalid_source_age_as_of";
  column?: string;
};

export type HdssParseResult = {
  rows: HdssRegistryRow[];
  issues: HdssParseIssue[];
  source_age_as_of: string;
};

export type HdssRegistryCursor = {
  uid: string;
  generation: string;
  scope_hash: string;
};

/** Encode a cursor without exposing its revision fields in a URL. */
export function encodeHdssRegistryCursor(cursor: HdssRegistryCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/** Decode and structurally validate a cursor; malformed input returns null. */
export function decodeHdssRegistryCursor(value: unknown): HdssRegistryCursor | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!decoded || typeof decoded !== "object") return null;
    const candidate = decoded as Record<string, unknown>;
    if (
      typeof candidate.uid !== "string" ||
      candidate.uid.length === 0 ||
      candidate.uid.length > 512 ||
      /[\u0000-\u001f\u007f]/.test(candidate.uid) ||
      typeof candidate.generation !== "string" ||
      candidate.generation.length === 0 ||
      candidate.generation.length > 128 ||
      typeof candidate.scope_hash !== "string" ||
      !/^[a-f0-9]{64}$/.test(candidate.scope_hash)
    ) {
      return null;
    }
    return {
      uid: candidate.uid,
      generation: candidate.generation,
      scope_hash: candidate.scope_hash,
    };
  } catch {
    return null;
  }
}

type CsvRecord = { line: number; cells: string[] };

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsvRecords(source: string): { records: CsvRecord[]; issues: HdssParseIssue[] } {
  const records: CsvRecord[] = [];
  const issues: HdssParseIssue[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let closedQuote = false;
  let malformedLine: number | null = null;
  let line = 1;
  let recordLine = 1;

  const finishRecord = () => {
    if (cells.length > 0 || cell.length > 0) {
      records.push({ line: recordLine, cells: [...cells, cell] });
    }
    cells = [];
    cell = "";
    closedQuote = false;
    recordLine = line + 1;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else if (!quoted && cell.length === 0 && !closedQuote) {
        quoted = true;
      } else if (quoted) {
        quoted = false;
        closedQuote = true;
      } else {
        malformedLine = line;
        break;
      }
      continue;
    }
    if (character === "," && !quoted) {
      cells.push(cell);
      cell = "";
      closedQuote = false;
      continue;
    }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (closedQuote && character === "\r" && next !== "\n") {
        malformedLine = line;
        break;
      }
      if (character === "\r" && next === "\n") index += 1;
      finishRecord();
      line += 1;
      continue;
    }
    if (closedQuote) {
      malformedLine = line;
      break;
    }
    if (character === "\n") line += 1;
    cell += character;
  }

  if (quoted || malformedLine !== null) {
    issues.push({ line: malformedLine ?? recordLine, code: "malformed_csv" });
    return { records, issues };
  }
  if (cells.length > 0 || cell.length > 0) finishRecord();
  return { records, issues };
}

function nullableText(value: string | undefined): string | null {
  const raw = value ?? "";
  return raw.length > 0 ? raw : null;
}

function deriveStatus(domicile: string | null): HdssRegistryRow["status"] | null {
  switch (domicile?.trim().toLowerCase()) {
    case "resident":
    case "returned resident":
    case "visitor":
      return "alive";
    case "dead":
      return "dead";
    case "emigrated":
      return "emigrated";
    default:
      return null;
  }
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Parse and validate the one-row-per-person HDSS export without exposing row
 * contents in validation issues. All source rows are returned when valid,
 * including rows whose name or household identifiers are blank.
 */
export function parseHdssRegistryCsv(
  source: string,
  sourceAgeAsOf = DEFAULT_HDSS_SOURCE_AGE_AS_OF,
): HdssParseResult {
  const issues: HdssParseIssue[] = [];
  if (!isIsoDate(sourceAgeAsOf)) {
    issues.push({ line: 1, code: "invalid_source_age_as_of" });
  }

  const parsed = parseCsvRecords(source);
  issues.push(...parsed.issues);
  if (parsed.records.length === 0) {
    issues.push({ line: 1, code: "empty_file" });
    return { rows: [], issues, source_age_as_of: sourceAgeAsOf };
  }

  const headerRecord = parsed.records[0];
  const headers = headerRecord.cells.map(normalizeHeader);
  const headerIndexes = new Map<string, number>();
  headers.forEach((header, index) => {
    if (!header) return;
    if (headerIndexes.has(header)) {
      issues.push({ line: headerRecord.line, code: "duplicate_column", column: header });
    } else {
      headerIndexes.set(header, index);
    }
  });
  for (const column of REQUIRED_COLUMNS) {
    if (!headerIndexes.has(column)) {
      issues.push({ line: headerRecord.line, code: "missing_column", column });
    }
  }
  if (issues.length > 0) return { rows: [], issues, source_age_as_of: sourceAgeAsOf };

  const rows: HdssRegistryRow[] = [];
  const seenUids = new Set<string>();
  for (const record of parsed.records.slice(1)) {
    if (record.cells.length !== headers.length) {
      issues.push({ line: record.line, code: "wrong_column_count" });
      continue;
    }
    const get = (column: string): string => record.cells[headerIndexes.get(column) ?? -1] ?? "";
    // The legacy person ID is an opaque source key. Preserve punctuation and
    // leading zeroes exactly; only control characters are structurally unsafe.
    const uid = get("hdss_unique_id");
    if (!uid.trim()) {
      issues.push({ line: record.line, code: "missing_uid", column: "hdss_unique_id" });
      continue;
    }
    if (/[\u0000-\u001f\u007f]/.test(uid)) {
      issues.push({ line: record.line, code: "invalid_uid", column: "hdss_unique_id" });
      continue;
    }
    if (seenUids.has(uid)) {
      issues.push({ line: record.line, code: "duplicate_uid", column: "hdss_unique_id" });
      continue;
    }
    seenUids.add(uid);

    const ageText = get("age").trim();
    const ageYears = ageText === "" ? null : Number(ageText);
    if (ageYears !== null && (!Number.isInteger(ageYears) || ageYears < 0)) {
      issues.push({ line: record.line, code: "invalid_age", column: "age" });
      continue;
    }
    const sexText = get("sex").trim();
    if (sexText !== "" && sexText !== "1" && sexText !== "2") {
      issues.push({ line: record.line, code: "invalid_sex", column: "sex" });
      continue;
    }
    const domicile = nullableText(get("domicile"));
    const status = deriveStatus(domicile);
    if (!status) {
      issues.push({ line: record.line, code: "invalid_domicile", column: "domicile" });
      continue;
    }

    rows.push({
      uid,
      village_code: nullableText(get("village_code")),
      village_name: nullableText(get("village_name")),
      phc_code: nullableText(get("phc_code")),
      phc_name: nullableText(get("phc_name")),
      name: nullableText(get("name")),
      age_years: ageYears,
      sex: sexText || null,
      hh_list_no: nullableText(get("house_no")),
      family_no: nullableText(get("family_no")),
      ind_no: nullableText(get("ind_no")),
      domicile,
      curr_status: nullableText(get("curr_status")),
      death_date: nullableText(get("death_date")),
      migrated_out_date: nullableText(get("migrated_out_date")),
      migration_reason: nullableText(get("migration_reason")),
      source_age_as_of: sourceAgeAsOf,
      status,
    });
  }

  return { rows: issues.length > 0 ? [] : rows, issues, source_age_as_of: sourceAgeAsOf };
}

export const hdssRegistryRequiredColumns = REQUIRED_COLUMNS;
