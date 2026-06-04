import type { HouseholdContext, MemberContext, PregnancyContext, ChildContext } from "./types";

export function buildHouseholdContext(row: Record<string, unknown>): HouseholdContext {
  return {
    householdId: String(row.household_id ?? row.householdId ?? ""),
    siteId: String(row.site_id ?? row.siteId ?? ""),
    localityCode: String(row.locality_code ?? row.localityCode ?? ""),
    householdNumber: String(row.household_number ?? row.householdNumber ?? ""),
    baselineCompletedDate: row.baseline_completed_date
      ? String(row.baseline_completed_date)
      : row.baselineCompletedDate
        ? String(row.baselineCompletedDate)
        : undefined,
  };
}

export function buildMemberContext(row: Record<string, unknown>): MemberContext {
  return {
    memberId: String(row.member_id ?? row.memberId ?? ""),
    householdId: String(row.household_id ?? row.householdId ?? ""),
    memberNumber: Number(row.member_number ?? row.memberNumber ?? 0),
    fullName: String(row.full_name ?? row.fullName ?? ""),
    sex: row.sex ? String(row.sex) : undefined,
    dob: row.dob ? String(row.dob) : undefined,
  };
}

export function buildPregnancyContext(row: Record<string, unknown>): PregnancyContext {
  return {
    pregnancyId: String(row.pregnancy_id ?? row.pregnancyId ?? ""),
    womanId: String(row.woman_id ?? row.womanId ?? ""),
    householdMemberId: String(row.household_member_id ?? row.householdMemberId ?? ""),
    lmpDate: row.lmp_date ? String(row.lmp_date) : undefined,
    edd: row.edd ? String(row.edd) : undefined,
    enrollmentDate: row.enrollment_date
      ? String(row.enrollment_date)
      : row.enrollmentDate
        ? String(row.enrollmentDate)
        : undefined,
  };
}

export function buildChildContext(row: Record<string, unknown>): ChildContext {
  return {
    childId: String(row.child_id ?? row.childId ?? ""),
    pregnancyId: String(row.pregnancy_id ?? row.pregnancyId ?? ""),
    motherMemberId: String(row.mother_member_id ?? row.motherMemberId ?? ""),
    birthDate: row.birth_date ? String(row.birth_date) : undefined,
    sex: row.sex ? String(row.sex) : undefined,
    birthStatus: String(row.birth_status ?? row.birthStatus ?? ""),
  };
}
