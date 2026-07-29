import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, ilike, sql } from "drizzle-orm";
import multer, { Multer } from "multer";
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

function computeHouseholdId(record: MappingFrameRecord): string {
  return `${record.site_id}-${record.locality_code}-${record.structure_map_id}-${record.household_number}`;
}

function computeStructureId(record: MappingFrameRecord): string {
  return `${record.site_id}-${record.locality_code}-${record.structure_map_id}`;
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
      })
      .from(schema.mappingFrame)
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
      })
      .from(schema.mappingFrame)
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

      const csvContent = req.file.buffer.toString("utf-8");
      const lines = csvContent.split("\n").filter((line) => line.trim());

      if (lines.length < 2) {
        sendError(res, 400, "INVALID_CSV", "CSV must contain header row and at least one data row");
        return;
      }

      const header = lines[0].split(",").map((h) => h.trim());
      const expectedColumns = ["site_id", "locality_code", "structure_map_id", "household_number"];

      if (JSON.stringify(header) !== JSON.stringify(expectedColumns)) {
        sendError(res, 400, "INVALID_CSV", `CSV must have columns: ${expectedColumns.join(", ")}`);
        return;
      }

      const records: any[] = [];
      const errors: any[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map((v) => v.trim());

        if (values.length !== 4 || !values.every((v) => v)) {
          errors.push({ line: i + 1, error: "Invalid row format" });
          continue;
        }

        const record = {
          site_id: parseInt(values[0], 10),
          locality_code: values[1],
          structure_map_id: values[2],
          household_number: values[3],
        };

        try {
          const validated = mappingFrameRecordSchema.parse(record);
          records.push(validated);
        } catch (error) {
          if (error instanceof z.ZodError) {
            errors.push({ line: i + 1, errors: error.errors });
          }
        }
      }

      if (errors.length > 0) {
        sendError(res, 400, "VALIDATION_ERROR", "Some rows failed validation", { errors });
        return;
      }

      const valuesToInsert = records.map((record) => ({
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
      const skipped = records.length - inserted;

      sendSuccess(res, { inserted, skipped }, 201);
    } catch (error) {
      console.error("Import CSV error:", error);
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
