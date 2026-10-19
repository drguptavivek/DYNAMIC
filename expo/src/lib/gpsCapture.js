import { readHouseholdGps, MAX_HOUSEHOLD_GPS_ACCURACY_METERS } from "./householdGps.js";

/** A fresh GPS watch works offline; only an acceptable fix completes capture. */
export function startHouseholdGpsCapture(location, { now = Date.now, schedule = setTimeout,
  unschedule = clearTimeout, onWaiting = () => {} } = {}) {
  let finished = false;
  let subscription;
  let resolveResult;
  let rejectResult;
  const started = now();
  const promise = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  function finish(code, gps) {
    if (finished) return;
    finished = true;
    unschedule(timer);
    subscription?.remove();
    if (code) rejectResult(new Error(code));
    else resolveResult(gps);
  }
  const timer = schedule(() => finish("gps_timeout"), 60000);
  (async () => {
    const permission = await location.requestForegroundPermissionsAsync();
    if (finished) return;
    if (!permission.granted) return finish("location_permission_was_not_granted");
    const enabled = await location.hasServicesEnabledAsync();
    if (finished) return;
    if (!enabled) return finish("gps_services_disabled");
    onWaiting();
    const watch = await location.watchPositionAsync({ accuracy: location.Accuracy.BestForNavigation,
      timeInterval: 1000, distanceInterval: 0, mayShowUserSettingsDialog: false }, (position) => {
      if (finished || !Number.isFinite(position?.timestamp) || position.timestamp < started - 1000 ||
          position.timestamp < now() - 10000 || position.timestamp > now() + 1000) return;
      const accuracy = position.coords?.accuracy;
      if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > MAX_HOUSEHOLD_GPS_ACCURACY_METERS) return;
      const gps = readHouseholdGps({ hhq_gps_latitude: position.coords?.latitude,
        hhq_gps_longitude: position.coords?.longitude });
      if (gps) finish(null, gps);
    }, () => finish("gps_capture_failed"));
    if (finished) watch.remove();
    else subscription = watch;
  })().catch(() => finish("gps_capture_failed"));
  return { promise, cancel: () => finish("gps_capture_cancelled") };
}
