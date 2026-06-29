import { buildHouseholdIdFromHhqData, normalizeIdPart } from "../households/householdIds.js";

export function collectAssignedLocalityCodes(user, today = new Date().toISOString().split("T")[0]) {
  const assignments = Array.isArray(user?.area_assignments) ? user.area_assignments : [];
  const activeCodes = assignments
    .filter((assignment) => {
      if (!assignment?.locality_code) return false;
      if (!assignment.active_to) return true;
      return assignment.active_to >= today;
    })
    .map((assignment) => String(assignment.locality_code));

  return [...new Set(activeCodes)].sort();
}

function parseAnswersJson(answersJson) {
  if (typeof answersJson !== "string") return answersJson || {};
  try {
    return JSON.parse(answersJson);
  } catch {
    return {};
  }
}

function parseJsonObject(value) {
  if (typeof value !== "string") return value || {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function parseHouseholdScope(householdId) {
  if (!householdId) return {};
  const [siteId, localityCode] = String(householdId).split("-");
  const parsedSiteId = Number(siteId);
  return {
    site_id: Number.isFinite(parsedSiteId) ? parsedSiteId : undefined,
    locality_code: localityCode || undefined,
  };
}

function normalizeFormResponseForPush(response) {
  if (!response || !response.form_code) return response;
  const answersJson = parseAnswersJson(response.answers_json);
  const formCode = String(response.form_code || "").toUpperCase();
  const householdId =
    response.household_id ||
    (formCode === "HHQ" ? buildHouseholdIdFromHhqData(answersJson) : answersJson.household_id);
  const scope = parseHouseholdScope(householdId);
  const hhqSiteId =
    answersJson.hhq_site_id !== undefined && answersJson.hhq_site_id !== null && answersJson.hhq_site_id !== ""
      ? Number(answersJson.hhq_site_id)
      : undefined;
  const hhqLocalityCode =
    answersJson.hhq_locality_code !== undefined &&
    answersJson.hhq_locality_code !== null &&
    answersJson.hhq_locality_code !== ""
      ? normalizeIdPart(answersJson.hhq_locality_code, "00", 2)
      : undefined;

  const normalized = {
    ...response,
    form_code: formCode || response.form_code,
    answers_json: answersJson,
  };

  if (householdId || response.household_id) normalized.household_id = householdId || response.household_id;
  if (response.site_id !== undefined || hhqSiteId !== undefined || scope.site_id !== undefined) {
    normalized.site_id = response.site_id ?? hhqSiteId ?? scope.site_id;
  }
  if (response.locality_code !== undefined || hhqLocalityCode !== undefined || scope.locality_code !== undefined) {
    normalized.locality_code = response.locality_code ?? hhqLocalityCode ?? scope.locality_code;
  }
  if (response.subject_type || householdId) normalized.subject_type = response.subject_type || "household";
  if (response.subject_id || householdId) normalized.subject_id = response.subject_id || householdId;

  return normalized;
}

export function buildPushRecords({ formResponses = [], domainEvents = [] } = {}) {
  return [
    ...formResponses.map((response) => ({
      type: "form_response",
      data: normalizeFormResponseForPush(response),
    })),
    ...domainEvents.map((event) => {
      const payload = parseJsonObject(event.payload);
      return {
        type: "domain_event",
        data: {
          ...payload,
          id: event.id || payload.event_id,
          event_type: event.event_type || payload.event_type,
          created_offline_at: payload.created_offline_at || event.created_at,
          event_datetime: payload.recorded_at || payload.timestamp || event.created_at,
        },
      };
    }),
  ];
}

export function collectAcceptedSyncIds(syncResult = {}) {
  const accepted = Array.isArray(syncResult.accepted_records) ? syncResult.accepted_records : [];
  const duplicates = Array.isArray(syncResult.duplicates) ? syncResult.duplicates : [];
  return new Set([...accepted, ...duplicates]);
}

export function summarizePendingSyncData({ formResponses = [], domainEvents = [] } = {}) {
  return {
    responses: formResponses.length,
    events: domainEvents.length,
    total: formResponses.length + domainEvents.length,
  };
}

export function selectChangedFormCodes(remoteVersions = [], cachedVersions = []) {
  const cachedChecksums = new Map(
    cachedVersions
      .filter((form) => form?.form_code)
      .map((form) => [String(form.form_code).toUpperCase(), form.checksum || null]),
  );

  return remoteVersions
    .filter((form) => {
      if (!form?.form_code || !form.checksum) return false;
      const formCode = String(form.form_code).toUpperCase();
      return cachedChecksums.get(formCode) !== form.checksum;
    })
    .map((form) => String(form.form_code).toUpperCase());
}

export function selectNextPullCursor(syncPayload = {}, fallbackCursor = null) {
  const nextCursor = syncPayload.sync_cursor || fallbackCursor;
  if (!nextCursor) return null;
  const parsed = new Date(nextCursor);
  return Number.isNaN(parsed.getTime()) ? null : nextCursor;
}

export function formatClockDelta(deltaMs) {
  const totalSeconds = Math.round(Math.abs(Number(deltaMs) || 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds} sec`;
  if (seconds === 0) return `${minutes} min`;
  return `${minutes} min ${seconds} sec`;
}

export function summarizeClockStatus(clock = {}) {
  const deltaMs =
    typeof clock.server_device_delta_ms === "number" ? clock.server_device_delta_ms : null;
  const thresholdMs =
    typeof clock.warning_threshold_ms === "number" ? clock.warning_threshold_ms : 5 * 60 * 1000;
  const status = clock.clock_status || (deltaMs === null ? "unavailable" : "ok");
  const shouldWarn = status === "warning" || (deltaMs !== null && Math.abs(deltaMs) > thresholdMs);

  if (deltaMs === null) {
    return {
      status: "unavailable",
      deltaMs,
      shouldWarn: false,
      message: "Server time checked. Device clock delta was unavailable.",
    };
  }

  const formattedDelta = formatClockDelta(deltaMs);
  return {
    status: shouldWarn ? "warning" : "ok",
    deltaMs,
    shouldWarn,
    message: shouldWarn
      ? `Device clock differs from server by ${formattedDelta}. Sync will continue, but correct the device time before field work.`
      : `Device clock is within ${formattedDelta} of server time.`,
  };
}

export function buildClockDriftAlert(clockStatus = null) {
  if (!clockStatus?.shouldWarn) return null;

  return {
    title: "Correct device date and time",
    message: clockStatus.message,
  };
}

export function formatSyncCompletionMessage(result = {}) {
  const parts = [];
  const pluralize = (count, singular, plural = `${singular}s`) =>
    `${count} ${count === 1 ? singular : plural}`;

  if (typeof result.pulled === "number") {
    parts.push(`${pluralize(result.pulled, "task")} pulled`);
  }

  if (typeof result.pulledHouseholds === "number") {
    parts.push(`${pluralize(result.pulledHouseholds, "household")} pulled`);
  }

  if (typeof result.pulledMembers === "number") {
    parts.push(`${pluralize(result.pulledMembers, "member")} pulled`);
  }

  if (typeof result.pulledEligibleWomen === "number") {
    parts.push(`${pluralize(result.pulledEligibleWomen, "eligible woman", "eligible women")} pulled`);
  }

  if (typeof result.pushed === "number") {
    parts.push(`${pluralize(result.pushed, "response")} pushed`);
  }

  if (Object.prototype.hasOwnProperty.call(result, "events")) {
    parts.push(`${pluralize(result.events, "event")} pushed`);
  }

  if (Object.prototype.hasOwnProperty.call(result, "formsUpdated")) {
    parts.push(`${pluralize(result.formsUpdated, "form")} updated`);
  }

  return `Sync complete: ${parts.join(", ")}`;
}
