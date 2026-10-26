let activeExternalMediaOperations = 0;
let activeImagePickers = 0;
let imagePickerDeadline = 0;
let imagePickerReturnDeadline = 0;
let imagePickerBackgroundObserved = false;
let imagePickerReturnedToForeground = false;
const activityListeners = new Set();

const PERMISSION_GRACE_MS = 60 * 1000;
const IMAGE_PICKER_GRACE_MS = 10 * 60 * 1000;
const IMAGE_PICKER_RETURN_GRACE_MS = 2 * 1000;

export function beginAppLockMediaActivity(kind) {
  if (kind === "image-picker") {
    if (activeImagePickers === 0) {
      imagePickerDeadline = Date.now() + IMAGE_PICKER_GRACE_MS;
      imagePickerBackgroundObserved = false;
      imagePickerReturnedToForeground = false;
    }
    activeImagePickers += 1;
    imagePickerReturnDeadline = 0;
    notifyActivityListeners();
    return;
  }
  activeExternalMediaOperations += 1;
  notifyActivityListeners();
}

export function endAppLockMediaActivity(kind) {
  if (kind === "image-picker") {
    if (activeImagePickers > 0) {
      activeImagePickers -= 1;
      // Android can settle the picker promise before dispatching its foreground event.
      imagePickerReturnDeadline = imagePickerReturnedToForeground ? 0 : Date.now() + IMAGE_PICKER_RETURN_GRACE_MS;
    }
    notifyActivityListeners();
    return;
  }
  activeExternalMediaOperations = Math.max(0, activeExternalMediaOperations - 1);
  notifyActivityListeners();
}

export function clearAppLockMediaActivityReturnGrace() {
  imagePickerReturnDeadline = 0;
  if (imagePickerBackgroundObserved) imagePickerReturnedToForeground = true;
}

export function markAppLockMediaActivityBackground() {
  if (activeImagePickers > 0) {
    imagePickerBackgroundObserved = true;
    imagePickerReturnedToForeground = false;
  }
}

function notifyActivityListeners() {
  for (const listener of activityListeners) listener();
}

export function subscribeAppLockMediaActivity(listener) {
  activityListeners.add(listener);
  return () => activityListeners.delete(listener);
}

export function getAppLockMediaActivityGraceMs() {
  const now = Date.now();
  return Math.max(
    activeExternalMediaOperations > 0 ? PERMISSION_GRACE_MS : 0,
    activeImagePickers > 0 ? imagePickerDeadline - now : 0,
    imagePickerReturnDeadline - now,
    0,
  );
}

export function isAppLockMediaActivityActive() {
  return getAppLockMediaActivityGraceMs() > 0;
}

export function resetAppLockMediaActivityForTests() {
  activeExternalMediaOperations = 0;
  activeImagePickers = 0;
  imagePickerDeadline = 0;
  imagePickerReturnDeadline = 0;
  imagePickerBackgroundObserved = false;
  imagePickerReturnedToForeground = false;
}
