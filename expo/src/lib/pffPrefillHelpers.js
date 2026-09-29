function responseIds(response) {
  return [response?.id, response?.form_response_id, response?.submission_id]
    .map((value) => String(value || ""))
    .filter(Boolean);
}

function responseTimestamp(response) {
  return String(response?.submitted_at || response?.created_at || "");
}

function newestFirst(left, right) {
  return responseTimestamp(right).localeCompare(responseTimestamp(left));
}

export function parsePffSourceAnswers(response) {
  if (!response) return {};
  if (response.answers_json && typeof response.answers_json === "object") {
    return response.answers_json;
  }
  try {
    return JSON.parse(response.answers_json || response.json_payload || "{}");
  } catch {
    return {};
  }
}

const PFF_PEF_SNAPSHOT_FIELDS = [
  "pef_pregnancy_id",
  "pef_woman_hh_member_id",
  "pef_woman_name",
  "pef_husband_name",
  "pef_current_address",
  "pef_height_cm",
  "pef_height_cm_automatically_filled_woman_s_questionnaire",
  "pef_first_ultrasound_report",
];

export function hasPefUltrasoundUploads(answers = {}) {
  const reports = answers.pef_ultrasound_reports?.reports;
  if (Array.isArray(reports)) {
    return reports.some((report) => {
      const images = Array.isArray(report?.images) ? report.images : [report];
      return images.some((image) => Boolean(image?.attachment_id));
    });
  }
  return answers.pef_ultrasound_uploaded === true;
}

export function buildPffPefSnapshot(answers = {}) {
  return {
    ...Object.fromEntries(
      PFF_PEF_SNAPSHOT_FIELDS
        .filter((name) => answers[name] !== undefined && answers[name] !== null && answers[name] !== "")
        .map((name) => [name, answers[name]]),
    ),
    pef_ultrasound_uploaded: hasPefUltrasoundUploads(answers),
  };
}

export function parsePffTaskSnapshot(task) {
  try {
    const snapshot = task?.pff_pef_snapshot_json;
    return snapshot && typeof snapshot === "object" ? snapshot : JSON.parse(snapshot || "{}");
  } catch {
    return {};
  }
}

export function findPffSourcePefResponse(responses = [], task = null) {
  const pefResponses = (Array.isArray(responses) ? responses : [])
    .filter((response) => String(response?.form_code || "").toUpperCase() === "PEF")
    .sort(newestFirst);
  const linkedIds = [
    task?.source_form_response_id,
    task?.sourceFormResponseId,
    task?.source_response_id,
  ]
    .map((value) => String(value || ""))
    .filter(Boolean);

  if (linkedIds.length) {
    const linkedResponse = pefResponses.find((response) =>
      responseIds(response).some((id) => linkedIds.includes(id)),
    );
    if (linkedResponse) return linkedResponse;
  }

  // The caller scopes responses to this woman/pregnancy. The newest PEF is a
  // safe fallback for server-created tasks whose source response id is absent.
  return pefResponses[0] || null;
}

export function findPreviousPffResponse(responses = [], task = null) {
  const currentTaskIds = [task?.id, task?.task_id, task?.task_key]
    .map((value) => String(value || ""))
    .filter(Boolean);

  return (Array.isArray(responses) ? responses : [])
    .filter((response) => String(response?.form_code || "").toUpperCase() === "PFF")
    .filter((response) => {
      const responseTaskId = String(response?.task_id || response?.task_key || "");
      return !responseTaskId || !currentTaskIds.includes(responseTaskId);
    })
    .sort(newestFirst)[0] || null;
}

export function buildPffLinkedSourcePrefill(responses = [], task = null) {
  const pefAnswers = {
    ...parsePffSourceAnswers(findPffSourcePefResponse(responses, task)),
    ...parsePffTaskSnapshot(task),
  };
  const previousPffAnswers = parsePffSourceAnswers(findPreviousPffResponse(responses, task));
  const prefill = {
    pff_pregnancy_id: pefAnswers.pef_pregnancy_id || task?.pregnancy_id || task?.subject_id || "",
    pff_woman_name: pefAnswers.pef_woman_name || "",
    pff_husband_name: pefAnswers.pef_husband_name || "",
    pff_last_contact_date: previousPffAnswers.pff_visit_date || task?.pff_last_visit_date || "",
    pff_ultrasound_form_already_been_filled: hasPefUltrasoundUploads(pefAnswers) ? 1 : 2,
  };

  return {
    pefAnswers,
    previousPffAnswers,
    prefill,
    readOnlyFields: Object.keys(prefill).filter((fieldName) => prefill[fieldName] !== ""),
  };
}
