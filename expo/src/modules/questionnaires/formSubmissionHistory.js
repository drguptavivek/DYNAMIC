export function normalizeFormResponse(row) {
  const normalized = {
    id: row.id || row.submission_id,
    form_code: row.form_code || "-",
    form_version: row.form_version || "",
    household_id: row.household_id || "",
    subject_type: row.subject_type || "",
    subject_id: row.subject_id || "",
    site_id: row.site_id ?? "",
    locality_code: row.locality_code || "",
    submitted_at: row.submitted_at || row.created_at || "",
    sync_status: row.sync_status || "pending",
    sync_error: row.sync_error || "",
    sync_error_at: row.sync_error_at || "",
    server_response_status: row.server_response_status || "",
  };
  normalized.search_text = responseSearchText(normalized);
  return normalized;
}

export function uniqueOptions(rows, field) {
  return [...new Set(rows.map((row) => String(row[field] ?? "").trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );
}

export function responseSearchText(response) {
  return [
    response.id,
    response.form_code,
    response.form_version,
    response.household_id,
    response.subject_type,
    response.subject_id,
    response.site_id,
    response.locality_code,
    response.sync_status,
    response.sync_error,
    response.submitted_at,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterResponses(responses, filters) {
  const search = String(filters.search || "").trim().toLowerCase();
  const siteId = String(filters.siteId || "").trim();
  const formId = String(filters.formId || "").trim().toLowerCase();
  const localityCode = String(filters.localityCode || "").trim();

  return responses.filter((response) => {
    const searchText = response.search_text || responseSearchText(response);
    if (search && !searchText.includes(search)) return false;
    if (siteId && String(response.site_id) !== siteId) return false;
    if (formId && String(response.form_code || "").toLowerCase() !== formId) return false;
    if (localityCode && String(response.locality_code || "") !== localityCode) return false;
    return true;
  });
}

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
