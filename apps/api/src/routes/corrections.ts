import { Router, Request, Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, schema } from "../db";
import { requireRole } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { requireDataAccess } from "../lib/dataAccess";

const router = Router();

/**
 * POST /api/v1/households/:id/corrections
 * Create a correction for a household
 */
router.post(
  "/households/:id/corrections",
  requireRole("central_admin", "site_research_scientist"),
  async (req: Request, res: Response) => {
    try {
      const householdId = req.params.id;
      const { field, old_value, new_value, reason } = req.body;
      const correctedBy = req.user?.sub;

      if (!correctedBy) {
        sendError(res, 401, "MISSING_AUTH", "User ID not found in token");
        return;
      }

      if (!field || old_value === undefined || new_value === undefined) {
        sendError(res, 400, "INVALID_INPUT", "field, old_value, and new_value are required");
        return;
      }

      // Verify household exists
      const [household] = await db
        .select()
        .from(schema.households)
        .where(eq(schema.households.household_id, householdId));

      if (!household) {
        sendError(res, 404, "HOUSEHOLD_NOT_FOUND", "Household not found");
        return;
      }
      if (
        req.user?.role === "site_research_scientist" &&
        req.user.site_id !== null &&
        household.site_id !== req.user.site_id
      ) {
        sendError(res, 403, "OUT_OF_SCOPE", "Household is outside the user's site scope");
        return;
      }

      const correctionId = crypto.randomUUID();
      const correctedAt = new Date();

      await db.transaction(async (tx) => {
        await tx.insert(schema.adminCorrections).values({
          id: correctionId,
          entity_type: "household",
          entity_id: householdId,
          field,
          old_value: String(old_value),
          new_value: String(new_value),
          reason,
          corrected_by: correctedBy,
        });

        await tx.insert(schema.adminCorrectionEvents).values({
          correction_event_id: correctionId,
          site_id: household.site_id,
          subject_type: "household",
          subject_id: householdId,
          field_name: field,
          old_value: String(old_value),
          new_value: String(new_value),
          reason_code: "admin_correction",
          reason_text: reason,
          source_reference: `admin_corrections:${correctionId}`,
          corrected_by_user_id: correctedBy,
          corrected_at: correctedAt,
          created_at: correctedAt,
        });

        const coreFields = [
          "locality_code",
          "household_number",
          "baseline_enrollment_status",
          "baseline_completed_date",
        ];
        if (coreFields.includes(field)) {
          const updateData: Record<string, any> = {};
          updateData[field] = new_value;
          await tx
            .update(schema.households)
            .set(updateData)
            .where(eq(schema.households.household_id, householdId));
        }
      });

      sendSuccess(
        res,
        {
          correction_id: correctionId,
          household_id: householdId,
          field,
          old_value,
          new_value,
          corrected_by: correctedBy,
          corrected_at: correctedAt,
        },
        201,
      );
    } catch (error) {
      console.error("Create household correction error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  },
);

/**
 * POST /api/v1/members/:id/corrections
 * Create a correction for a household member
 */
router.post(
  "/members/:id/corrections",
  requireRole("central_admin", "site_research_scientist"),
  async (req: Request, res: Response) => {
    try {
      const memberId = req.params.id;
      const { field, old_value, new_value, reason } = req.body;
      const correctedBy = req.user?.sub;

      if (!correctedBy) {
        sendError(res, 401, "MISSING_AUTH", "User ID not found in token");
        return;
      }

      if (!field || old_value === undefined || new_value === undefined) {
        sendError(res, 400, "INVALID_INPUT", "field, old_value, and new_value are required");
        return;
      }

      // Verify member exists
      const [member] = await db
        .select()
        .from(schema.householdMembers)
        .where(eq(schema.householdMembers.household_member_id, memberId));

      if (!member) {
        sendError(res, 404, "MEMBER_NOT_FOUND", "Member not found");
        return;
      }
      if (
        req.user?.role === "site_research_scientist" &&
        req.user.site_id !== null &&
        member.site_id !== req.user.site_id
      ) {
        sendError(res, 403, "OUT_OF_SCOPE", "Member is outside the user's site scope");
        return;
      }

      const correctionId = crypto.randomUUID();
      const correctedAt = new Date();

      await db.transaction(async (tx) => {
        await tx.insert(schema.adminCorrections).values({
          id: correctionId,
          entity_type: "member",
          entity_id: memberId,
          field,
          old_value: String(old_value),
          new_value: String(new_value),
          reason,
          corrected_by: correctedBy,
        });

        await tx.insert(schema.adminCorrectionEvents).values({
          correction_event_id: correctionId,
          site_id: member.site_id,
          subject_type: "member",
          subject_id: memberId,
          field_name: field,
          old_value: String(old_value),
          new_value: String(new_value),
          reason_code: "admin_correction",
          reason_text: reason,
          source_reference: `admin_corrections:${correctionId}`,
          corrected_by_user_id: correctedBy,
          corrected_at: correctedAt,
          created_at: correctedAt,
        });

        const coreFields = ["name", "date_of_birth", "sex", "relationship_to_head"];
        if (coreFields.includes(field)) {
          const updateData: Record<string, any> = {};
          if (field === "name") {
            updateData.name = new_value;
          } else if (field === "date_of_birth") {
            updateData.date_of_birth = new_value;
          } else if (field === "sex") {
            updateData.sex = new_value;
          } else if (field === "relationship_to_head") {
            updateData.relationship_to_head = new_value;
          }
          await tx
            .update(schema.householdMembers)
            .set(updateData)
            .where(eq(schema.householdMembers.household_member_id, memberId));
        }
      });

      sendSuccess(
        res,
        {
          correction_id: correctionId,
          member_id: memberId,
          field,
          old_value,
          new_value,
          corrected_by: correctedBy,
          corrected_at: correctedAt,
        },
        201,
      );
    } catch (error) {
      console.error("Create member correction error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  },
);

/**
 * GET /api/v1/households/:id/corrections
 * List all corrections for a household
 */
router.get(
  "/households/:id/corrections",
  requireDataAccess("can_access_admin_audit"),
  async (req: Request, res: Response) => {
    try {
      const householdId = req.params.id;

      const corrections = await db
        .select()
        .from(schema.adminCorrections)
        .where(
          and(
            eq(schema.adminCorrections.entity_type, "household"),
            eq(schema.adminCorrections.entity_id, householdId),
          ),
        )
        .orderBy(desc(schema.adminCorrections.corrected_at));

      sendSuccess(res, corrections);
    } catch (error) {
      console.error("List household corrections error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  },
);

/**
 * GET /api/v1/members/:id/corrections
 * List all corrections for a member
 */
router.get(
  "/members/:id/corrections",
  requireDataAccess("can_access_admin_audit"),
  async (req: Request, res: Response) => {
    try {
      const memberId = req.params.id;

      const corrections = await db
        .select()
        .from(schema.adminCorrections)
        .where(
          and(
            eq(schema.adminCorrections.entity_type, "member"),
            eq(schema.adminCorrections.entity_id, memberId),
          ),
        )
        .orderBy(desc(schema.adminCorrections.corrected_at));

      sendSuccess(res, corrections);
    } catch (error) {
      console.error("List member corrections error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  },
);

export default router;
