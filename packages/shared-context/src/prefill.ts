import type {
  FormPrefill,
  ReadOnlyFields,
  HouseholdContext,
  MemberContext,
  PregnancyContext,
  ChildContext,
  TaskContext,
} from "./types";

export function buildHhqPrefill(household: HouseholdContext): {
  prefill: FormPrefill;
  readOnly: ReadOnlyFields;
} {
  return {
    prefill: {
      hhq_site_id: household.siteId,
      hhq_locality_code: household.localityCode,
    },
    readOnly: {
      fields: ["hhq_site_id", "hhq_locality_code"],
    },
  };
}

export function buildWqPrefill(
  member: MemberContext,
  household: HouseholdContext,
): { prefill: FormPrefill; readOnly: ReadOnlyFields } {
  return {
    prefill: {
      wq_site_id: household.siteId,
      wq_locality_code: household.localityCode,
      wq_household_id: household.householdId,
      wq_member_id: member.memberId,
      wq_respondent_name: member.fullName,
      wq_respondent_dob: member.dob ?? "",
      wq_respondent_sex: member.sex ?? "",
    },
    readOnly: {
      fields: [
        "wq_site_id",
        "wq_locality_code",
        "wq_household_id",
        "wq_member_id",
        "wq_respondent_name",
        "wq_respondent_dob",
        "wq_respondent_sex",
      ],
    },
  };
}

export function buildHrfPrefill(
  household: HouseholdContext,
  task: TaskContext,
): { prefill: FormPrefill; readOnly: ReadOnlyFields } {
  return {
    prefill: {
      hrf_site_id: household.siteId,
      hrf_locality_code: household.localityCode,
      hrf_household_id: household.householdId,
      hrf_round_label: task.protocolVisitLabel ?? "",
    },
    readOnly: {
      fields: ["hrf_site_id", "hrf_locality_code", "hrf_household_id", "hrf_round_label"],
    },
  };
}

export function buildPefPrefill(
  member: MemberContext,
  household: HouseholdContext,
): { prefill: FormPrefill; readOnly: ReadOnlyFields } {
  return {
    prefill: {
      pef_site_id: household.siteId,
      pef_locality_code: household.localityCode,
      pef_household_id: household.householdId,
      pef_woman_id: member.memberId,
      pef_woman_name: member.fullName,
      pef_woman_dob: member.dob ?? "",
    },
    readOnly: {
      fields: [
        "pef_site_id",
        "pef_locality_code",
        "pef_household_id",
        "pef_woman_id",
        "pef_woman_name",
        "pef_woman_dob",
      ],
    },
  };
}

export function buildUfPrefill(
  member: MemberContext,
  pregnancy: PregnancyContext,
): { prefill: FormPrefill; readOnly: ReadOnlyFields } {
  return withReadOnlyFields({
    uf_woman_name: member.fullName,
    uf_pregnancy_id: pregnancy.pregnancyId,
  });
}

export function buildPffPrefill(
  member: MemberContext,
  pregnancy: PregnancyContext,
  task: TaskContext,
): { prefill: FormPrefill; readOnly: ReadOnlyFields } {
  return withReadOnlyFields({
    pff_woman_name: member.fullName,
    pff_woman_hh_member_id: member.memberId,
    pff_woman_permanent_id: pregnancy.womanId,
    pff_pregnancy_id: pregnancy.pregnancyId,
    pff_visit_date: task.targetDate,
    pff_visit_type: task.protocolVisitLabel ?? "",
  });
}

export function buildPofPrefill(
  member: MemberContext,
  pregnancy: PregnancyContext,
): { prefill: FormPrefill; readOnly: ReadOnlyFields } {
  return withReadOnlyFields({
    pof_woman_name: member.fullName,
    pof_woman_hh_member_id: member.memberId,
    pof_woman_permanent_id: pregnancy.womanId,
    pof_pregnancy_id: pregnancy.pregnancyId,
  });
}

export function buildBafPrefill(
  member: MemberContext,
  pregnancy: PregnancyContext,
  child?: ChildContext,
): { prefill: FormPrefill; readOnly: ReadOnlyFields } {
  return withReadOnlyFields({
    baf_woman_name: member.fullName,
    baf_woman_hh_member_id: member.memberId,
    baf_woman_permanent_id: pregnancy.womanId,
    baf_pregnancy_id: pregnancy.pregnancyId,
    baf_birth_id: child?.childId ?? "",
  });
}

export function buildSbfPrefill(
  member: MemberContext,
  pregnancy: PregnancyContext,
  child: ChildContext,
): { prefill: FormPrefill; readOnly: ReadOnlyFields } {
  return withReadOnlyFields({
    sbf_woman_name: member.fullName,
    sbf_woman_hh_member_id: member.memberId,
    sbf_woman_permanent_id: pregnancy.womanId,
    sbf_pregnancy_id: pregnancy.pregnancyId,
    sbf_birth_id: child.childId,
  });
}

export function buildNffPrefill(
  member: MemberContext,
  pregnancy: PregnancyContext,
  child: ChildContext,
  task: TaskContext,
): { prefill: FormPrefill; readOnly: ReadOnlyFields } {
  return withReadOnlyFields({
    nff_woman_name: member.fullName,
    nff_woman_hh_member_id: member.memberId,
    nff_woman_permanent_id: pregnancy.womanId,
    nff_pregnancy_id: pregnancy.pregnancyId,
    nff_birth_id: child.childId,
    nff_child_name: child.childName ?? "",
    nff_round_visit: task.protocolVisitLabel ?? "",
  });
}

export function buildCdfPrefill(
  member: MemberContext,
  pregnancy: PregnancyContext,
  child: ChildContext,
): { prefill: FormPrefill; readOnly: ReadOnlyFields } {
  return withReadOnlyFields({
    cdf_woman_name: member.fullName,
    cdf_woman_hh_member_id: member.memberId,
    cdf_woman_permanent_id: pregnancy.womanId,
    cdf_pregnancy_id: pregnancy.pregnancyId,
    cdf_birth_id: child.childId,
  });
}

export function buildVaPrefill(
  child: ChildContext,
  household: HouseholdContext,
  task: TaskContext,
): { prefill: FormPrefill; readOnly: ReadOnlyFields } {
  return withReadOnlyFields({
    va_household_id: household.householdId,
    va_child_id: child.childId,
    va_deceased_name: child.childName ?? "",
    va_death_trigger_visit: task.protocolVisitLabel ?? "",
  });
}

function withReadOnlyFields(prefill: FormPrefill): {
  prefill: FormPrefill;
  readOnly: ReadOnlyFields;
} {
  return {
    prefill,
    readOnly: {
      fields: Object.keys(prefill),
    },
  };
}
