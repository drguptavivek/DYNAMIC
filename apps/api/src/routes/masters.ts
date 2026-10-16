import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { eq, and, gt, ilike, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import multer from "multer";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db, schema } from "../db";
import { requireRole } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { requireDataAccess } from "../lib/dataAccess";
import { buildAreaScopeCondition } from "../lib/areaScope";
import { buildHdssRegistryScopeCondition } from "../lib/hdssRegistryScope";
import {
  DEFAULT_HDSS_SOURCE_AGE_AS_OF,
  createHdssRegistryVersion,
  decodeHdssRegistryCursor,
  encodeHdssRegistryCursor,
  hdssRegistryRequiredColumns,
  parseHdssRegistryCsv,
} from "../lib/blbRegistry";

const router = Router();
const MAX_MAPPING_FRAME_CSV_ROWS = 100_000;
const MAPPING_FRAME_INSERT_BATCH_SIZE = 1_000;
const MAPPING_FRAME_PREVIEW_ROW_LIMIT = 1_000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
});
const hdssUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

function boundedHdssCsvUpload(req: Request, res: Response, next: NextFunction): void {
  hdssUpload.single("file")(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      sendError(res, 413, "FILE_TOO_LARGE", "CSV file exceeds the 25 MB limit");
      return;
    }
    sendError(res, 400, "INVALID_UPLOAD", "Could not read the CSV upload");
  });
}

// ============= STUDY SITES =============

/**
 * GET /api/v1/masters/sites
 * Returns all study sites
 */
router.get("/sites", async (req: Request, res: Response) => {
  try {
    const sites = await db
      .select({
        site_id: schema.studySites.site_id,
        site_code: schema.studySites.site_code,
        site_name: schema.studySites.site_name,
      })
      .from(schema.studySites);

    sendSuccess(res, sites, 200, { total: sites.length });
  } catch (error) {
    console.error("List sites error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

const createSiteSchema = z.object({
  site_id: z.number().int().positive(),
  site_code: z.string().min(1),
  site_name: z.string().min(1),
});

const updateSiteSchema = z.object({
  site_code: z.string().min(1),
  site_name: z.string().min(1),
});

/**
 * POST /api/v1/masters/sites
 * Create new study site
 */
router.post("/sites", requireRole("central_admin"), async (req: Request, res: Response) => {
  try {
    const data = createSiteSchema.parse(req.body);

    // Check if site_id already exists
    const [existing] = await db
      .select()
      .from(schema.studySites)
      .where(eq(schema.studySites.site_id, data.site_id));

    if (existing) {
      sendError(res, 409, "SITE_ID_EXISTS", "Site ID already exists");
      return;
    }

    await db.insert(schema.studySites).values({
      site_id: data.site_id,
      site_code: data.site_code,
      site_name: data.site_name,
    });

    const [createdSite] = await db
      .select({
        site_id: schema.studySites.site_id,
        site_code: schema.studySites.site_code,
        site_name: schema.studySites.site_name,
      })
      .from(schema.studySites)
      .where(eq(schema.studySites.site_id, data.site_id));

    sendSuccess(res, createdSite, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", {
        errors: error.errors,
      });
    } else {
      console.error("Create site error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  }
});

/**
 * PATCH /api/v1/masters/sites/:site_id
 * Update an existing study site
 */
router.patch("/sites/:site_id", requireRole("central_admin"), async (req: Request, res: Response) => {
  try {
    const siteId = Number(req.params.site_id);
    if (!Number.isInteger(siteId) || siteId <= 0) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid site ID");
      return;
    }

    const data = updateSiteSchema.parse(req.body);

    const [existing] = await db
      .select()
      .from(schema.studySites)
      .where(eq(schema.studySites.site_id, siteId));

    if (!existing) {
      sendError(res, 404, "SITE_NOT_FOUND", "Site not found");
      return;
    }

    await db
      .update(schema.studySites)
      .set({
        site_code: data.site_code,
        site_name: data.site_name,
      })
      .where(eq(schema.studySites.site_id, siteId));

    const [updatedSite] = await db
      .select({
        site_id: schema.studySites.site_id,
        site_code: schema.studySites.site_code,
        site_name: schema.studySites.site_name,
      })
      .from(schema.studySites)
      .where(eq(schema.studySites.site_id, siteId));

    sendSuccess(res, updatedSite, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", {
        errors: error.errors,
      });
    } else {
      console.error("Update site error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  }
});

// ============= STUDY LOCALITIES =============

/**
 * GET /api/v1/masters/localities
 * Returns study localities, optionally filtered by site_id
 */
router.get("/localities", async (req: Request, res: Response) => {
  try {
    const { site_id: siteIdStr } = req.query;
    const siteId = siteIdStr ? parseInt(siteIdStr as string, 10) : undefined;

    const conditions: any[] = [];
    if (siteId !== undefined) {
      conditions.push(eq(schema.studyLocalities.site_id, siteId));
    }

    const localities = await db
      .select({
        site_id: schema.studyLocalities.site_id,
        locality_code: schema.studyLocalities.locality_code,
        locality_name: schema.studyLocalities.locality_name,
        locality_type: schema.studyLocalities.locality_type,
      })
      .from(schema.studyLocalities)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    sendSuccess(res, localities, 200, { total: localities.length });
  } catch (error) {
    console.error("List localities error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

const createLocalitySchema = z.object({
  site_id: z.number().int().positive(),
  locality_code: z.string().regex(/^\d{2}$/, "Locality code must be exactly 2 digits"),
  locality_name: z.string().min(1),
  locality_type: z.string().optional(),
});

const updateLocalitySchema = z.object({
  locality_code: z.string().regex(/^\d{2}$/, "Locality code must be exactly 2 digits"),
  locality_name: z.string().min(1),
  locality_type: z.string().optional(),
});

/**
 * POST /api/v1/masters/localities
 * Create new study locality
 */
router.post("/localities", requireRole("central_admin"), async (req: Request, res: Response) => {
  try {
    const data = createLocalitySchema.parse(req.body);

    // Check if (site_id, locality_code) already exists
    const [existing] = await db
      .select()
      .from(schema.studyLocalities)
      .where(
        and(
          eq(schema.studyLocalities.site_id, data.site_id),
          eq(schema.studyLocalities.locality_code, data.locality_code),
        ),
      );

    if (existing) {
      sendError(res, 409, "LOCALITY_EXISTS", "Locality already exists for this site");
      return;
    }

    await db.insert(schema.studyLocalities).values({
      site_id: data.site_id,
      locality_code: data.locality_code,
      locality_name: data.locality_name,
      locality_type: data.locality_type,
    });

    const [createdLocality] = await db
      .select({
        site_id: schema.studyLocalities.site_id,
        locality_code: schema.studyLocalities.locality_code,
        locality_name: schema.studyLocalities.locality_name,
        locality_type: schema.studyLocalities.locality_type,
      })
      .from(schema.studyLocalities)
      .where(
        and(
          eq(schema.studyLocalities.site_id, data.site_id),
          eq(schema.studyLocalities.locality_code, data.locality_code),
        ),
      );

    sendSuccess(res, createdLocality, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", {
        errors: error.errors,
      });
    } else {
      console.error("Create locality error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  }
});

/**
 * PATCH /api/v1/masters/localities/:site_id/:locality_code
 * Update an existing study locality
 */
router.patch(
  "/localities/:site_id/:locality_code",
  requireRole("central_admin"),
  async (req: Request, res: Response) => {
    try {
      const siteId = Number(req.params.site_id);
      const { locality_code: localityCode } = req.params;

      if (!Number.isInteger(siteId) || siteId <= 0) {
        sendError(res, 400, "VALIDATION_ERROR", "Invalid site ID");
        return;
      }

      const data = updateLocalitySchema.parse(req.body);
      const nextLocalityCode = data.locality_code.trim();

      const [existing] = await db
        .select()
        .from(schema.studyLocalities)
        .where(
          and(
            eq(schema.studyLocalities.site_id, siteId),
            eq(schema.studyLocalities.locality_code, localityCode),
          ),
        );

      if (!existing) {
        sendError(res, 404, "LOCALITY_NOT_FOUND", "Locality not found");
        return;
      }

      if (nextLocalityCode !== localityCode) {
        const [conflictingLocality] = await db
          .select()
          .from(schema.studyLocalities)
          .where(
            and(
              eq(schema.studyLocalities.site_id, siteId),
              eq(schema.studyLocalities.locality_code, nextLocalityCode),
            ),
          );

        if (conflictingLocality) {
          sendError(res, 409, "LOCALITY_EXISTS", "Locality code already exists for this site");
          return;
        }
      }

      await db.transaction(async (tx) => {
        if (nextLocalityCode !== localityCode) {
          await tx.execute(sql`
            CREATE TEMP TABLE locality_household_rename ON COMMIT DROP AS
            SELECT
              household_id AS old_household_id,
              concat(site_id::text, '-', ${nextLocalityCode}::text, '-', structure_map_id, '-', household_number) AS new_household_id
            FROM households
            WHERE site_id = ${siteId} AND locality_code = ${localityCode}
          `);

          await tx.execute(sql`
            INSERT INTO households (
              household_id,
              site_id,
              locality_code,
              structure_map_id,
              household_number,
              residence_area_type,
              address,
              household_head_name,
              contact_mobile,
              consent_status,
              result_interview,
              language_questionnaire,
              baseline_enrollment_status,
              baseline_completed_date,
              cohort_status,
              closed_reason,
              religion_head,
              caste_category,
              household_characteristics,
              sync_status,
              created_at,
              updated_at
            )
            SELECT
              r.new_household_id,
              h.site_id,
              ${nextLocalityCode},
              h.structure_map_id,
              h.household_number,
              h.residence_area_type,
              h.address,
              h.household_head_name,
              h.contact_mobile,
              h.consent_status,
              h.result_interview,
              h.language_questionnaire,
              h.baseline_enrollment_status,
              h.baseline_completed_date,
              h.cohort_status,
              h.closed_reason,
              h.religion_head,
              h.caste_category,
              h.household_characteristics,
              h.sync_status,
              h.created_at,
              now()
            FROM households h
            JOIN locality_household_rename r ON r.old_household_id = h.household_id
          `);

          await tx.execute(sql`
            UPDATE household_members AS m
            SET household_id = r.new_household_id, locality_code = ${nextLocalityCode}, updated_at = now()
            FROM locality_household_rename r
            WHERE m.household_id = r.old_household_id
          `);
          await tx.execute(sql`
            UPDATE eligible_women AS w
            SET household_id = r.new_household_id, locality_code = ${nextLocalityCode}, updated_at = now()
            FROM locality_household_rename r
            WHERE w.household_id = r.old_household_id
          `);
          await tx.execute(sql`
            UPDATE pregnancies AS p
            SET household_id = r.new_household_id, locality_code = ${nextLocalityCode}, updated_at = now()
            FROM locality_household_rename r
            WHERE p.household_id = r.old_household_id
          `);
          await tx.execute(sql`
            UPDATE children AS c
            SET household_id = r.new_household_id, updated_at = now()
            FROM locality_household_rename r
            WHERE c.household_id = r.old_household_id
          `);
          await tx.execute(sql`
            UPDATE visits AS v
            SET household_id = r.new_household_id, locality_code = ${nextLocalityCode}
            FROM locality_household_rename r
            WHERE v.household_id = r.old_household_id
          `);
          await tx.execute(sql`
            UPDATE form_responses AS f
            SET household_id = r.new_household_id, locality_code = ${nextLocalityCode}
            FROM locality_household_rename r
            WHERE f.household_id = r.old_household_id
          `);
          await tx.execute(sql`
            UPDATE domain_events AS e
            SET household_id = r.new_household_id, locality_code = ${nextLocalityCode}
            FROM locality_household_rename r
            WHERE e.household_id = r.old_household_id
          `);
          await tx.execute(sql`
            UPDATE follow_up_tasks AS t
            SET household_id = r.new_household_id, locality_code = ${nextLocalityCode}, updated_at = now()
            FROM locality_household_rename r
            WHERE t.household_id = r.old_household_id
          `);
          await tx.execute(sql`
            DELETE FROM households AS h
            USING locality_household_rename r
            WHERE h.household_id = r.old_household_id
          `);
          await tx.execute(sql`
            UPDATE mapping_frame
            SET
              locality_code = ${nextLocalityCode},
              household_id = concat(site_id::text, '-', ${nextLocalityCode}::text, '-', structure_map_id, '-', household_number),
              structure_id = concat(site_id::text, '-', ${nextLocalityCode}::text, '-', structure_map_id)
            WHERE site_id = ${siteId} AND locality_code = ${localityCode}
          `);
          await tx.execute(sql`
            UPDATE user_area_assignments
            SET locality_code = ${nextLocalityCode}
            WHERE site_id = ${siteId} AND locality_code = ${localityCode}
          `);
          await tx.execute(sql`
            UPDATE study_localities
            SET locality_code = ${nextLocalityCode}
            WHERE site_id = ${siteId} AND locality_code = ${localityCode}
          `);
        }

        await tx
          .update(schema.studyLocalities)
          .set({
            locality_name: data.locality_name,
            locality_type: data.locality_type,
          })
          .where(
            and(
              eq(schema.studyLocalities.site_id, siteId),
              eq(schema.studyLocalities.locality_code, nextLocalityCode),
            ),
          );
      });

      const [updatedLocality] = await db
        .select({
          site_id: schema.studyLocalities.site_id,
          locality_code: schema.studyLocalities.locality_code,
          locality_name: schema.studyLocalities.locality_name,
          locality_type: schema.studyLocalities.locality_type,
        })
        .from(schema.studyLocalities)
        .where(
          and(
            eq(schema.studyLocalities.site_id, siteId),
            eq(schema.studyLocalities.locality_code, nextLocalityCode),
          ),
        );

      sendSuccess(res, updatedLocality, 200);
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", {
          errors: error.errors,
        });
      } else {
        console.error("Update locality error:", error);
        sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
      }
    }
  },
);

// ============= MAPPING FRAME =============

const mappingFrameRecordSchema = z.object({
  site_id: z.number().int().positive(),
  locality_code: z.string().regex(/^\d{2}$/, "Locality code must be exactly 2 digits"),
  structure_map_id: z.string().regex(/^[A-Za-z0-9]{1,6}$/, "Structure ID must be 1-6 alphanumeric characters"),
  household_number: z.string().length(2),
});

type MappingFrameRecord = z.infer<typeof mappingFrameRecordSchema>;
type MappingFrameImportRecord = MappingFrameRecord & {
  address: string;
  household_head_name: string;
  comments: string;
  source_line: number;
};
type MappingFramePreviewRow = Partial<MappingFrameImportRecord> & {
  source_line: number;
  household_id?: string;
  structure_id?: string;
  raw?: Record<string, string>;
  status: "ready" | "duplicate" | "error";
  errors: string[];
};
type MappingFrameImportUploadMetadata = {
  upload_id: string;
  uploaded_at: string;
  site_id: number;
  original_file_name: string;
  total_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  original_csv_path: string;
  matched_csv_path: string;
  unmatched_csv_path: string;
};

function computeHouseholdId(record: MappingFrameRecord): string {
  return `${record.site_id}-${record.locality_code}-${record.structure_map_id}-${record.household_number}`;
}

function computeStructureId(record: MappingFrameRecord): string {
  return `${record.site_id}-${record.locality_code}-${record.structure_map_id}`;
}

function normalizeCsvHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseCsvRows(csvContent: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    const next = csvContent[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(current.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function normalizeNumericCode(value: string, width: number): string {
  const text = value.trim();
  if (/^\d+$/.test(text)) return text.padStart(width, "0");
  return text;
}

function validateAndPadNumericCode(
  value: string,
  label: string,
  width: number,
  errors: string[],
): string {
  const text = value.trim();
  if (!text) {
    errors.push(`${label} is missing`);
    return "";
  }
  if (!/^\d+$/.test(text)) {
    errors.push(`${label} must contain digits only`);
    return text;
  }
  if (text.length > width) {
    errors.push(`${label} must not be more than ${width} digit${width === 1 ? "" : "s"}`);
    return text;
  }
  return text.padStart(width, "0");
}

function validateStructureMapId(value: string, errors: string[]): string {
  const text = value.trim().toUpperCase();
  if (!text) {
    errors.push("Structure ID is missing");
    return "";
  }
  if (!/^[A-Z0-9]{1,6}$/.test(text)) {
    errors.push("Structure ID must be 1-6 alphanumeric characters");
    return text;
  }
  return /^\d+$/.test(text) && text.length < 4 ? text.padStart(4, "0") : text;
}

function getCsvColumnIndexes(headers: string[]): Record<string, number> {
  const normalized = headers.map(normalizeCsvHeader);
  const definitions: Record<string, string[]> = {
    studySite: ["study site", "site", "site id", "site code", "site name"],
    localityCode: ["colony village code", "colony code", "village code", "locality code"],
    structureMapId: [
      "structure serial no same as on map only residential ones",
      "structure serial no",
      "structure serial number",
      "structure map id",
    ],
    address: [
      "address location description of structure",
      "address location description",
      "address",
    ],
    householdNumber: [
      "serial number of household in the structure",
      "household serial number",
      "household number",
    ],
    householdHeadName: [
      "name of head of household",
      "household head name",
      "head of household",
    ],
    comments: ["comments if any", "comments", "comment"],
  };

  const indexes: Record<string, number> = {};
  for (const [key, aliases] of Object.entries(definitions)) {
    const index = normalized.findIndex((header) =>
      aliases.some((alias) => header === alias || header.includes(alias)),
    );
    if (index >= 0) indexes[key] = index;
  }
  return indexes;
}

function getRequiredCsvColumnErrors(indexes: Record<string, number>): string[] {
  const required = [
    ["studySite", "Study Site"],
    ["localityCode", "Colony / Village Code"],
    ["structureMapId", "Structure Serial No"],
    ["address", "Address/ Location / description of structure"],
    ["householdNumber", "Serial number of household in the structure"],
    ["householdHeadName", "Name of Head of Household"],
  ];
  return required
    .filter(([key]) => indexes[key] === undefined)
    .map(([, label]) => `Missing column: ${label}`);
}

function parseSelectedSiteId(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const siteId = Number(value);
  return Number.isInteger(siteId) && siteId > 0 ? siteId : undefined;
}

function isCsvUpload(file: Express.Multer.File): boolean {
  return file.originalname.toLowerCase().endsWith(".csv");
}

function escapeCsvCell(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\r\n");
}

function getMappingImportUploadRoot(): string {
  return path.resolve(process.cwd(), "uploads", "mapping-frame");
}

async function saveMappingFrameImportUpload(
  rows: MappingFramePreviewRow[],
  originalCsv: string,
  originalFileName: string,
  selectedSiteId: number,
): Promise<MappingFrameImportUploadMetadata> {
  const uploadedAt = new Date().toISOString();
  const uploadId = `${uploadedAt.replace(/[:.]/g, "-")}-site-${selectedSiteId}`;
  const uploadDir = path.join(getMappingImportUploadRoot(), uploadId);
  await fs.mkdir(uploadDir, { recursive: true });

  const matchedRows = rows.filter((row) => row.status === "ready");
  const unmatchedRows = rows.filter((row) => row.status !== "ready");
  const matchedCsv = toCsv(
    ["Line", "HHID", "Site", "Locality", "Structure", "HH No.", "Head", "Address", "Comments"],
    matchedRows.map((row) => [
      row.source_line,
      row.household_id,
      row.site_id,
      row.locality_code,
      row.structure_map_id,
      row.household_number,
      row.household_head_name,
      row.address,
      row.comments,
    ]),
  );
  const unmatchedCsv = toCsv(
    [
      "Line",
      "HHID",
      "Site",
      "Locality",
      "Structure",
      "HH No.",
      "Head",
      "Address",
      "Comments",
      "Status",
      "Errors",
    ],
    unmatchedRows.map((row) => [
      row.source_line,
      row.household_id,
      row.site_id,
      row.locality_code,
      row.structure_map_id,
      row.household_number,
      row.household_head_name,
      row.address,
      row.comments,
      row.status,
      row.errors.join("; "),
    ]),
  );

  const originalCsvPath = path.join(uploadDir, "original.csv");
  const matchedCsvPath = path.join(uploadDir, "matched.csv");
  const unmatchedCsvPath = path.join(uploadDir, "unmatched.csv");
  const metadata: MappingFrameImportUploadMetadata = {
    upload_id: uploadId,
    uploaded_at: uploadedAt,
    site_id: selectedSiteId,
    original_file_name: originalFileName,
    total_rows: rows.length,
    matched_rows: matchedRows.length,
    unmatched_rows: unmatchedRows.length,
    original_csv_path: originalCsvPath,
    matched_csv_path: matchedCsvPath,
    unmatched_csv_path: unmatchedCsvPath,
  };

  await Promise.all([
    fs.writeFile(originalCsvPath, originalCsv, "utf-8"),
    fs.writeFile(matchedCsvPath, matchedCsv, "utf-8"),
    fs.writeFile(unmatchedCsvPath, unmatchedCsv, "utf-8"),
    fs.writeFile(path.join(uploadDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf-8"),
  ]);

  return metadata;
}

async function listMappingFrameImportUploads(): Promise<MappingFrameImportUploadMetadata[]> {
  const root = getMappingImportUploadRoot();
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const uploads = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            const content = await fs.readFile(path.join(root, entry.name, "metadata.json"), "utf-8");
            return JSON.parse(content) as MappingFrameImportUploadMetadata;
          } catch {
            return undefined;
          }
        }),
    );
    return uploads
      .filter((upload): upload is MappingFrameImportUploadMetadata => Boolean(upload))
      .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  } catch {
    return [];
  }
}

async function buildMappingFramePreviewRows(
  csvContent: string,
  selectedSiteId: number,
): Promise<MappingFramePreviewRow[]> {
  const rows = parseCsvRows(csvContent);
  if (rows.length < 2) {
    throw new Error("CSV must contain header row and at least one data row");
  }
  if (rows.length - 1 > MAX_MAPPING_FRAME_CSV_ROWS) {
    throw new Error(`CSV must not contain more than ${MAX_MAPPING_FRAME_CSV_ROWS} household rows`);
  }

  const indexes = getCsvColumnIndexes(rows[0]);
  const missingColumns = getRequiredCsvColumnErrors(indexes);
  if (missingColumns.length > 0) {
    throw new Error(missingColumns.join("; "));
  }

  const [selectedSiteRows, localities, existingMappingFrames, existingHouseholds] = await Promise.all([
    db.select().from(schema.studySites).where(eq(schema.studySites.site_id, selectedSiteId)),
    db
      .select()
      .from(schema.studyLocalities)
      .where(eq(schema.studyLocalities.site_id, selectedSiteId)),
    db.select({ household_id: schema.mappingFrame.household_id }).from(schema.mappingFrame),
    db.select({ household_id: schema.households.household_id }).from(schema.households),
  ]);
  if (selectedSiteRows.length === 0) {
    throw new Error("Selected study site does not exist in Study Sites master");
  }
  const masterLocalityCodes = new Set(localities.map((locality) => locality.locality_code));

  const existingIds = new Set([
    ...existingMappingFrames.map((row) => row.household_id),
    ...existingHouseholds.map((row) => row.household_id),
  ]);
  const csvIds = new Set<string>();

  return rows.slice(1).map((row, rowIndex) => {
    const sourceLine = rowIndex + 2;
    const get = (key: string) => row[indexes[key]]?.trim() || "";
    const raw = Object.fromEntries(rows[0].map((header, index) => [header, row[index]?.trim() || ""]));
    const errors: string[] = [];

    const siteValue = get("studySite");
    const localityRaw = get("localityCode");
    const structureRaw = get("structureMapId");
    const householdRaw = get("householdNumber");
    const address = get("address");
    const householdHeadName = get("householdHeadName");
    const comments = indexes.comments !== undefined ? get("comments") : "";

    if (!siteValue && !localityRaw && !structureRaw && !householdRaw) {
      errors.push("All required mapping fields are missing");
    }

    const paddedSiteId = validateAndPadNumericCode(siteValue, "Site ID", 1, errors);
    const localityValue = validateAndPadNumericCode(localityRaw, "Locality", 2, errors);
    const structureMapId = validateStructureMapId(structureRaw, errors);
    const householdNumber = validateAndPadNumericCode(householdRaw, "Household number", 2, errors);
    const siteId = paddedSiteId && /^\d$/.test(paddedSiteId) ? Number(paddedSiteId) : undefined;

    if (siteId && siteId !== selectedSiteId) {
      errors.push(`CSV Site ID ${siteId} does not match selected site ${selectedSiteId}`);
    }
    if (siteId === selectedSiteId && localityValue && /^\d{2}$/.test(localityValue) && !masterLocalityCodes.has(localityValue)) {
      errors.push(`Locality ${localityValue} is not configured for selected site ${selectedSiteId}`);
    }

    const parsed = errors.length === 0 ? mappingFrameRecordSchema.safeParse({
      site_id: siteId || 0,
      locality_code: localityValue,
      structure_map_id: structureMapId,
      household_number: householdNumber,
    }) : undefined;
    if (!parsed || !parsed.success) {
      errors.push(...(parsed?.error.errors.map((error) => error.message) || []));
    }

    if (!parsed || !parsed.success || errors.length > 0) {
      return {
        source_line: sourceLine,
        raw,
        site_id: siteId,
        locality_code: localityValue,
        structure_map_id: structureMapId,
        household_number: householdNumber,
        address,
        household_head_name: householdHeadName,
        comments,
        status: "error",
        errors,
      };
    }

    const record: MappingFrameImportRecord = {
      ...parsed.data,
      address,
      household_head_name: householdHeadName,
      comments,
      source_line: sourceLine,
    };
    const householdId = computeHouseholdId(record);
    const structureId = computeStructureId(record);
    if (csvIds.has(householdId)) {
      return {
        ...record,
        household_id: householdId,
        structure_id: structureId,
        status: "error",
        errors: ["Duplicate household ID inside this CSV"],
      };
    }
    csvIds.add(householdId);

    return {
      ...record,
      household_id: householdId,
      structure_id: structureId,
      status: existingIds.has(householdId) ? "duplicate" : "ready",
      errors: existingIds.has(householdId) ? ["Household ID already exists"] : [],
    };
  });
}

type ReadyMappingFramePreviewRow = MappingFrameImportRecord & {
  household_id: string;
  structure_id: string;
  status: "ready";
  errors: string[];
};

function rowsToImportValues(rows: MappingFramePreviewRow[]): ReadyMappingFramePreviewRow[] {
  return rows.filter((row): row is ReadyMappingFramePreviewRow => row.status === "ready");
}

async function insertMappingFrameImportRows(rows: ReadyMappingFramePreviewRow[]) {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  const now = new Date();
  let inserted = 0;
  await db.transaction(async (tx) => {
    for (let offset = 0; offset < rows.length; offset += MAPPING_FRAME_INSERT_BATCH_SIZE) {
      const batch = rows.slice(offset, offset + MAPPING_FRAME_INSERT_BATCH_SIZE);
      const mappingRows = batch.map((record) => ({
        household_id: record.household_id,
        site_id: record.site_id,
        locality_code: record.locality_code,
        structure_map_id: record.structure_map_id,
        household_number: record.household_number,
        structure_id: record.structure_id,
        mapping_status: "listed" as const,
        baseline_enrollment_status: "pending" as const,
      }));
      const householdRows = batch.map((record) => ({
        household_id: record.household_id,
        site_id: record.site_id,
        locality_code: record.locality_code,
        structure_map_id: record.structure_map_id,
        household_number: record.household_number,
        address: record.address,
        household_head_name: record.household_head_name,
        baseline_enrollment_status: "pending",
        cohort_status: "listed",
        household_characteristics: {
          mapping_frame_comments: record.comments,
          mapping_frame_source: "csv_import",
          mapping_frame_source_line: record.source_line,
        },
        sync_status: "synced",
        created_at: now,
        updated_at: now,
      }));

      const mappingResult = await tx
        .insert(schema.mappingFrame)
        .values(mappingRows)
        .onConflictDoNothing();
      inserted += mappingResult.rowCount || 0;

      await tx
        .insert(schema.households)
        .values(householdRows)
        .onConflictDoNothing();
    }
  });

  return { inserted, skipped: rows.length - inserted };
}

/**
 * GET /api/v1/masters/mapping-frame
 * Returns mapping frame entries with filtering and pagination
 */
router.get("/mapping-frame", async (req: Request, res: Response) => {
  try {
    const {
      site_id: siteIdStr,
      locality_code,
      mapping_status,
      search,
      page: pageStr = "1",
      per_page: perPageStr = "50",
    } = req.query;

    const siteId = siteIdStr ? parseInt(siteIdStr as string, 10) : undefined;
    const page = parseInt(pageStr as string, 10) || 1;
    const perPage = Math.min(parseInt(perPageStr as string, 10) || 50, 500);
    const offset = (page - 1) * perPage;

    const conditions: any[] = [];

    if (siteId !== undefined) {
      conditions.push(eq(schema.mappingFrame.site_id, siteId));
    }

    if (locality_code) {
      conditions.push(eq(schema.mappingFrame.locality_code, locality_code as string));
    }

    if (mapping_status) {
      conditions.push(eq(schema.mappingFrame.mapping_status, mapping_status as string));
    }

    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        sql`(${schema.mappingFrame.household_id} ilike ${searchTerm} or ${schema.mappingFrame.structure_map_id} ilike ${searchTerm})`,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const entries = await db
      .select({
        household_id: schema.mappingFrame.household_id,
        site_id: schema.mappingFrame.site_id,
        locality_code: schema.mappingFrame.locality_code,
        structure_map_id: schema.mappingFrame.structure_map_id,
        household_number: schema.mappingFrame.household_number,
        address: schema.households.address,
        household_head_name: schema.households.household_head_name,
        structure_id: schema.mappingFrame.structure_id,
        mapping_status: schema.mappingFrame.mapping_status,
        baseline_enrollment_status: schema.mappingFrame.baseline_enrollment_status,
        consent_status: schema.households.consent_status,
        can_delete: sql<boolean>`coalesce(
          ${schema.households.household_characteristics}->>'mapping_frame_source' = 'csv_import'
          and ${schema.mappingFrame.baseline_enrollment_status} = 'pending'
          and coalesce(${schema.households.baseline_enrollment_status}, 'pending') = 'pending'
          and ${schema.households.consent_status} is null,
          false
        )`,
      })
      .from(schema.mappingFrame)
      .leftJoin(schema.households, eq(schema.mappingFrame.household_id, schema.households.household_id))
      .where(whereClause)
      .limit(perPage)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(schema.mappingFrame)
      .where(whereClause);

    sendSuccess(res, entries, 200, { total: count, page, per_page: perPage });
  } catch (error) {
    console.error("List mapping frame error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

/**
 * GET /api/v1/masters/mapping-frame/import-uploads
 * Lists stored matched/unmatched CSV upload folders.
 */
router.get(
  "/mapping-frame/import-uploads",
  requireRole("central_admin"),
  async (_req: Request, res: Response) => {
    try {
      const uploads = await listMappingFrameImportUploads();
      sendSuccess(res, uploads, 200, { total: uploads.length });
    } catch (error) {
      console.error("List mapping frame import uploads error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  },
);

/**
 * DELETE /api/v1/masters/mapping-frame/:household_id
 * Removes only pending households created through Mapping Frame CSV import.
 */
router.delete("/mapping-frame/:household_id", requireRole("central_admin"), async (req: Request, res: Response) => {
  try {
    const { household_id } = req.params;

    const [entry] = await db
      .select({
        household_id: schema.mappingFrame.household_id,
        mapping_baseline_status: schema.mappingFrame.baseline_enrollment_status,
        household_baseline_status: schema.households.baseline_enrollment_status,
        consent_status: schema.households.consent_status,
        household_characteristics: schema.households.household_characteristics,
      })
      .from(schema.mappingFrame)
      .leftJoin(schema.households, eq(schema.mappingFrame.household_id, schema.households.household_id))
      .where(eq(schema.mappingFrame.household_id, household_id));

    if (!entry) {
      sendError(res, 404, "MAPPING_FRAME_NOT_FOUND", "Mapping frame entry not found");
      return;
    }

    const characteristics = (entry.household_characteristics ?? {}) as Record<string, unknown>;
    const isCsvImport = characteristics.mapping_frame_source === "csv_import";
    const isPending =
      entry.mapping_baseline_status === "pending" &&
      (entry.household_baseline_status === "pending" || entry.household_baseline_status === null) &&
      entry.consent_status === null;

    if (!isCsvImport || !isPending) {
      sendError(
        res,
        409,
        "HOUSEHOLD_DELETE_NOT_ALLOWED",
        "Only pending households imported from CSV can be deleted",
      );
      return;
    }

    const countByHousehold = (table: any) =>
      db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(table)
        .where(eq(table.household_id, household_id));

    const [
      [{ count: memberCount }],
      [{ count: visitCount }],
      [{ count: responseCount }],
      [{ count: taskCount }],
      [{ count: eventCount }],
    ] = await Promise.all([
      countByHousehold(schema.householdMembers),
      countByHousehold(schema.visits),
      countByHousehold(schema.formResponses),
      countByHousehold(schema.followUpTasks),
      countByHousehold(schema.domainEvents),
    ]);

    if (memberCount + visitCount + responseCount + taskCount + eventCount > 0) {
      sendError(
        res,
        409,
        "HOUSEHOLD_HAS_DEPENDENCIES",
        "Household already has related study records and cannot be deleted",
      );
      return;
    }

    await db.transaction(async (tx) => {
      await tx.delete(schema.households).where(eq(schema.households.household_id, household_id));
      await tx.delete(schema.mappingFrame).where(eq(schema.mappingFrame.household_id, household_id));
    });

    sendSuccess(res, { deleted: household_id });
  } catch (error) {
    console.error("Delete mapping frame import row error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

/**
 * GET /api/v1/masters/mapping-frame/:household_id
 * Returns single mapping frame entry
 */
router.get("/mapping-frame/:household_id", async (req: Request, res: Response) => {
  try {
    const { household_id } = req.params;

    const [entry] = await db
      .select({
        household_id: schema.mappingFrame.household_id,
        site_id: schema.mappingFrame.site_id,
        locality_code: schema.mappingFrame.locality_code,
        structure_map_id: schema.mappingFrame.structure_map_id,
        household_number: schema.mappingFrame.household_number,
        structure_id: schema.mappingFrame.structure_id,
        mapping_status: schema.mappingFrame.mapping_status,
        baseline_enrollment_status: schema.mappingFrame.baseline_enrollment_status,
        consent_status: schema.households.consent_status,
        can_delete: sql<boolean>`coalesce(
          ${schema.households.household_characteristics}->>'mapping_frame_source' = 'csv_import'
          and ${schema.mappingFrame.baseline_enrollment_status} = 'pending'
          and coalesce(${schema.households.baseline_enrollment_status}, 'pending') = 'pending'
          and ${schema.households.consent_status} is null,
          false
        )`,
      })
      .from(schema.mappingFrame)
      .leftJoin(schema.households, eq(schema.mappingFrame.household_id, schema.households.household_id))
      .where(eq(schema.mappingFrame.household_id, household_id));

    if (!entry) {
      sendError(res, 404, "MAPPING_FRAME_NOT_FOUND", "Mapping frame entry not found");
      return;
    }

    sendSuccess(res, entry);
  } catch (error) {
    console.error("Get mapping frame error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

/**
 * POST /api/v1/masters/mapping-frame
 * Create single mapping frame entry
 */
router.post("/mapping-frame", requireRole("central_admin"), async (req: Request, res: Response) => {
  try {
    const data = mappingFrameRecordSchema.parse(req.body);

    const household_id = computeHouseholdId(data);
    const structure_id = computeStructureId(data);

    // Check if household_id already exists
    const [existing] = await db
      .select()
      .from(schema.mappingFrame)
      .where(eq(schema.mappingFrame.household_id, household_id));

    if (existing) {
      sendError(res, 409, "HOUSEHOLD_ID_EXISTS", "Household ID already exists");
      return;
    }

    await db.insert(schema.mappingFrame).values({
      household_id,
      site_id: data.site_id,
      locality_code: data.locality_code,
      structure_map_id: data.structure_map_id,
      household_number: data.household_number,
      structure_id,
      mapping_status: "listed",
      baseline_enrollment_status: "pending",
    });

    const [createdEntry] = await db
      .select({
        household_id: schema.mappingFrame.household_id,
        site_id: schema.mappingFrame.site_id,
        locality_code: schema.mappingFrame.locality_code,
        structure_map_id: schema.mappingFrame.structure_map_id,
        household_number: schema.mappingFrame.household_number,
        structure_id: schema.mappingFrame.structure_id,
        mapping_status: schema.mappingFrame.mapping_status,
        baseline_enrollment_status: schema.mappingFrame.baseline_enrollment_status,
      })
      .from(schema.mappingFrame)
      .where(eq(schema.mappingFrame.household_id, household_id));

    sendSuccess(res, createdEntry, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", {
        errors: error.errors,
      });
    } else {
      console.error("Create mapping frame error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  }
});

/**
 * POST /api/v1/masters/mapping-frame/bulk
 * Bulk create mapping frame entries
 */
router.post(
  "/mapping-frame/bulk",
  requireRole("central_admin"),
  async (req: Request, res: Response) => {
    try {
      const { records } = req.body;

      if (!Array.isArray(records)) {
        sendError(res, 400, "VALIDATION_ERROR", "records must be an array");
        return;
      }

      const validRecords: any[] = [];
      const errors: any[] = [];

      for (let i = 0; i < records.length; i++) {
        try {
          const validated = mappingFrameRecordSchema.parse(records[i]);
          validRecords.push(validated);
        } catch (error) {
          if (error instanceof z.ZodError) {
            errors.push({ index: i, errors: error.errors });
          }
        }
      }

      if (errors.length > 0) {
        sendError(res, 400, "VALIDATION_ERROR", "Some records failed validation", { errors });
        return;
      }

      const valuesToInsert = validRecords.map((record) => ({
        household_id: computeHouseholdId(record),
        site_id: record.site_id,
        locality_code: record.locality_code,
        structure_map_id: record.structure_map_id,
        household_number: record.household_number,
        structure_id: computeStructureId(record),
        mapping_status: "listed" as const,
        baseline_enrollment_status: "pending" as const,
      }));

      const result = await db
        .insert(schema.mappingFrame)
        .values(valuesToInsert)
        .onConflictDoNothing();

      const inserted = result.rowCount || 0;
      const skipped = validRecords.length - inserted;

      sendSuccess(res, { inserted, skipped }, 201);
    } catch (error) {
      console.error("Bulk create mapping frame error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  },
);

/**
 * POST /api/v1/masters/mapping-frame/import-csv/preview
 * Preview mapping frame entries from the study CSV format
 */
router.post(
  "/mapping-frame/import-csv/preview",
  upload.single("file"),
  requireRole("central_admin"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        sendError(res, 400, "MISSING_FILE", "No file uploaded");
        return;
      }
      if (!isCsvUpload(req.file)) {
        sendError(res, 400, "INVALID_FILE_TYPE", "Only CSV files are allowed");
        return;
      }
      const selectedSiteId = parseSelectedSiteId(req.body.site_id);
      if (!selectedSiteId) {
        sendError(res, 400, "VALIDATION_ERROR", "Select a valid study site before preview");
        return;
      }

      const rows = await buildMappingFramePreviewRows(
        req.file.buffer.toString("utf-8"),
        selectedSiteId,
      );
      const ready = rows.filter((row) => row.status === "ready").length;
      const duplicate = rows.filter((row) => row.status === "duplicate").length;
      const invalid = rows.filter((row) => row.status === "error").length;

      sendSuccess(
        res,
        {
          rows: rows.slice(0, MAPPING_FRAME_PREVIEW_ROW_LIMIT),
          ready,
          duplicate,
          invalid,
          total_rows: rows.length,
          previewed_rows: Math.min(rows.length, MAPPING_FRAME_PREVIEW_ROW_LIMIT),
          preview_truncated: rows.length > MAPPING_FRAME_PREVIEW_ROW_LIMIT,
        },
        200,
        { total: rows.length },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid CSV";
      sendError(res, 400, "INVALID_CSV", message);
    }
  },
);

/**
 * POST /api/v1/masters/mapping-frame/import-csv
 * Import mapping frame entries from CSV
 */
router.post(
  "/mapping-frame/import-csv",
  upload.single("file"),
  requireRole("central_admin"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        sendError(res, 400, "MISSING_FILE", "No file uploaded");
        return;
      }
      if (!isCsvUpload(req.file)) {
        sendError(res, 400, "INVALID_FILE_TYPE", "Only CSV files are allowed");
        return;
      }
      const selectedSiteId = parseSelectedSiteId(req.body.site_id);
      if (!selectedSiteId) {
        sendError(res, 400, "VALIDATION_ERROR", "Select a valid study site before import");
        return;
      }

      const csvContent = req.file.buffer.toString("utf-8");
      const previewRows = await buildMappingFramePreviewRows(csvContent, selectedSiteId);
      const uploadMetadata = await saveMappingFrameImportUpload(
        previewRows,
        csvContent,
        req.file.originalname,
        selectedSiteId,
      );

      const readyRows = rowsToImportValues(previewRows);
      const { inserted, skipped } = await insertMappingFrameImportRows(readyRows);

      sendSuccess(
        res,
        {
          inserted,
          skipped: skipped + previewRows.filter((row) => row.status === "duplicate").length,
          invalid: previewRows.filter((row) => row.status === "error").length,
          upload: uploadMetadata,
        },
        201,
      );
    } catch (error) {
      console.error("Import CSV error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  },
);

/**
 * GET /api/v1/masters/mapping-frame/import-uploads/:upload_id/:kind
 * Downloads original, matched, or unmatched CSV for an import attempt.
 */
router.get(
  "/mapping-frame/import-uploads/:upload_id/:kind",
  requireRole("central_admin"),
  async (req: Request, res: Response) => {
    try {
      const { upload_id: uploadId, kind } = req.params;
      if (!/^[A-Za-z0-9._-]+$/.test(uploadId) || !["original", "matched", "unmatched"].includes(kind)) {
        sendError(res, 400, "VALIDATION_ERROR", "Invalid upload file request");
        return;
      }

      const filePath = path.join(getMappingImportUploadRoot(), uploadId, `${kind}.csv`);
      const resolvedRoot = path.resolve(getMappingImportUploadRoot());
      const resolvedFile = path.resolve(filePath);
      if (!resolvedFile.startsWith(resolvedRoot + path.sep)) {
        sendError(res, 400, "VALIDATION_ERROR", "Invalid upload file request");
        return;
      }

      try {
        await fs.access(resolvedFile);
      } catch {
        sendError(res, 404, "UPLOAD_FILE_NOT_FOUND", "Upload file not found");
        return;
      }

      res.download(resolvedFile, `${uploadId}-${kind}.csv`);
    } catch (error) {
      console.error("Download mapping frame upload error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  },
);

/**
 * PATCH /api/v1/masters/mapping-frame/:household_id
 * Update mapping frame entry
 */
const patchMappingFrameSchema = z.object({
  mapping_status: z.string().optional(),
  baseline_enrollment_status: z.string().optional(),
});

router.patch(
  "/mapping-frame/:household_id",
  requireRole("central_admin"),
  async (req: Request, res: Response) => {
    try {
      const { household_id } = req.params;
      const data = patchMappingFrameSchema.parse(req.body);

      const [existing] = await db
        .select()
        .from(schema.mappingFrame)
        .where(eq(schema.mappingFrame.household_id, household_id));

      if (!existing) {
        sendError(res, 404, "MAPPING_FRAME_NOT_FOUND", "Mapping frame entry not found");
        return;
      }

      const updateData: any = {};
      if (data.mapping_status !== undefined) updateData.mapping_status = data.mapping_status;
      if (data.baseline_enrollment_status !== undefined)
        updateData.baseline_enrollment_status = data.baseline_enrollment_status;

      await db
        .update(schema.mappingFrame)
        .set(updateData)
        .where(eq(schema.mappingFrame.household_id, household_id));

      const [updatedEntry] = await db
        .select({
          household_id: schema.mappingFrame.household_id,
          site_id: schema.mappingFrame.site_id,
          locality_code: schema.mappingFrame.locality_code,
          structure_map_id: schema.mappingFrame.structure_map_id,
          household_number: schema.mappingFrame.household_number,
          structure_id: schema.mappingFrame.structure_id,
          mapping_status: schema.mappingFrame.mapping_status,
          baseline_enrollment_status: schema.mappingFrame.baseline_enrollment_status,
        })
        .from(schema.mappingFrame)
        .where(eq(schema.mappingFrame.household_id, household_id));

      sendSuccess(res, updatedEntry);
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", {
          errors: error.errors,
        });
      } else {
        console.error("Patch mapping frame error:", error);
        sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
      }
    }
  },
);

// ============= BALLABGARH REGISTRY =============

function parseLegacyRegistryCsv(csvContent: string): Record<string, string>[] {
  const rows = parseCsvRows(csvContent).filter((row) => row.some((cell) => cell !== ""));
  if (rows.length < 1) return [];
  const headers = rows[0].map(normalizeCsvHeader);
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    return record;
  });
}

/**
 * POST /api/v1/masters/blb-registry/households/upload
 * Upsert Ballabgarh registry households from CSV: hh_list_no,family_no,head_name,address
 */
router.post(
  "/blb-registry/households/upload",
  requireRole("central_admin"),
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        sendError(res, 400, "MISSING_FILE", "No file uploaded");
        return;
      }
      if (!isCsvUpload(req.file)) {
        sendError(res, 400, "INVALID_FILE_TYPE", "Only CSV files are allowed");
        return;
      }
      const records = parseLegacyRegistryCsv(req.file.buffer.toString("utf-8"));
      const errors: string[] = [];
      const valid: { hh_list_no: string; family_no: string; head_name: string | null; address: string | null }[] = [];
      records.forEach((record, index) => {
        const hh = record["hh list no"].trim();
        const fam = record["family no"].trim();
        if (!hh || !fam) {
          errors.push(`Line ${index + 2}: hh_list_no and family_no are required`);
          return;
        }
        valid.push({
          hh_list_no: hh,
          family_no: fam,
          head_name: record["head name"]?.trim() || null,
          address: record["address"]?.trim() || null,
        });
      });
      if (valid.length) {
        await db
          .insert(schema.blbRegistryHouseholds)
          .values(valid)
          .onConflictDoUpdate({
            target: [schema.blbRegistryHouseholds.hh_list_no, schema.blbRegistryHouseholds.family_no],
            set: {
              head_name: sql`excluded.head_name`,
              address: sql`excluded.address`,
              updated_at: sql`now()`,
            },
          });
      }
      sendSuccess(res, { imported: valid.length, invalid: errors.length, errors }, 201);
    } catch (error) {
      console.error("BLB registry households upload error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  },
);

type HdssImportRequest = Request & { file?: Express.Multer.File };

async function importHdssRegistry(req: HdssImportRequest, res: Response): Promise<void> {
  try {
    if (!req.file) {
      sendError(res, 400, "MISSING_FILE", "No file uploaded");
      return;
    }
    if (!isCsvUpload(req.file)) {
      sendError(res, 400, "INVALID_FILE_TYPE", "Only CSV files are allowed");
      return;
    }
    const requestedSnapshot = req.body?.source_age_as_of;
    if (requestedSnapshot !== undefined && requestedSnapshot !== DEFAULT_HDSS_SOURCE_AGE_AS_OF) {
      sendError(res, 400, "INVALID_SOURCE_AGE_AS_OF", "Only the 2026-10-14 source snapshot is accepted");
      return;
    }
    const sourceAgeAsOf = DEFAULT_HDSS_SOURCE_AGE_AS_OF;
    const parsed = parseHdssRegistryCsv(req.file.buffer.toString("utf-8"), sourceAgeAsOf);
    if (parsed.issues.length > 0) {
      sendError(res, 400, "INVALID_HDSS_CSV", "CSV validation failed", {
        issues: parsed.issues,
        required_columns: hdssRegistryRequiredColumns,
      });
      return;
    }

    const importRows = parsed.rows.map((row) => ({
      uid: row.uid,
      village_code: row.village_code,
      village_name: row.village_name,
      phc_code: row.phc_code,
      phc_name: row.phc_name,
      hh_list_no: row.hh_list_no,
      family_no: row.family_no,
      ind_no: row.ind_no,
      name: row.name,
      age_years: row.age_years,
      sex: row.sex,
      status: row.status,
      domicile: row.domicile,
      curr_status: row.curr_status,
      death_date: row.death_date,
      migrated_out_date: row.migrated_out_date,
      migration_reason: row.migration_reason,
      source_age_as_of: row.source_age_as_of,
    }));

    // Validate the complete file before opening the transaction. The advisory
    // lock serializes imports so every page cursor generation is monotonic.
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('dynamic.blb_registry'))`);
      const importedAt = new Date();
      const batchSize = 1000;
      for (let offset = 0; offset < importRows.length; offset += batchSize) {
        const batch = importRows
          .slice(offset, offset + batchSize)
          .map((row) => ({ ...row, updated_at: importedAt }));
        await tx
          .insert(schema.blbRegistryIndividuals)
          .values(batch)
          .onConflictDoUpdate({
            target: schema.blbRegistryIndividuals.uid,
            set: {
              village_code: sql`excluded.village_code`,
              village_name: sql`excluded.village_name`,
              phc_code: sql`excluded.phc_code`,
              phc_name: sql`excluded.phc_name`,
              hh_list_no: sql`excluded.hh_list_no`,
              family_no: sql`excluded.family_no`,
              ind_no: sql`excluded.ind_no`,
              name: sql`excluded.name`,
              age_years: sql`excluded.age_years`,
              sex: sql`excluded.sex`,
              status: sql`excluded.status`,
              domicile: sql`excluded.domicile`,
              curr_status: sql`excluded.curr_status`,
              death_date: sql`excluded.death_date`,
              migrated_out_date: sql`excluded.migrated_out_date`,
              migration_reason: sql`excluded.migration_reason`,
              source_age_as_of: sql`excluded.source_age_as_of`,
              updated_at: importedAt,
            },
          });
      }
      await tx
        .insert(schema.blbRegistrySnapshot)
        .values({
          snapshot_key: "default",
          generation: randomUUID(),
          updated_at: importedAt,
        })
        .onConflictDoUpdate({
          target: schema.blbRegistrySnapshot.snapshot_key,
          set: {
            generation: sql`excluded.generation`,
            updated_at: importedAt,
          },
        });
    });
    sendSuccess(res, { imported: importRows.length }, 201);
  } catch {
    // Do not include database or CSV values in logs or error responses.
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred while importing the registry");
  }
}

// Authorization deliberately precedes multer so unauthorized callers cannot
// make the server buffer a large upload.
router.post("/blb-registry/upload", requireRole("central_admin"), boundedHdssCsvUpload, importHdssRegistry);
router.post(
  "/blb-registry/individuals/upload",
  requireRole("central_admin"),
  boundedHdssCsvUpload,
  importHdssRegistry,
);

/**
 * GET /api/v1/masters/blb-registry
 * Cursor-paged Ballabgarh registry for offline device caching.
 */
router.get(
  "/blb-registry",
  requireRole("central_admin", "field_worker"),
  requireDataAccess("can_access_pii"),
  async (req: Request, res: Response) => {
    try {
      const requestedLimit = req.query.limit === undefined ? 1000 : Number(req.query.limit);
      if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 2000) {
        sendError(res, 400, "INVALID_LIMIT", "limit must be an integer between 1 and 2000");
        return;
      }
      const encodedCursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
      const cursor = encodedCursor ? decodeHdssRegistryCursor(encodedCursor) : null;
      if (req.query.cursor !== undefined && !cursor) {
        sendError(res, 400, "INVALID_CURSOR", "cursor is invalid");
        return;
      }
      const knownVersion = req.query.known_registry_version;
      if (knownVersion !== undefined && (typeof knownVersion !== "string" || !/^[a-f0-9]{64}$/.test(knownVersion))) {
        sendError(res, 400, "INVALID_REGISTRY_VERSION", "known_registry_version is invalid");
        return;
      }

      const scope = await buildHdssRegistryScopeCondition(req.user!);
      const scopeQuery = scope ? new PgDialect().sqlToQuery(scope) : { sql: "", params: [] };
      const scopeHash = createHash("sha256")
        .update(
          JSON.stringify({
            user_id: req.user!.sub,
            role: req.user!.role,
            sql: scopeQuery.sql,
            params: scopeQuery.params,
          }),
        )
        .digest("hex");
      const result = await db.transaction(async (tx) => {
        const [snapshot] = await tx
          .select({
            generation: schema.blbRegistrySnapshot.generation,
          })
          .from(schema.blbRegistrySnapshot)
          .where(eq(schema.blbRegistrySnapshot.snapshot_key, "default"))
          .limit(1);
        const generation = snapshot?.generation ?? "legacy";
        if (cursor && (cursor.generation !== generation || cursor.scope_hash !== scopeHash)) {
          return { changed: true as const };
        }
        const registryVersion = createHdssRegistryVersion(generation, scopeHash);
        if (!cursor && knownVersion === registryVersion) {
          return { changed: false as const, generation, registryVersion, notModified: true, individuals: [], hasMore: false };
        }
        const conditions = [];
        if (scope) conditions.push(scope);
        if (cursor) conditions.push(gt(schema.blbRegistryIndividuals.uid, cursor.uid));
        const page = await tx
          .select()
          .from(schema.blbRegistryIndividuals)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(schema.blbRegistryIndividuals.uid)
          .limit(requestedLimit + 1);
        const hasMore = page.length > requestedLimit;
        const individuals = hasMore ? page.slice(0, requestedLimit) : page;
        return { changed: false as const, generation, registryVersion, notModified: false, individuals, hasMore };
      }, { isolationLevel: "repeatable read" });
      if (result.changed) {
        sendError(res, 409, "REGISTRY_CHANGED", "Registry changed; restart the lookup");
        return;
      }
      const { individuals, hasMore, generation, registryVersion, notModified } = result;
      sendSuccess(
        res,
        {
          // The HDSS export is person-granular. Household projection rows
          // are intentionally not fabricated from partial cursor pages.
          households: [],
          individuals,
          registry_version: registryVersion,
          not_modified: notModified,
          next_cursor: hasMore
            ? encodeHdssRegistryCursor({
                uid: individuals[individuals.length - 1]?.uid ?? "",
                generation,
                scope_hash: scopeHash,
              })
            : null,
        },
        200,
        { individuals: individuals.length, households: 0 },
      );
    } catch {
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  },
);

export default router;
