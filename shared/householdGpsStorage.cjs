function stripHouseholdGpsMetadata(value) {
  if (typeof value === "string") {
    try {
      return JSON.stringify(stripObject(JSON.parse(value)));
    } catch {
      return value;
    }
  }
  return stripObject(value);
}

function stripObject(value) {
  if (Array.isArray(value)) return value.map(stripObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "hhq_gps_accuracy_m" && key !== "hhq_gps_captured_at")
    .map(([key, item]) => [key, stripObject(item)]));
}

module.exports = { stripHouseholdGpsMetadata };
