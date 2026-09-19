let activeExternalMediaOperations = 0;

export function beginAppLockMediaActivity() {
  activeExternalMediaOperations += 1;
}

export function endAppLockMediaActivity() {
  activeExternalMediaOperations = Math.max(0, activeExternalMediaOperations - 1);
}

export function isAppLockMediaActivityActive() {
  return activeExternalMediaOperations > 0;
}

export function resetAppLockMediaActivityForTests() {
  activeExternalMediaOperations = 0;
}
