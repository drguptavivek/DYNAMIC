import { db, schema } from "../db";
import { eq, and } from "drizzle-orm";
import {
  onHouseholdEnrolled,
  onWqCompleted,
  onPregnancyEnrolled,
  onPregnancyOutcomeRecorded,
  onBirthAssessmentCompleted,
  onChildDeath,
} from "@dynamic/shared-workflow";
import { writeTasksFromDescriptors } from "./taskWriter";
import { randomUUID } from "crypto";

interface FormAnswers {
  [key: string]: any;
}

function parseHouseholdId(householdId: string): { site_id: number; locality_code: string } {
  const parts = householdId.split("-");
  return {
    site_id: parseInt(parts[0]) || 0,
    locality_code: parts[1] || "",
  };
}

export async function processFormResponse(formResponseId: string): Promise<void> {
  try {
    // Load form response with task and household context
    const formResponse = await db
      .select()
      .from(schema.formResponses)
      .where(eq(schema.formResponses.form_response_id, formResponseId))
      .limit(1);

    if (formResponse.length === 0) {
      throw new Error(`Form response not found: ${formResponseId}`);
    }

    const response = formResponse[0];
    const answers = (response.answers_json || {}) as FormAnswers;

    // Dispatch to promotion function based on form_code
    switch (response.form_code) {
      case "HHQ":
        await promoteHhq(response.household_id || "", answers);
        break;
      case "WQ":
        await promoteWq(response.household_id || "", response.subject_id || "", answers);
        break;
      case "PEF":
        await promotePef(response.household_id || "", response.subject_id || "", answers);
        break;
      case "UF":
        // Ultrasound follow-up - may refine EDD only
        if (response.subject_id) {
          await promoteUf(response.subject_id, answers);
        }
        break;
      case "POF":
        await promotePof(response.household_id || "", response.subject_id || "", answers);
        break;
      case "BAF":
        if (response.subject_id) {
          await promoteBaf(response.subject_id, answers);
        }
        break;
      case "NFF":
        if (response.subject_id) {
          const protocolVisitLabel = response.subject_id; // May need to extract from task context
          await promoteNff(response.subject_id, answers, protocolVisitLabel);
        }
        break;
      case "CDF":
        if (response.subject_id) {
          await promoteCdf(response.subject_id, answers);
        }
        break;
      case "SBF":
        // Stillbirth follow-up - handle separately if needed
        break;
      default:
        throw new Error(`Unknown form code, cannot promote: ${response.form_code}`);
    }
  } catch (err) {
    console.error(`Error processing form response ${formResponseId}:`, err);
    throw err;
  }
}

async function promoteHhq(householdId: string, answers: FormAnswers): Promise<void> {
  try {
    // Extract interview date
    const interviewDate = answers.hhq_interview_date || new Date().toISOString().split("T")[0];

    // Update household
    await db
      .update(schema.households)
      .set({
        baseline_completed_date: interviewDate,
        baseline_enrollment_status: "enrolled",
        updated_at: new Date(),
      })
      .where(eq(schema.households.household_id, householdId));

    // Extract household members panel
    const membersPanel = (answers.hhq_household_members || []) as any[];
    for (const member of membersPanel) {
      try {
        const memberNumber = member.member_line_number || membersPanel.indexOf(member) + 1;
        const memberId = buildMemberId(householdId, memberNumber);

        // Infer DOB from age if not provided
        let dob = member.member_date_of_birth;
        if (!dob && member.member_age_years) {
          const currentYear = new Date().getFullYear();
          const birthYear = currentYear - parseInt(member.member_age_years);
          dob = `${birthYear}-01-01`;
        }

        // Get household info to extract site_id and locality_code
        const household = await db
          .select()
          .from(schema.households)
          .where(eq(schema.households.household_id, householdId))
          .limit(1);

        if (household.length === 0) continue;

        const hh = household[0];

        // Upsert household member
        await db
          .insert(schema.householdMembers)
          .values({
            household_member_id: memberId,
            household_id: householdId,
            member_number: memberNumber,
            site_id: hh.site_id,
            locality_code: hh.locality_code,
            name: member.member_name,
            relationship_to_head: member.member_relationship_to_head,
            sex: member.member_sex,
            date_of_birth: dob,
            date_of_birth_precision:
              dob && !member.member_date_of_birth ? "inferred_from_age" : "reported",
            reported_age_years: member.member_age_years,
            reported_age_as_of_date: interviewDate,
            dob_inference_rule_version: dob && !member.member_date_of_birth ? "1.0" : undefined,
            member_status: "active",
            usual_resident: true,
            member_source: "baseline",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .onConflictDoUpdate({
            target: [schema.householdMembers.household_id, schema.householdMembers.member_number],
            set: {
              name: member.member_name,
              relationship_to_head: member.member_relationship_to_head,
              sex: member.member_sex,
              date_of_birth: dob,
              date_of_birth_precision:
                dob && !member.member_date_of_birth ? "inferred_from_age" : "reported",
              reported_age_years: member.member_age_years,
              reported_age_as_of_date: interviewDate,
              updated_at: new Date(),
            },
          });
      } catch (memberErr) {
        console.error(`Failed to process household member for ${householdId}:`, memberErr);
      }
    }

    // Generate HRF tasks if this is baseline enrollment
    const household = await db
      .select()
      .from(schema.households)
      .where(eq(schema.households.household_id, householdId))
      .limit(1);

    if (household.length > 0) {
      const hh = household[0];
      const tasks = onHouseholdEnrolled({
        event_id: randomUUID(),
        household_id: householdId,
        baseline_completed_date: interviewDate,
      });
      await writeTasksFromDescriptors(tasks);
    }
  } catch (err) {
    console.error(`Error in promoteHhq for ${householdId}:`, err);
  }
}

async function promoteWq(
  householdId: string,
  subjectId: string,
  answers: FormAnswers,
): Promise<void> {
  try {
    const isPregnant =
      answers.wq_pregnant === "1" || answers.wq_pregnant === 1 || answers.wq_pregnant === true;

    // Get household info
    const household = await db
      .select()
      .from(schema.households)
      .where(eq(schema.households.household_id, householdId))
      .limit(1);

    if (household.length === 0) return;
    const hh = household[0];

    // Check if eligible woman already exists
    const existingWoman = await db
      .select()
      .from(schema.eligibleWomen)
      .where(eq(schema.eligibleWomen.household_member_id, subjectId))
      .limit(1);

    let womanId = existingWoman.length > 0 ? existingWoman[0].woman_id : randomUUID();

    // Upsert eligible woman
    await db
      .insert(schema.eligibleWomen)
      .values({
        woman_id: womanId,
        household_member_id: subjectId,
        household_id: householdId,
        site_id: hh.site_id,
        locality_code: hh.locality_code,
        eligibility_start_date: new Date().toISOString().split("T")[0],
        wq_status: "completed",
        tracking_status: isPregnant ? "enrolled" : "not_pregnant",
        current_eligibility_status: "eligible",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.eligibleWomen.household_member_id],
        set: {
          wq_status: "completed",
          tracking_status: isPregnant ? "enrolled" : "not_pregnant",
          updated_at: new Date(),
        },
      });

    if (isPregnant) {
      // Check if pregnancy already exists
      const existingPregnancy = await db
        .select()
        .from(schema.pregnancies)
        .where(eq(schema.pregnancies.household_member_id, subjectId))
        .limit(1);

      if (existingPregnancy.length === 0) {
        // Create pregnancy record
        const pregnancyId = randomUUID();
        await db.insert(schema.pregnancies).values({
          pregnancy_id: pregnancyId,
          woman_id: womanId,
          household_member_id: subjectId,
          household_id: householdId,
          site_id: hh.site_id,
          locality_code: hh.locality_code,
          pregnancy_sequence: 1,
          pregnancy_status: "active",
          detected_date: new Date().toISOString().split("T")[0],
          detection_source: "wq",
          created_at: new Date(),
          updated_at: new Date(),
        });
      }

      // Generate PEF task
      const tasks = onWqCompleted({
        event_id: randomUUID(),
        household_id: householdId,
        woman_id: womanId,
        wq_pregnant: true,
      });
      await writeTasksFromDescriptors(tasks);
    }
  } catch (err) {
    console.error(`Error in promoteWq for ${householdId}/${subjectId}:`, err);
  }
}

async function promotePef(
  householdId: string,
  subjectId: string,
  answers: FormAnswers,
): Promise<void> {
  try {
    // Find active pregnancy for this woman
    const pregnancies = await db
      .select()
      .from(schema.pregnancies)
      .where(
        and(
          eq(schema.pregnancies.household_member_id, subjectId),
          eq(schema.pregnancies.pregnancy_status, "active"),
        ),
      )
      .limit(1);

    if (pregnancies.length === 0) {
      console.warn(`No active pregnancy found for woman ${subjectId}`);
      return;
    }

    const pregnancy = pregnancies[0];

    // Update pregnancy with enrollment info
    const enrollmentDate = new Date().toISOString().split("T")[0];
    await db
      .update(schema.pregnancies)
      .set({
        enrollment_date: enrollmentDate,
        pregnancy_status: "enrolled",
        updated_at: new Date(),
      })
      .where(eq(schema.pregnancies.pregnancy_id, pregnancy.pregnancy_id));

    // Generate PFF schedule tasks
    const tasks = onPregnancyEnrolled({
      event_id: randomUUID(),
      household_id: householdId,
      woman_id: pregnancy.woman_id,
      pregnancy_id: pregnancy.pregnancy_id,
      enrollment_date: enrollmentDate,
      usg_available:
        answers.pef_any_time_during_pregnancy_ultrasound === "1" ||
        answers.pef_any_time_during_pregnancy_ultrasound === 1 ||
        answers.pef_any_time_during_pregnancy_ultrasound === true,
    });
    await writeTasksFromDescriptors(tasks);
  } catch (err) {
    console.error(`Error in promotePef for ${householdId}/${subjectId}:`, err);
  }
}

async function promoteUf(pregnancyId: string, answers: FormAnswers): Promise<void> {
  try {
    // Ultrasound may refine EDD
    const eddDate = answers.uf_edd;
    if (eddDate) {
      await db
        .update(schema.pregnancies)
        .set({
          edd_date: eddDate,
          updated_at: new Date(),
        })
        .where(eq(schema.pregnancies.pregnancy_id, pregnancyId));
    }
  } catch (err) {
    console.error(`Error in promoteUf for ${pregnancyId}:`, err);
  }
}

async function promotePof(
  householdId: string,
  subjectId: string,
  answers: FormAnswers,
): Promise<void> {
  try {
    // Find pregnancy by household member
    const pregnancies = await db
      .select()
      .from(schema.pregnancies)
      .where(eq(schema.pregnancies.household_member_id, subjectId))
      .limit(1);

    if (pregnancies.length === 0) {
      console.warn(`No pregnancy found for woman ${subjectId}`);
      return;
    }

    const pregnancy = pregnancies[0];
    const deliveryDate = answers.pof_delivery_date || new Date().toISOString().split("T")[0];

    // Update pregnancy outcome
    await db
      .update(schema.pregnancies)
      .set({
        pregnancy_status: "closed",
        outcome_recorded_date: deliveryDate,
        updated_at: new Date(),
      })
      .where(eq(schema.pregnancies.pregnancy_id, pregnancy.pregnancy_id));

    // Determine outcome type
    const livebirths =
      parseInt(answers.pof_number_live_born_infants_fill_one_birth_assessment) || 0;
    const stillbirths =
      parseInt(answers.pof_number_miscarriages_stillbirths_fill_one_birth_assessment_form) || 0;

    // Create child records for live births and stillbirths
    for (let i = 0; i < livebirths; i++) {
      const childId = randomUUID();
      const birthId = randomUUID();
      await db.insert(schema.children).values({
        child_id: childId,
        birth_id: birthId,
        pregnancy_id: pregnancy.pregnancy_id,
        woman_id: pregnancy.woman_id,
        household_id: householdId,
        site_id: pregnancy.site_id,
        birth_rank: i + 1,
        birth_date: deliveryDate,
        birth_status: "live_birth",
        live_birth_status: true,
        current_vital_status: "alive",
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    for (let i = 0; i < stillbirths; i++) {
      const childId = randomUUID();
      const birthId = randomUUID();
      await db.insert(schema.children).values({
        child_id: childId,
        birth_id: birthId,
        pregnancy_id: pregnancy.pregnancy_id,
        woman_id: pregnancy.woman_id,
        household_id: householdId,
        site_id: pregnancy.site_id,
        birth_rank: livebirths + i + 1,
        birth_date: deliveryDate,
        birth_status: "stillbirth",
        live_birth_status: false,
        current_vital_status: "stillbirth",
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    // Generate tasks for outcome
    const tasks = onPregnancyOutcomeRecorded({
      event_id: randomUUID(),
      household_id: householdId,
      woman_id: pregnancy.woman_id,
      pregnancy_id: pregnancy.pregnancy_id,
      outcome_type: livebirths > 0 ? "live_birth" : "stillbirth",
      outcome_date: deliveryDate,
      live_birth_count: livebirths,
      stillbirth_count: stillbirths,
    });
    await writeTasksFromDescriptors(tasks);
  } catch (err) {
    console.error(`Error in promotePof for ${householdId}/${subjectId}:`, err);
  }
}

async function promoteBaf(childId: string, answers: FormAnswers): Promise<void> {
  try {
    const birthWeight = parseInt(answers.baf_weight_birth_grams);
    const vitalStatus = answers.baf_vital_status_infant_birth;

    // Get child record to fetch related info
    const children = await db
      .select()
      .from(schema.children)
      .where(eq(schema.children.child_id, childId))
      .limit(1);

    if (children.length === 0) {
      console.warn(`Child not found: ${childId}`);
      return;
    }

    const child = children[0];

    await db
      .update(schema.children)
      .set({
        birth_weight_grams: isNaN(birthWeight) ? null : birthWeight,
        current_vital_status: vitalStatus || "alive",
        updated_at: new Date(),
      })
      .where(eq(schema.children.child_id, childId));

    // Generate task completion event
    const tasks = onBirthAssessmentCompleted({
      event_id: randomUUID(),
      household_id: child.household_id,
      pregnancy_id: child.pregnancy_id,
      woman_id: child.woman_id,
      child_id: childId,
      birth_date: child.birth_date || new Date().toISOString().split("T")[0],
      birth_status:
        (child.birth_status as "live_birth" | "stillbirth" | "fetal_loss_20plus") || "live_birth",
      current_vital_status: (vitalStatus === "dead" ? "deceased" : "alive") as "alive" | "deceased",
    });
    await writeTasksFromDescriptors(tasks);
  } catch (err) {
    console.error(`Error in promoteBaf for ${childId}:`, err);
  }
}

async function promoteNff(
  childId: string,
  answers: FormAnswers,
  protocolVisitLabel: string,
): Promise<void> {
  try {
    const vitalStatus = answers.nff_vital_status;

    // Get child record
    const children = await db
      .select()
      .from(schema.children)
      .where(eq(schema.children.child_id, childId))
      .limit(1);

    if (children.length === 0) {
      console.warn(`Child not found: ${childId}`);
      return;
    }

    const child = children[0];

    if (vitalStatus) {
      await db
        .update(schema.children)
        .set({
          current_vital_status: vitalStatus,
          updated_at: new Date(),
        })
        .where(eq(schema.children.child_id, childId));
    }

    // Check if child death
    if (vitalStatus === "dead") {
      // Generate VA task
      const tasks = onChildDeath({
        event_id: randomUUID(),
        household_id: child.household_id,
        woman_id: child.woman_id,
        child_id: childId,
        death_date: new Date().toISOString().split("T")[0],
      });
      await writeTasksFromDescriptors(tasks);
    }
  } catch (err) {
    console.error(`Error in promoteNff for ${childId}:`, err);
  }
}

async function promoteCdf(childId: string, answers: FormAnswers): Promise<void> {
  try {
    const deathDate = answers.cdf_death_date || new Date().toISOString().split("T")[0];

    // Get child record
    const children = await db
      .select()
      .from(schema.children)
      .where(eq(schema.children.child_id, childId))
      .limit(1);

    if (children.length === 0) {
      console.warn(`Child not found: ${childId}`);
      return;
    }

    const child = children[0];

    await db
      .update(schema.children)
      .set({
        current_vital_status: "dead",
        death_date: deathDate,
        updated_at: new Date(),
      })
      .where(eq(schema.children.child_id, childId));

    // Generate VA task
    const tasks = onChildDeath({
      event_id: randomUUID(),
      household_id: child.household_id,
      woman_id: child.woman_id,
      child_id: childId,
      death_date: deathDate,
    });
    await writeTasksFromDescriptors(tasks);
  } catch (err) {
    console.error(`Error in promoteCdf for ${childId}:`, err);
  }
}

function buildMemberId(householdId: string, memberNumber: number): string {
  return `${householdId}-${String(memberNumber).padStart(2, "0")}`;
}
