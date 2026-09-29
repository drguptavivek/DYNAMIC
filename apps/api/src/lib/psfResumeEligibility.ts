export function canResumePsfAfterNeverPregnantPff(
  pregnancies: Array<{ pregnancy_id: string; pregnancy_status: string | null }>,
  acceptedPff: Array<{ subject_id: string | null; answers_json: unknown }>,
): boolean {
  if (pregnancies.length === 0 || pregnancies.some((pregnancy) => pregnancy.pregnancy_status === "active")) {
    return false;
  }
  const pregnancyIds = new Set(pregnancies.map((pregnancy) => pregnancy.pregnancy_id));
  return acceptedPff.some((response) =>
    Boolean(response.subject_id && pregnancyIds.has(response.subject_id)) &&
    Number((response.answers_json as Record<string, unknown> | null)?.pff_pregnancy_status) === 3,
  );
}
