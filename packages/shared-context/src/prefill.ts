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

export function buildUfPrefill(): { prefill: FormPrefill; readOnly: ReadOnlyFields } {
  return {
    prefill: {},
    readOnly: { fields: [] },
  };
}

export function buildPffPrefill(): { prefill: FormPrefill; readOnly: ReadOnlyFields } {
  return {
    prefill: {},
    readOnly: { fields: [] },
  };
}

export function buildPofPrefill(): { prefill: FormPrefill; readOnly: ReadOnlyFields } {
  return {
    prefill: {},
    readOnly: { fields: [] },
  };
}

export function buildBafPrefill(): { prefill: FormPrefill; readOnly: ReadOnlyFields } {
  return {
    prefill: {},
    readOnly: { fields: [] },
  };
}

export function buildSbfPrefill(): { prefill: FormPrefill; readOnly: ReadOnlyFields } {
  return {
    prefill: {},
    readOnly: { fields: [] },
  };
}

export function buildNffPrefill(): { prefill: FormPrefill; readOnly: ReadOnlyFields } {
  return {
    prefill: {},
    readOnly: { fields: [] },
  };
}

export function buildCdfPrefill(): { prefill: FormPrefill; readOnly: ReadOnlyFields } {
  return {
    prefill: {},
    readOnly: { fields: [] },
  };
}

export function buildVaPrefill(): { prefill: FormPrefill; readOnly: ReadOnlyFields } {
  return {
    prefill: {},
    readOnly: { fields: [] },
  };
}
