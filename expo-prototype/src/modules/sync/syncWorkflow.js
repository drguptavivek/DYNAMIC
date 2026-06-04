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

export function buildPushRecords({ formResponses = [], domainEvents = [] } = {}) {
  return [
    ...formResponses.map((response) => ({
      type: "form_response",
      data: response,
    })),
    ...domainEvents.map((event) => ({
      type: "domain_event",
      data: {
        ...event.payload,
        id: event.id,
        event_type: event.event_type,
        created_offline_at: event.created_at,
        event_datetime: event.payload?.timestamp || event.created_at,
      },
    })),
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
  return syncPayload.sync_cursor || fallbackCursor;
}

export function formatSyncCompletionMessage(result = {}) {
  const parts = [];
  const pluralize = (count, singular, plural = `${singular}s`) =>
    `${count} ${count === 1 ? singular : plural}`;

  if (typeof result.pulled === "number") {
    parts.push(`${result.pulled} pulled`);
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
