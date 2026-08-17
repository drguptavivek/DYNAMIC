const DEVICE_ID_PREFIX = "dynamic-field-android";

export function formatAndroidDeviceId(androidId) {
  const normalized = String(androidId || "").trim().toLowerCase();
  return normalized ? `${DEVICE_ID_PREFIX}-${normalized}` : null;
}
