/** Derives PSF tracking disposition fields without creating workflow tasks. */

export const PSF_ADDRESS_STATUS_FIELD = "psf_same_address_status";
export const PSF_MARITAL_STATUS_FIELD = "psf_current_marital_status";
export const PSF_STERILIZATION_STATUS_FIELD = "psf_sterilization_status";
export const PSF_HYSTERECTOMY_STATUS_FIELD = "psf_hysterectomy_status";
export const PSF_PREGNANT_NOW_FIELD = "psf_pregnant_now";
export const PSF_LMP_FIELD = "psf_last_menstrual_period";
export const PSF_TRACKING_DISPOSITION_FIELD = "psf_tracking_disposition";
export const PSF_STOP_REASON_FIELD = "psf_stop_reason";
export const PSF_PREGNANCY_DETECTED_FIELD = "psf_pregnancy_detected";

const SOURCE_FIELDS = new Set([
  PSF_ADDRESS_STATUS_FIELD,
  PSF_MARITAL_STATUS_FIELD,
  PSF_STERILIZATION_STATUS_FIELD,
  PSF_HYSTERECTOMY_STATUS_FIELD,
  PSF_PREGNANT_NOW_FIELD,
  PSF_LMP_FIELD,
]);

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function calculatePsfTrackingDisposition(answers = {}) {
  const addressStatus = numberOrNull(answers[PSF_ADDRESS_STATUS_FIELD]);
  if (addressStatus === 3) {
    return { disposition: "stopped", stopReason: "shifted_outside_study_area" };
  }

  const maritalStatus = numberOrNull(answers[PSF_MARITAL_STATUS_FIELD]);
  if ([3, 4, 5, 6].includes(maritalStatus)) {
    return { disposition: "stopped", stopReason: "marital_status" };
  }

  const sterilizationStatus = numberOrNull(answers[PSF_STERILIZATION_STATUS_FIELD]);
  if ([1, 2, 3].includes(sterilizationStatus)) {
    return { disposition: "stopped", stopReason: "sterilized" };
  }

  const hysterectomyStatus = numberOrNull(answers[PSF_HYSTERECTOMY_STATUS_FIELD]);
  if (hysterectomyStatus === 1) {
    return { disposition: "stopped", stopReason: "hysterectomy" };
  }

  const lmp = numberOrNull(answers[PSF_LMP_FIELD]);
  if (lmp === 993) {
    return { disposition: "stopped", stopReason: "hysterectomy" };
  }
  if (lmp === 994) {
    return { disposition: "stopped", stopReason: "menopause" };
  }

  return { disposition: "active", stopReason: undefined };
}

function setValueIfChanged(model, name, value) {
  if (model.getValue(name) === value) return;
  model.setValue(name, value);
}

export function applyPregnancySurveillanceCalculations(model) {
  if (!model?.getQuestionByName?.(PSF_TRACKING_DISPOSITION_FIELD)) return;
  const answers = model.data || {};
  const result = calculatePsfTrackingDisposition(answers);
  setValueIfChanged(model, PSF_TRACKING_DISPOSITION_FIELD, result.disposition);
  setValueIfChanged(model, PSF_STOP_REASON_FIELD, result.stopReason);
  setValueIfChanged(
    model,
    PSF_PREGNANCY_DETECTED_FIELD,
    numberOrNull(answers[PSF_PREGNANT_NOW_FIELD]) === null
      ? undefined
      : numberOrNull(answers[PSF_PREGNANT_NOW_FIELD]) === 1
        ? 1
        : 2,
  );
  for (const fieldName of [
    PSF_TRACKING_DISPOSITION_FIELD,
    PSF_STOP_REASON_FIELD,
    PSF_PREGNANCY_DETECTED_FIELD,
  ]) {
    const question = model.getQuestionByName(fieldName);
    if (question) question.readOnly = true;
  }
}

export function shouldRecalculatePregnancySurveillance(fieldName) {
  return SOURCE_FIELDS.has(fieldName);
}
