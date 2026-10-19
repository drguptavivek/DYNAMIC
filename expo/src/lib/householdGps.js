export const MAX_HOUSEHOLD_GPS_ACCURACY_METERS = 25;

export function readHouseholdGps(answers) {
  const latitude = answers?.hhq_gps_latitude;
  const longitude = answers?.hhq_gps_longitude;
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export function buildHouseholdMapsUrl(gps) {
  if (!gps || !readHouseholdGps({ hhq_gps_latitude: gps.latitude, hhq_gps_longitude: gps.longitude })) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${gps.latitude},${gps.longitude}`;
}
