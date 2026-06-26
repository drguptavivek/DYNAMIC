export * as householdBaselineConfirmed from "./householdBaselineConfirmed";
export * as eligibleWomanIdentified from "./eligibleWomanIdentified";
export * as wqCompleted from "./wqCompleted";
export * as pregnancyDetected from "./pregnancyDetected";
export * as pregnancyEnrolled from "./pregnancyEnrolled";
export * as pregnancyFollowupCompleted from "./pregnancyFollowupCompleted";
export * as pregnancyOutcomeRecorded from "./pregnancyOutcomeRecorded";
export * as birthAssessmentCompleted from "./birthAssessmentCompleted";
export * as childDeathRecorded from "./childDeathRecorded";
export * as verbalAutopsyCompleted from "./verbalAutopsyCompleted";
export * from "./types";

import * as householdBaselineConfirmed from "./householdBaselineConfirmed";
import * as wqCompleted from "./wqCompleted";
import * as pregnancyEnrolled from "./pregnancyEnrolled";
import * as pregnancyFollowupCompleted from "./pregnancyFollowupCompleted";
import * as pregnancyOutcomeRecorded from "./pregnancyOutcomeRecorded";
import * as birthAssessmentCompleted from "./birthAssessmentCompleted";
import * as childDeathRecorded from "./childDeathRecorded";
import * as verbalAutopsyCompleted from "./verbalAutopsyCompleted";

export const fieldEventRegistry = {
  HHQ: householdBaselineConfirmed,
  WQ: wqCompleted,
  PEF: pregnancyEnrolled,
  PFF: pregnancyFollowupCompleted,
  POF: pregnancyOutcomeRecorded,
  BAF: birthAssessmentCompleted,
  CDF: childDeathRecorded,
  VA: verbalAutopsyCompleted,
};
