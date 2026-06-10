type HhqAnswers = Record<string, any>;

const CONSENT_LABELS: Record<string, string> = {
  "1": "Yes",
  "2": "No",
};

export function normalizeIdPart(value: unknown, fallback: string, width?: number): string {
  const text = String(value ?? fallback ?? "").trim();
  return width ? text.padStart(width, "0") : text;
}

export function buildHhqHouseholdId(answers: HhqAnswers): string {
  const siteId = answers.hhq_site_id;
  const localityCode = answers.hhq_locality_code;
  const structureMapId = answers.hhq_structure_map_id;
  const householdNumber = answers.hhq_household_number;

  if (!siteId || !localityCode || !structureMapId || !householdNumber) {
    return "";
  }

  return [
    normalizeIdPart(siteId, "0"),
    normalizeIdPart(localityCode, "00", 2),
    normalizeIdPart(structureMapId, "0000", 4),
    normalizeIdPart(householdNumber, "00", 2),
  ].join("-");
}

function parseHouseholdId(householdId: string) {
  const [siteId, localityCode, structureMapId, householdNumber] = householdId.split("-");
  const parsedSiteId = Number.parseInt(siteId, 10);
  return {
    site_id: Number.isFinite(parsedSiteId) ? parsedSiteId : undefined,
    locality_code: localityCode,
    structure_map_id: structureMapId,
    household_number: householdNumber,
  };
}

function collectMobileNumbers(answers: HhqAnswers): string {
  if (Array.isArray(answers.hhq_contact_mobile_numbers)) {
    const numbers = answers.hhq_contact_mobile_numbers
      .map((row: any) => row?.mobile_number)
      .filter(Boolean)
      .map(String);
    if (numbers.length > 0) return numbers.join(", ");
  }
  return answers.hhq_contact_mobile ? String(answers.hhq_contact_mobile) : "";
}

export function buildHhqHouseholdPromotionValues(
  responseHouseholdId: string,
  answers: HhqAnswers,
  now = new Date(),
) {
  const householdId = responseHouseholdId || buildHhqHouseholdId(answers);
  const parsed = parseHouseholdId(householdId);
  const siteId =
    answers.hhq_site_id !== undefined && answers.hhq_site_id !== null && answers.hhq_site_id !== ""
      ? Number(answers.hhq_site_id)
      : parsed.site_id;
  const localityCode =
    answers.hhq_locality_code !== undefined &&
    answers.hhq_locality_code !== null &&
    answers.hhq_locality_code !== ""
      ? normalizeIdPart(answers.hhq_locality_code, "00", 2)
      : parsed.locality_code;
  const structureMapId =
    answers.hhq_structure_map_id !== undefined &&
    answers.hhq_structure_map_id !== null &&
    answers.hhq_structure_map_id !== ""
      ? String(answers.hhq_structure_map_id)
      : parsed.structure_map_id;
  const householdNumber =
    answers.hhq_household_number !== undefined &&
    answers.hhq_household_number !== null &&
    answers.hhq_household_number !== ""
      ? String(answers.hhq_household_number)
      : parsed.household_number;

  if (!householdId || siteId === undefined || !localityCode || !structureMapId || !householdNumber) {
    throw new Error("Missing HHQ household identity fields");
  }

  return {
    household_id: householdId,
    site_id: siteId,
    locality_code: localityCode,
    structure_map_id: structureMapId,
    household_number: householdNumber,
    residence_area_type: answers.hhq_residence_area_type,
    address: answers.hhq_household_address || "",
    household_head_name: answers.hhq_household_head_name || "",
    contact_mobile: collectMobileNumbers(answers),
    consent_status:
      CONSENT_LABELS[String(answers.hhq_consent_study_provide_pis_explain_study_adult_member)] || "",
    result_interview: answers.hhq_result_interview,
    language_questionnaire: answers.hhq_language_questionnaire,
    baseline_enrollment_status: "enrolled",
    baseline_completed_date: answers.hhq_interview_date || now.toISOString().split("T")[0],
    sync_status: "synced",
    created_at: now,
    updated_at: now,
  };
}

function buildMemberId(householdId: string, memberNumber: number): string {
  return `${householdId}-${normalizeIdPart(memberNumber, "00", 2)}`;
}

function inferDateOfBirth(ageYears: unknown, asOfDate: string): string | undefined {
  const age = Number.parseInt(String(ageYears ?? ""), 10);
  if (!Number.isFinite(age)) return undefined;
  const asOfYear = Number.parseInt(String(asOfDate).slice(0, 4), 10);
  if (!Number.isFinite(asOfYear)) return undefined;
  return `${asOfYear - age}-01-01`;
}

export function buildHhqMemberPromotionValues(
  household: ReturnType<typeof buildHhqHouseholdPromotionValues>,
  member: HhqAnswers,
  index: number,
  interviewDate: string,
  now = new Date(),
) {
  const memberNumber = Number(member.member_line_number || index + 1);
  const residenceDuration = member.member_residence_duration || {};
  const reportedDob = member.member_date_of_birth;
  const inferredDob = reportedDob || inferDateOfBirth(member.member_age_years, interviewDate);

  return {
    household_member_id: buildMemberId(household.household_id, memberNumber),
    household_id: household.household_id,
    member_number: memberNumber,
    site_id: household.site_id,
    locality_code: household.locality_code,
    name: member.member_name || "",
    relationship_to_head: member.member_relationship_to_head,
    sex: member.member_sex,
    last_residence_place: member.member_last_residence_place,
    residence_months: residenceDuration.months,
    residence_years: residenceDuration.years,
    date_of_birth: inferredDob,
    date_of_birth_precision: reportedDob ? "reported" : "inferred_from_age",
    reported_age_years: member.member_age_years,
    reported_age_as_of_date: interviewDate,
    dob_inference_rule_version: reportedDob ? undefined : "1.0",
    marital_status: member.member_marital_status,
    woman_questionnaire_eligible:
      member.member_woman_questionnaire_eligible === true ||
      member.member_woman_questionnaire_eligible === 1 ||
      member.member_woman_questionnaire_eligible === "1",
    birth_registration_status: member.member_birth_registration_status,
    ever_attended_school: member.member_ever_attended_school,
    highest_grade_completed: member.member_highest_grade_completed,
    member_status: "active",
    usual_resident: true,
    member_source: "baseline",
    sync_status: "synced",
    created_at: now,
    updated_at: now,
  };
}
