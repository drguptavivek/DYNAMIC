/** Pure helpers for the PEF Q11 ultrasound-report attachment value. */
export const PEF_ULTRASOUND_AVAILABLE_FIELD = "pef_first_ultrasound_report";
export const PEF_ULTRASOUND_REPORTS_FIELD = "pef_ultrasound_reports";
export const PEF_ULTRASOUND_REPORTS_MAX = 5;

export function normalizePefUltrasoundReports(value) {
  const count = Number.parseInt(value?.report_count, 10);
  return {
    report_count: Number.isFinite(count) ? count : 0,
    reports: Array.isArray(value?.reports) ? value.reports.filter(Boolean) : [],
  };
}

export function validatePefUltrasoundReports(value) {
  const normalized = normalizePefUltrasoundReports(value);
  if (normalized.report_count < 1 || normalized.report_count > PEF_ULTRASOUND_REPORTS_MAX) {
    return `Enter a report count from 1 to ${PEF_ULTRASOUND_REPORTS_MAX}.`;
  }
  if (normalized.reports.length !== normalized.report_count) {
    return `Add all ${normalized.report_count} ultrasound report images.`;
  }
  for (let index = 0; index < normalized.reports.length; index += 1) {
    const report = normalized.reports[index];
    if (!String(report?.report_name || "").trim()) {
      return `Enter the file name for report ${index + 1}.`;
    }
    if (!String(report?.local_uri || "").trim()) {
      return `Add an image for report ${index + 1}.`;
    }
    if (!String(report?.mime_type || "").startsWith("image/")) {
      return `Report ${index + 1} must be a camera or gallery image.`;
    }
  }
  return null;
}

export function sanitizePefUltrasoundReports(value) {
  const normalized = normalizePefUltrasoundReports(value);
  return {
    report_count: normalized.report_count,
    reports: normalized.reports.map((report, index) => ({
      attachment_id: report.attachment_id,
      report_sequence: index + 1,
      report_name: String(report.report_name || "").trim(),
      original_name: report.original_name || null,
      mime_type: report.mime_type || "image/jpeg",
      file_size: Number.isFinite(Number(report.file_size)) ? Number(report.file_size) : null,
    })),
  };
}
