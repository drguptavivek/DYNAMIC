/**
 * Small per-device key/value store for user preferences. Uses SecureStore on
 * native, localStorage on web, and memory as a last resort (tests). Values
 * here are NOT part of the study data and survive local data resets.
 */
const memoryStore = new Map();

async function loadSecureStore() {
  try {
    return await import("expo-secure-store");
  } catch {
    return null;
  }
}

export async function getDeviceValue(key) {
  const SecureStore = await loadSecureStore();
  if (SecureStore?.isAvailableAsync && (await SecureStore.isAvailableAsync())) {
    return SecureStore.getItemAsync(key);
  }
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem(key);
  }
  return memoryStore.get(key) ?? null;
}

export async function setDeviceValue(key, value) {
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

export async function deleteDeviceValue(key) {
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
