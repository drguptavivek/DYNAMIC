import { readHouseholdGps } from "../../lib/householdGps.js";
import { listFormResponses } from "../tasks/taskRepository.js";

/** Submitted BHQ evidence is already stored locally, including after sync. */
export function getSavedHouseholdGps(householdId) {
  if (!householdId) return null;
  const responses = listFormResponses({ form_code: "HHQ", household_id: householdId });
  for (const response of responses) {
    if (response.household_id !== householdId) continue;
    const statuses = [response.sync_status, response.server_response_status, response.response_status];
    if (statuses.some((status) => /^(?:invalid|rejected|duplicate|superseded|held_for_review)(?:$|[_:])/.test(String(status || "").toLowerCase()))) continue;
    let answers = response.answers_json;
    if (typeof answers === "string") {
      try { answers = JSON.parse(answers); } catch { continue; }
    }
    const gps = readHouseholdGps(answers);
    if (gps) return gps;
  }
  return null;
}
