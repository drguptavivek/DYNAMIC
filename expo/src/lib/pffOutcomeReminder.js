export function shouldShowPffOutcomeReminder(formCode, answers) {
  return String(formCode || "").toUpperCase() === "PFF" &&
    Number(answers?.pff_pregnancy_status) === 2 &&
    Number(answers?.pff_vital_migration_status_woman) !== 2;
}
