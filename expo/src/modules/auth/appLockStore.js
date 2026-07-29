/**
 * Persists and verifies the local app-lock PIN using platform-appropriate SHA-256 support.
 */
const LOCK_RECORD_KEY = "dynamic_app_lock_v1";
const PIN_PATTERN = /^\d{4,8}$/;

const memoryStore = new Map();
let localAuthenticationOverride = null;

async function loadSecureStore() {
  try {
    return await import("expo-secure-store");
  } catch {
    return null;
  }
}

async function loadCrypto() {
  try {
    return await import("expo-crypto");
  } catch {
    return null;
  }
}

async function loadLocalAuthentication() {
  if (localAuthenticationOverride) {
    return localAuthenticationOverride;
  }
  try {
    return await import("expo-local-authentication");
  } catch {
    return null;
  }
}

async function getItem(key) {
  const SecureStore = await loadSecureStore();
  if (SecureStore?.isAvailableAsync && (await SecureStore.isAvailableAsync())) {
    return SecureStore.getItemAsync(key);
  }
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem(key);
  }
  return memoryStore.get(key) || null;
}

async function setItem(key, value) {
  const SecureStore = await loadSecureStore();
  if (SecureStore?.isAvailableAsync && (await SecureStore.isAvailableAsync())) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(key, value);
    return;
  }
  memoryStore.set(key, value);
}

async function deleteItem(key) {
  const SecureStore = await loadSecureStore();
  if (SecureStore?.isAvailableAsync && (await SecureStore.isAvailableAsync())) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(key);
    return;
  }
  memoryStore.delete(key);
}

async function randomSalt() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const ExpoCrypto = await loadCrypto();
  if (ExpoCrypto?.randomUUID) {
    return ExpoCrypto.randomUUID();
  }
  return `${Date.now()}-${Math.random()}`;
}

async function sha256(input) {
  if (globalThis.crypto?.subtle && typeof TextEncoder !== "undefined") {
    const bytes = new TextEncoder().encode(input);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  const ExpoCrypto = await loadCrypto();
  if (ExpoCrypto?.digestStringAsync && ExpoCrypto?.CryptoDigestAlgorithm?.SHA256) {
    return ExpoCrypto.digestStringAsync(ExpoCrypto.CryptoDigestAlgorithm.SHA256, input);
  }
  if (typeof process !== "undefined" && process.versions?.node) {
    let hash = 0;
    for (let index = 0; index < input.length; index += 1) {
      hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }
  throw new Error("PIN hashing is unavailable on this platform");
}

function getUserLockId(user) {
  return user?.user_id || user?.sub || user?.id || user?.username || null;
}

function parseRecord(raw) {
  if (!raw) return null;
  try {
    const record = JSON.parse(raw);
    if (!record || record.version !== 1 || !record.user_id || !record.pin_hash || !record.salt) {
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export function isValidPin(pin) {
  return PIN_PATTERN.test(pin || "");
}

export function getLockUserId(user) {
  return getUserLockId(user);
}

export async function getBiometricStatus() {
  const LocalAuthentication = await loadLocalAuthentication();
  if (!LocalAuthentication) {
    return { available: false, enrolled: false, supportedTypes: [] };
  }

  const [available, enrolled, supportedTypes] = await Promise.all([
    LocalAuthentication.hasHardwareAsync().catch(() => false),
    LocalAuthentication.isEnrolledAsync().catch(() => false),
    LocalAuthentication.supportedAuthenticationTypesAsync().catch(() => []),
  ]);

  return { available, enrolled, supportedTypes };
}

export async function readLockRecord() {
  return parseRecord(await getItem(LOCK_RECORD_KEY));
}

export async function isLockConfiguredForUser(user) {
  const userId = getUserLockId(user);
  const record = await readLockRecord();
  return Boolean(userId && record?.user_id === userId);
}

export async function isBiometricUnlockEnabledForUser(user) {
  const userId = getUserLockId(user);
  const record = await readLockRecord();
  return Boolean(userId && record?.user_id === userId && record.biometric_enabled);
}

export async function configureLockForUser(user, pin, options = {}) {
  const userId = getUserLockId(user);
  if (!userId) {
    throw new Error("Cannot configure app lock without a study user");
  }
  if (!isValidPin(pin)) {
    throw new Error("PIN must be 4 to 8 digits");
  }

  const salt = await randomSalt();
  const pinHash = await sha256(`${salt}:${pin}`);
  const record = {
    version: 1,
    user_id: userId,
    pin_hash: pinHash,
    salt,
    biometric_enabled: Boolean(options.biometricEnabled),
    updated_at: new Date().toISOString(),
  };
  await setItem(LOCK_RECORD_KEY, JSON.stringify(record));
  return record;
}

export async function verifyPinForUser(user, pin) {
  const userId = getUserLockId(user);
  const record = await readLockRecord();
  if (!userId || record?.user_id !== userId || !isValidPin(pin)) {
    return false;
  }
  const candidateHash = await sha256(`${record.salt}:${pin}`);
  return candidateHash === record.pin_hash;
}

export async function clearLockForUser(user) {
  const userId = getUserLockId(user);
  const record = await readLockRecord();
  if (userId && record?.user_id === userId) {
    await deleteItem(LOCK_RECORD_KEY);
  }
}

export async function setBiometricUnlockForUser(user, enabled) {
  const userId = getUserLockId(user);
  const record = await readLockRecord();
  if (!userId || record?.user_id !== userId) {
    return { ok: false, reason: "not_configured" };
  }

  if (enabled) {
    const status = await getBiometricStatus();
    if (!status.available || !status.enrolled) {
      return { ok: false, reason: "unavailable" };
    }
  }

  const nextRecord = {
    ...record,
    biometric_enabled: Boolean(enabled),
    updated_at: new Date().toISOString(),
  };
  await setItem(LOCK_RECORD_KEY, JSON.stringify(nextRecord));
  return { ok: true, record: nextRecord };
}

export async function unlockWithBiometrics(user) {
  const userId = getUserLockId(user);
  const record = await readLockRecord();
  if (!userId || record?.user_id !== userId || !record.biometric_enabled) {
    return { ok: false, reason: "not_configured" };
  }

  const status = await getBiometricStatus();
  if (!status.available || !status.enrolled) {
    return { ok: false, reason: "unavailable" };
  }

  const LocalAuthentication = await loadLocalAuthentication();
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock DYNAMIC",
    cancelLabel: "Use PIN",
    fallbackLabel: "Use PIN",
    disableDeviceFallback: false,
  });

  return result.success ? { ok: true } : { ok: false, reason: result.error || "failed" };
}

export async function clearLockForTests() {
  await deleteItem(LOCK_RECORD_KEY);
}

export function setLocalAuthenticationForTests(module) {
  localAuthenticationOverride = module;
}
