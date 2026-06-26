import { ProtocolConfig } from "./protocol-config";

/**
 * Add N calendar months to a date (day-of-month clamped to month end).
 */
export function addCalendarMonths(date: Date, months: number): Date {
  const d = new Date(date);
  let month = d.getMonth() + months;
  let year = d.getFullYear();

  while (month > 11) {
    month -= 12;
    year += 1;
  }
  while (month < 0) {
    month += 12;
    year -= 1;
  }

  // Get the original day
  const day = d.getDate();

  // Set year and month first without the day
  d.setFullYear(year, month, 1);

  // Get last day of the target month
  const lastDay = new Date(year, month + 1, 0).getDate();

  // Set the day, clamped to the last day of the month
  d.setDate(Math.min(day, lastDay));

  return d;
}

/**
 * Add N days to a date.
 */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Format Date to ISO date string YYYY-MM-DD
 */
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse ISO date string to Date (midnight UTC)
 */
export function parseISODate(s: string): Date {
  return new Date(s + "T00:00:00Z");
}

/**
 * Generate HRF task schedule from baseline_completed_date through study_end_date.
 */
export function generateHrfSchedule(params: {
  baseline_completed_date: string;
  study_end_date: string;
  rules_version: string;
}): Array<{
  round: number;
  label: string;
  target_date: string;
  window_start: string;
  deadline: string;
}> {
  const anchor = parseISODate(params.baseline_completed_date);
  const studyEnd = parseISODate(params.study_end_date);
  const results = [];
  let round = 1;

  while (true) {
    const target = addCalendarMonths(anchor, round * 2);
    if (target > studyEnd) {
      break;
    }
    const window_start = addDays(target, -14);
    const deadline = addDays(target, 14);

    results.push({
      round,
      label: `HRF-R${round}`,
      target_date: toISODate(target),
      window_start: toISODate(window_start),
      deadline: toISODate(deadline),
    });

    round += 1;
  }

  return results;
}

/**
 * Generate PFF task schedule from enrollment_date.
 */
export function generatePffSchedule(params: {
  enrollment_date: string;
  study_end_date: string;
  rules_version: string;
}): Array<{
  round: number;
  label: string;
  target_date: string;
  window_start: string;
  deadline: string;
}> {
  const anchor = parseISODate(params.enrollment_date);
  const studyEnd = parseISODate(params.study_end_date);
  const results = [];
  let round = 1;

  while (true) {
    const target = addCalendarMonths(anchor, round);
    if (target > studyEnd) {
      break;
    }
    const window_start = addDays(target, -7);
    const deadline = addDays(target, 14);

    results.push({
      round,
      label: `PFF-M${round}`,
      target_date: toISODate(target),
      window_start: toISODate(window_start),
      deadline: toISODate(deadline),
    });

    round += 1;
  }

  return results;
}

/**
 * NFF protocol visit labels and offsets from birth_date
 */
export function generateNffSchedule(params: {
  birth_date: string;
  study_end_date: string;
  rules_version: string;
}): Array<{
  label: string;
  target_date: string;
  window_start: string;
  deadline: string;
  sequence: number;
}> {
  const anchor = parseISODate(params.birth_date);
  const studyEnd = parseISODate(params.study_end_date);
  const results = [];

  // Protocol labels: 7d, 28d, 2m, 3m, 4.5m, 6m, 7.5m, 9m, 10.5m, 12m, 14m, 16m, then every 2m
  const offsets = [
    { days: 7, label: "7d" },
    { days: 28, label: "28d" },
    { months: 2, label: "2m" },
    { months: 3, label: "3m" },
    { days: 135, label: "4.5m" },
    { months: 6, label: "6m" },
    { days: 225, label: "7.5m" },
    { months: 9, label: "9m" },
    { days: 315, label: "10.5m" },
    { months: 12, label: "12m" },
    { months: 14, label: "14m" },
    { months: 16, label: "16m" },
  ];

  let sequence = 0;
  for (const offset of offsets) {
    sequence += 1;
    let target: Date;
    if (offset.days !== undefined) {
      target = addDays(anchor, offset.days);
    } else {
      target = addCalendarMonths(anchor, offset.months || 0);
    }

    if (target > studyEnd) {
      break;
    }

    const window_start = addDays(target, -3);
    const deadline = addDays(target, 7);

    results.push({
      label: `NFF-${offset.label}`,
      target_date: toISODate(target),
      window_start: toISODate(window_start),
      deadline: toISODate(deadline),
      sequence,
    });
  }

  // Then every 2 months from 18m onwards
  let monthOffset = 18;
  while (true) {
    sequence += 1;
    const target = addCalendarMonths(anchor, monthOffset);
    if (target > studyEnd) {
      break;
    }

    const window_start = addDays(target, -3);
    const deadline = addDays(target, 7);

    results.push({
      label: `NFF-${monthOffset}m`,
      target_date: toISODate(target),
      window_start: toISODate(window_start),
      deadline: toISODate(deadline),
      sequence,
    });

    monthOffset += 2;
  }

  return results;
}

/**
 * Generate VA task from event_date (stillbirth or child death date).
 */
export function generateVaTask(params: {
  event_date: string;
  event_type: "stillbirth" | "child_death";
  rules_version: string;
}): {
  label: string;
  target_date: string;
  window_start: string;
  deadline: string;
  form_availability: string;
  disabled_reason: string;
} {
  const eventDate = parseISODate(params.event_date);
  const target = addDays(eventDate, 30);
  const window_start = addDays(target, -3);
  const deadline = addDays(target, 14);

  return {
    label: `VA-${params.event_type}`,
    target_date: toISODate(target),
    window_start: toISODate(window_start),
    deadline: toISODate(deadline),
    form_availability: "disabled",
    disabled_reason: "va_json_pending",
  };
}
