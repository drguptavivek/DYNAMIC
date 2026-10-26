import { readHouseholdGps, MAX_HOUSEHOLD_GPS_ACCURACY_METERS } from "./householdGps.js";
import { beginAppLockMediaActivity, endAppLockMediaActivity } from "../modules/auth/appLockMediaActivity.js";

/** A fresh GPS watch works offline; only an acceptable fix completes capture. */
export function startHouseholdGpsCapture(location, { now = Date.now, schedule = setTimeout,
  unschedule = clearTimeout, onWaiting = () => {}, onRequestingPermission = () => {} } = {}) {
  let finished = false;
  let subscription;
  let resolveResult;
  let rejectResult;
  let permissionPromptActive = false;
  let servicesTimer;
  const started = now();
  const promise = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  function endPermissionPrompt() {
    if (!permissionPromptActive) return;
    permissionPromptActive = false;
    endAppLockMediaActivity();
  }
  function finish(code, gps) {
    if (finished) return;
    finished = true;
    endPermissionPrompt();
    unschedule(timer);
    if (servicesTimer !== undefined) unschedule(servicesTimer);
    subscription?.remove();
    if (code) rejectResult(new Error(code));
    else resolveResult(gps);
  }
  const timer = schedule(() => finish("gps_timeout"), 60000);
  async function checkServices() {
    const enabled = await location.hasServicesEnabledAsync();
    if (finished) return;
    if (!enabled) return finish("gps_services_disabled");
    servicesTimer = schedule(() => checkServices().catch(() => finish("gps_capture_failed")), 2000);
  }
  (async () => {
    const enabled = await location.hasServicesEnabledAsync();
    if (finished) return;
    if (!enabled) return finish("gps_services_disabled");
    onRequestingPermission();
    // Android's location permission dialog can temporarily background the app.
    beginAppLockMediaActivity();
    permissionPromptActive = true;
    let permission;
    try {
      permission = await location.requestForegroundPermissionsAsync();
    } finally {
      endPermissionPrompt();
    }
    if (finished) return;
    if (!permission.granted) return finish("location_permission_was_not_granted");
    if (permission.android?.accuracy === "coarse") return finish("gps_precise_location_required");
    const stillEnabled = await location.hasServicesEnabledAsync();
    if (finished) return;
    if (!stillEnabled) return finish("gps_services_disabled");
    onWaiting();
    servicesTimer = schedule(() => checkServices().catch(() => finish("gps_capture_failed")), 2000);
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
