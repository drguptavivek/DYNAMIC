export interface TaskContext {
  taskId: string;
  taskType: string;
  protocolVisitLabel?: string;
  targetDate: string;
  windowStart: string;
  windowEnd: string;
}

export interface HouseholdContext {
  householdId: string;
  siteId: string;
  localityCode: string;
  householdNumber: string;
  baselineCompletedDate?: string;
}

export interface MemberContext {
  memberId: string;
  householdId: string;
  memberNumber: number;
  fullName: string;
  sex?: string;
  dob?: string;
}

export interface PregnancyContext {
  pregnancyId: string;
  womanId: string;
  householdMemberId: string;
  lmpDate?: string;
  edd?: string;
  enrollmentDate?: string;
}

export interface ChildContext {
  childId: string;
  pregnancyId: string;
  motherMemberId: string;
  birthDate?: string;
  sex?: string;
  birthStatus: string;
}

export interface FormPrefill {
  [fieldName: string]: string | number | boolean | null;
}

export interface ReadOnlyFields {
  fields: string[];
}
