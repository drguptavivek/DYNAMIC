const HHQ_RESULT_LABELS = {
  primary: "Completed",
  revisit_needed: "Revisit needed",
  superseded_revisit: "Previous revisit",
  excluded_after_revisits: "Excluded after visit 3",
};

function submittedTime(response) {
  const parsed = new Date(response?.submitted_at || response?.created_at || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getSubmissionResultLabel(response) {
  const status = String(response?.server_response_status || "").trim();
  if (status && HHQ_RESULT_LABELS[status]) return HHQ_RESULT_LABELS[status];
  if (status && status !== "primary") return status.replaceAll("_", " ");
  return response?.sync_status === "synced" ? "Uploaded" : response?.sync_status || "Pending";
}

export function getHhqVisitResultLabel(response, index, totalVisits) {
  if (
    index < totalVisits - 1 &&
    ["", "revisit_needed", "superseded_revisit"].includes(
      String(response?.server_response_status || "").trim(),
    )
  ) {
    return "Previous revisit";
  }
  return getSubmissionResultLabel(response);
}

export function buildSubmissionDisplayItems(responses = []) {
  const hhqGroups = new Map();
  const items = [];

  responses.forEach((response) => {
    if (response.form_code !== "HHQ" || !response.household_id) {
      items.push({ type: "submission", key: response.id, response });
      return;
    }

    const key = `HHQ:${response.household_id}`;
    if (!hhqGroups.has(key)) {
      hhqGroups.set(key, {
        type: "hhq-history",
        key,
        household_id: response.household_id,
        form_code: response.form_code,
        form_version: response.form_version,
        site_id: response.site_id,
        locality_code: response.locality_code,
        responses: [],
      });
    }
    hhqGroups.get(key).responses.push(response);
  });

  hhqGroups.forEach((group) => {
    group.responses.sort((left, right) => submittedTime(left) - submittedTime(right));
    group.latestSubmittedTime = Math.max(...group.responses.map(submittedTime));
    items.push(group);
  });

  return items.sort((left, right) => {
    const leftTime = left.type === "hhq-history" ? left.latestSubmittedTime : submittedTime(left.response);
    const rightTime = right.type === "hhq-history" ? right.latestSubmittedTime : submittedTime(right.response);
    return rightTime - leftTime;
  });
}
