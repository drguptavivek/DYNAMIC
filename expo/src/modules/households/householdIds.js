import { getStudyVillageName } from "../../../../shared/studyMasters.js";

export const CONSENT_LABELS = {
  1: "Yes",
  2: "No"
};

export function normalizeWomanQuestionnaireEligible(value) {
  if (value === true || value === 1 || value === "1") return 1;
  return 0;
}

export function normalizeIdPart(value, fallback, width) {
  const text = String(value || fallback || "").trim();
  return width ? text.padStart(width, "0") : text;
}

export function normalizeStructureMapId(value) {
  const text = String(value || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{1,6}$/.test(text)) return "";
  return /^\d+$/.test(text) && text.length < 4 ? text.padStart(4, "0") : text;
}

export function buildHouseholdId(record) {
  const structureNumber = normalizeStructureMapId(record.structure_number);
  if (!structureNumber) return "";
  return [
    normalizeIdPart(record.site_id, "0"),
    normalizeIdPart(record.locality_code, "00", 2),
    structureNumber,
    normalizeIdPart(record.household_number, "00", 2)
  ].join("-");
}

export function buildHouseholdIdFromHhqData(hhqData) {
  const siteId = hhqData.hhq_site_id;
  const localityCode = hhqData.hhq_locality_code;
  const structureNumber = hhqData.hhq_structure_map_id;
  const householdNumber = hhqData.hhq_household_number;

  if (!siteId || !localityCode || !structureNumber || !householdNumber) {
    return "";
  }
  if (!/^[0-9]{2}$/.test(normalizeIdPart(localityCode, "00", 2))) {
    return "";
  }
  if (!/^[A-Za-z0-9]{1,6}$/.test(String(structureNumber).trim())) {
    return "";
  }
  if (!/^[0-9]{2}$/.test(String(householdNumber))) {
    return "";
  }

  return buildHouseholdId({
    site_id: siteId,
    locality_code: localityCode,
    structure_number: structureNumber,
    household_number: householdNumber
  });
}

export function buildIndividualId(householdId, lineNumber) {
  return `${householdId}-${normalizeIdPart(lineNumber, "00", 2)}`;
}

export function extractMemberRows(householdId, hhqData, updatedAt) {
  return (hhqData.hhq_household_members || []).map((member, index) => {
    const lineNumber = Number(member.member_line_number || index + 1);
    const residenceDuration = member.member_residence_duration || {};
    return {
      individual_id: buildIndividualId(householdId, lineNumber),
      household_id: householdId,
      line_number: lineNumber,
      member_name: member.member_name || "",
      relationship_to_head: member.member_relationship_to_head || "",
      sex: member.member_sex || "",
      last_residence_place: member.member_last_residence_place || "",
      residence_months: residenceDuration.months ?? "",
      residence_years: residenceDuration.years ?? "",
      age_years: member.member_age_years || "",
      marital_status: member.member_marital_status || "",
      woman_questionnaire_eligible: normalizeWomanQuestionnaireEligible(
        member.member_woman_questionnaire_eligible
      ),
      birth_registration_status: member.member_birth_registration_status || "",
      ever_attended_school: member.member_ever_attended_school || "",
      highest_grade_completed: member.member_highest_grade_completed || "",
      sync_status: "local",
      updated_at: updatedAt
    };
  });
}

export function assertUniqueMembers(record) {
  const memberIds = new Set();
  const lineNumbers = new Set();
  for (const member of record.members || []) {
    if (memberIds.has(member.individual_id)) {
      throw new Error(`Duplicate individual ID: ${member.individual_id}`);
    }
    if (lineNumbers.has(member.line_number)) {
      throw new Error(`Duplicate household member line number: ${member.line_number}`);
    }
    memberIds.add(member.individual_id);
    lineNumbers.add(member.line_number);
  }
}

export function extractHouseholdRegistryFields(hhqData) {
  const siteId = hhqData.hhq_site_id || "";
  const localityCode = hhqData.hhq_locality_code || "";
  const structureNumber = hhqData.hhq_structure_map_id || "";
  const householdNumber = hhqData.hhq_household_number || "";
  const mobileNumbers = Array.isArray(hhqData.hhq_contact_mobile_numbers)
    ? hhqData.hhq_contact_mobile_numbers
        .map((row) => row?.mobile_number)
        .filter(Boolean)
        .map(String)
    : [];
  const updatedAt = new Date().toISOString();
  const record = {
    site_id: siteId,
    locality_code: String(localityCode || ""),
    locality_name: getStudyVillageName(siteId, localityCode),
    structure_number: normalizeStructureMapId(structureNumber),
    household_number: String(householdNumber || ""),
    address: hhqData.hhq_household_address || "",
    household_head_name: hhqData.hhq_household_head_name || "",
    consent_status:
      CONSENT_LABELS[hhqData.hhq_consent_study_provide_pis_explain_study_adult_member] ||
      "",
    interview_date: hhqData.hhq_interview_date || "",
    result_interview: hhqData.hhq_result_interview || "",
    language_questionnaire: hhqData.hhq_language_questionnaire || "",
    mobile_number: mobileNumbers.length
      ? mobileNumbers.join(", ")
      : hhqData.hhq_contact_mobile || "",
    sync_status: "local",
    updated_at: updatedAt
  };
  const householdId = buildHouseholdIdFromHhqData(hhqData) || buildHouseholdId(record);
  return {
    ...record,
    household_id: householdId,
    members: extractMemberRows(householdId, hhqData, updatedAt),
    raw_hhq_json: hhqData
  };
}
