import { db, schema } from "../db";
import { eq, and } from "drizzle-orm";
import {
  onHouseholdEnrolled,
  onEligibleWomanIdentified,
  onWqCompleted,
  onPregnancyEnrolled,
  onPregnancyOutcomeRecorded,
  onBirthAssessmentCompleted,
  onChildDeath,
} from "@dynamic/shared-workflow";
import { writeTasksFromDescriptors } from "./taskWriter";
import { randomUUID } from "crypto";
import {
  buildHhqHouseholdPromotionValues,
  buildHhqMemberPromotionValues,
} from "./hhqPromotion";

interface FormAnswers {
  [key: string]: any;
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
  const now = new Date();
  const household = buildHhqHouseholdPromotionValues(householdId, answers, now);
  const interviewDate = household.baseline_completed_date;

  await db
    .insert(schema.households)
    .values(household)
    .onConflictDoUpdate({
      target: [schema.households.household_id],
      set: {
        site_id: household.site_id,
        locality_code: household.locality_code,
        structure_map_id: household.structure_map_id,
        household_number: household.household_number,
        residence_area_type: household.residence_area_type,
        address: household.address,
        household_head_name: household.household_head_name,
        contact_mobile: household.contact_mobile,
        consent_status: household.consent_status,
        result_interview: household.result_interview,
        language_questionnaire: household.language_questionnaire,
        baseline_enrollment_status: household.baseline_enrollment_status,
        baseline_completed_date: household.baseline_completed_date,
        sync_status: household.sync_status,
        updated_at: now,
      },
    });

  const membersPanel = (answers.hhq_household_members || []) as any[];
  const wqTasks = [];
  for (const [index, member] of membersPanel.entries()) {
    const promotedMember = buildHhqMemberPromotionValues(
      household,
      member,
      index,
      interviewDate,
      now,
    );

    await db
      .insert(schema.householdMembers)
      .values(promotedMember)
      .onConflictDoUpdate({
        target: [schema.householdMembers.household_id, schema.householdMembers.member_number],
        set: {
          site_id: promotedMember.site_id,
          locality_code: promotedMember.locality_code,
          name: promotedMember.name,
          relationship_to_head: promotedMember.relationship_to_head,
          sex: promotedMember.sex,
          last_residence_place: promotedMember.last_residence_place,
          residence_months: promotedMember.residence_months,
          residence_years: promotedMember.residence_years,
          date_of_birth: promotedMember.date_of_birth,
          date_of_birth_precision: promotedMember.date_of_birth_precision,
          reported_age_years: promotedMember.reported_age_years,
          reported_age_as_of_date: interviewDate,
          dob_inference_rule_version: promotedMember.dob_inference_rule_version,
          marital_status: promotedMember.marital_status,
          woman_questionnaire_eligible: promotedMember.woman_questionnaire_eligible,
          birth_registration_status: promotedMember.birth_registration_status,
          ever_attended_school: promotedMember.ever_attended_school,
          highest_grade_completed: promotedMember.highest_grade_completed,
          member_status: promotedMember.member_status,
          usual_resident: promotedMember.usual_resident,
          member_source: promotedMember.member_source,
          sync_status: promotedMember.sync_status,
          updated_at: now,
        },
      });

    if (promotedMember.woman_questionnaire_eligible) {
      await db
        .insert(schema.eligibleWomen)
        .values({
          woman_id: promotedMember.household_member_id,
          household_member_id: promotedMember.household_member_id,
          household_id: household.household_id,
          site_id: household.site_id,
          locality_code: household.locality_code,
          eligibility_start_date: interviewDate,
          eligibility_source_event_id: undefined,
          wq_status: "pending",
          tracking_status: "not_tracked",
          current_eligibility_status: "eligible",
          eligibility_basis: "baseline_hhq",
          sync_status: "synced",
          created_at: now,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: [schema.eligibleWomen.woman_id],
          set: {
            household_member_id: promotedMember.household_member_id,
            household_id: household.household_id,
            site_id: household.site_id,
            locality_code: household.locality_code,
            eligibility_start_date: interviewDate,
            current_eligibility_status: "eligible",
            eligibility_basis: "baseline_hhq",
            sync_status: "synced",
            updated_at: now,
          },
        });

      wqTasks.push(
        ...onEligibleWomanIdentified({
          event_id: `hhq:${household.household_id}:${promotedMember.household_member_id}`,
          household_id: household.household_id,
          woman_id: promotedMember.household_member_id,
          eligibility_start_date: interviewDate,
        }),
      );
    }
  }

  const tasks = onHouseholdEnrolled({
    event_id: randomUUID(),
    household_id: household.household_id,
    baseline_completed_date: interviewDate,
  });
  await writeTasksFromDescriptors([...tasks, ...wqTasks]);
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

    let womanId = existingWoman.length > 0 ? existingWoman[0].woman_id : subjectId || randomUUID();

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
        target: [schema.eligibleWomen.woman_id],
        set: {
          household_member_id: subjectId,
          household_id: householdId,
          site_id: hh.site_id,
          locality_code: hh.locality_code,
          wq_status: "completed",
          tracking_status: isPregnant ? "enrolled" : "not_pregnant",
          current_eligibility_status: "eligible",
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
    throw err;
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
      throw new Error(`No active pregnancy found for woman ${subjectId}`);
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
    throw err;
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
    throw err;
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
      throw new Error(`No pregnancy found for woman ${subjectId}`);
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
    throw err;
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
      throw new Error(`Child not found: ${childId}`);
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
    throw err;
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
      throw new Error(`Child not found: ${childId}`);
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
    throw err;
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
      throw new Error(`Child not found: ${childId}`);
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
    throw err;
  }
}
