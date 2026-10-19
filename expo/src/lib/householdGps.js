export const MAX_HOUSEHOLD_GPS_ACCURACY_METERS = 25;

export function readHouseholdGps(answers) {
  const latitude = answers?.hhq_gps_latitude;
  const longitude = answers?.hhq_gps_longitude;
  const accuracy_m = answers?.hhq_gps_accuracy_m;
  const captured_at = answers?.hhq_gps_captured_at;
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
      !Number.isFinite(accuracy_m) || accuracy_m < 0 || accuracy_m > MAX_HOUSEHOLD_GPS_ACCURACY_METERS ||
      typeof captured_at !== "string" || !Number.isFinite(Date.parse(captured_at))) return null;
  return { latitude, longitude, accuracy_m, captured_at };
}

export function buildHouseholdMapsUrl(gps) {
  if (!gps || !readHouseholdGps({ hhq_gps_latitude: gps.latitude, hhq_gps_longitude: gps.longitude,
    hhq_gps_accuracy_m: gps.accuracy_m, hhq_gps_captured_at: gps.captured_at })) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${gps.latitude},${gps.longitude}`;
}
