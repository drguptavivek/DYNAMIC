/** Pure helpers for the PEF Q11 ultrasound-report attachment value. */
export const PEF_ULTRASOUND_AVAILABLE_FIELD = "pef_first_ultrasound_report";
export const PEF_ULTRASOUND_REPORTS_FIELD = "pef_ultrasound_reports";
export const PEF_ULTRASOUND_REPORTS_MAX = 5;
export const PEF_ULTRASOUND_IMAGES_PER_REPORT_MAX = 2;

export function isValidUltrasoundDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizePefUltrasoundReports(value) {
  const count = Number.parseInt(value?.report_count, 10);
  return {
    report_count: Number.isFinite(count) ? count : 0,
    reports: Array.isArray(value?.reports)
      ? value.reports.filter(Boolean).map((report) => {
          const legacyImage = report?.attachment_id ? [{
            attachment_id: report.attachment_id,
            local_uri: report.local_uri || "",
            original_name: report.original_name || null,
            mime_type: report.mime_type || null,
            file_size: report.file_size ?? null,
          }] : [];
          return {
            report_id: report.report_id || report.attachment_id || null,
            ultrasound_date: report.ultrasound_date || "",
            images: (Array.isArray(report.images) ? report.images : legacyImage).filter(Boolean),
          };
        })
      : [],
  };
}

export function validatePefUltrasoundReports(value) {
  const normalized = normalizePefUltrasoundReports(value);
  if (normalized.report_count < 1 || normalized.report_count > PEF_ULTRASOUND_REPORTS_MAX) {
    return `Enter a report count from 1 to ${PEF_ULTRASOUND_REPORTS_MAX}.`;
  }
  if (normalized.reports.length !== normalized.report_count) {
    return `Add all ${normalized.report_count} ultrasound reports.`;
  }
  for (let index = 0; index < normalized.reports.length; index += 1) {
    const report = normalized.reports[index];
    if (!isValidUltrasoundDate(report?.ultrasound_date)) {
      return `Select a valid ultrasound date for report ${index + 1}.`;
    }
    if (report.images.length < 1 || report.images.length > PEF_ULTRASOUND_IMAGES_PER_REPORT_MAX) {
      return `Add one or two images for report ${index + 1}.`;
    }
    for (let imageIndex = 0; imageIndex < report.images.length; imageIndex += 1) {
      const image = report.images[imageIndex];
      if (!String(image?.local_uri || "").trim()) {
        return `Add image ${imageIndex + 1} for report ${index + 1}.`;
      }
      if (!String(image?.mime_type || "").startsWith("image/")) {
        return `Image ${imageIndex + 1} for report ${index + 1} must come from the camera or gallery.`;
      }
    }
  }
  return null;
}

export function sanitizePefUltrasoundReports(value) {
  const normalized = normalizePefUltrasoundReports(value);
  return {
    report_count: normalized.report_count,
    reports: normalized.reports.map((report, index) => ({
      report_id: report.report_id,
      report_sequence: index + 1,
      ultrasound_date: String(report.ultrasound_date || "").trim(),
      images: report.images.map((image, imageIndex) => ({
        attachment_id: image.attachment_id,
        image_sequence: imageIndex + 1,
        original_name: image.original_name || null,
        mime_type: image.mime_type || "image/jpeg",
        file_size: Number.isFinite(Number(image.file_size)) ? Number(image.file_size) : null,
      })),
    })),
  };
}
