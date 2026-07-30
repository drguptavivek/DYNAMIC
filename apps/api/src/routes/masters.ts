import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, ilike, sql } from "drizzle-orm";
import multer, { Multer } from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import { db, schema } from "../db";
import { requireRole } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

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
  structure_map_id: z.string().length(4),
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
    const structureMapId = validateAndPadNumericCode(structureRaw, "Structure ID", 4, errors);
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
  const mappingRows = rows.map((record) => ({
    household_id: record.household_id,
    site_id: record.site_id,
    locality_code: record.locality_code,
    structure_map_id: record.structure_map_id,
    household_number: record.household_number,
    structure_id: record.structure_id,
    mapping_status: "listed" as const,
    baseline_enrollment_status: "pending" as const,
  }));
  const householdRows = rows.map((record) => ({
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

  let inserted = 0;
  await db.transaction(async (tx) => {
    const mappingResult = await tx
      .insert(schema.mappingFrame)
      .values(mappingRows)
      .onConflictDoNothing();
    inserted = mappingResult.rowCount || 0;

    await tx
      .insert(schema.households)
      .values(householdRows)
      .onConflictDoNothing();
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
        structure_id: schema.mappingFrame.structure_id,
        mapping_status: schema.mappingFrame.mapping_status,
        baseline_enrollment_status: schema.mappingFrame.baseline_enrollment_status,
        consent_status: schema.households.consent_status,
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
        { rows, ready, duplicate, invalid },
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

export default router;
