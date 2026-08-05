import { getDb } from "../tasks/taskSchema.js";
import { clearSyncedTaskCache } from "../tasks/taskRepository.js";
import { clearHouseholdCacheForSync } from "../households/householdRepository.js";
import { API_BASE_URL } from "../sync/apiConfig.js";

let currentUser = null;
const DEVICE_ID_PREFIX = "dynamic-field-device";

function unwrapApiData(payload) {
  return payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
}

function getMeta(key) {
  const db = getDb();
  try {
    const row = db.getFirstSync("SELECT value FROM sync_meta WHERE key = ?", [key]);
    return row?.value || null;
  } catch (error) {
    console.error("Error getting meta:", error);
    return null;
  }
}

function setMeta(key, value) {
  const db = getDb();
  try {
    db.runSync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", [key, value]);
  } catch (error) {
    console.error("Error setting meta:", error);
    throw error;
  }
}

function resetSyncedCacheForLogin() {
  clearSyncedTaskCache();
  clearHouseholdCacheForSync();
  setMeta("assigned_localities", "");
  setMeta("last_sync_at", "");
  setMeta("sync_clock_metadata", "");
  setMeta("sync_clock_checked_at_utc", "");
  setMeta("sync_clock_server_time_utc", "");
  setMeta("sync_clock_device_time_utc", "");
  setMeta("sync_clock_delta_ms", "");
  setMeta("sync_clock_status", "");
}

function createLocalUuid() {
  const randomUuid =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
          (
            Number(char) ^
            ((Math.random() * 16) >> (Number(char) / 4))
          ).toString(16),
        );
  return `${DEVICE_ID_PREFIX}-${randomUuid}`;
}

function getOrCreateDeviceId() {
  const existing = getMeta("device_id");
  if (existing) return existing;
  const deviceId = createLocalUuid();
  setMeta("device_id", deviceId);
  return deviceId;
}

async function registerCurrentDevice(accessToken, user) {
  const deviceId = getOrCreateDeviceId();
  const deviceName = [
    "DYNAMIC Field App",
    user?.username ? `(${user.username})` : "",
  ].filter(Boolean).join(" ");

  const response = await fetch(`${API_BASE_URL}/devices/register`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      device_id: deviceId,
      device_name: deviceName,
    }),
  });

  if (!response.ok) {
    throw new Error(`Device registration failed: ${response.statusText}`);
  }

  return { deviceId, registration: unwrapApiData(await response.json()) };
}

export async function login(username, password) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      return { ok: false, error: `Login failed: ${response.statusText}` };
    }

    const data = unwrapApiData(await response.json());
    const { access_token, refresh_token, user } = data;

    setMeta("access_token", access_token);
    if (refresh_token) {
      setMeta("refresh_token", refresh_token);
    }
    const fetchedUser = await fetchCurrentUser(access_token, user);
    const { deviceId } = await registerCurrentDevice(access_token, fetchedUser);
    resetSyncedCacheForLogin();
    setMeta("device_id", deviceId);
    const enrichedUser = { ...fetchedUser, device_id: deviceId };
    storeUser(enrichedUser);
    return { ok: true, user: enrichedUser };
  } catch (error) {
    console.error("Login error:", error);
    return { ok: false, error: error.message };
  }
}

export function storeUser(user) {
  setMeta("auth_user", JSON.stringify(user));
  currentUser = user;
}

export async function fetchCurrentUser(token = getToken(), fallbackUser = null) {
  if (!token) return fallbackUser;
  try {
    const response = await fetch(`${API_BASE_URL}/users/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      return fallbackUser;
    }
    return unwrapApiData(await response.json());
  } catch (error) {
    console.error("Fetch current user error:", error);
    return fallbackUser;
  }
}

export function logout() {
  try {
    setMeta("access_token", "");
    setMeta("refresh_token", "");
    setMeta("auth_user", "");
    currentUser = null;
  } catch (error) {
    console.error("Logout error:", error);
  }
}

export function getToken() {
  return getMeta("access_token");
}

export function getRefreshToken() {
  return getMeta("refresh_token");
}

export function getUser() {
  if (currentUser) {
    return currentUser;
  }

  const userJson = getMeta("auth_user");
  if (userJson) {
    try {
      currentUser = JSON.parse(userJson);
      return currentUser;
    } catch (e) {
      console.error("Error parsing stored user:", e);
      return null;
    }
  }
  return null;
}

export async function restoreSession() {
  let restoredUser = null;
  const userJson = getMeta("auth_user");
  if (userJson) {
    try {
      restoredUser = JSON.parse(userJson);
    } catch (e) {
      console.error("Error restoring session:", e);
      return null;
    }
  }

  if (!getToken()) {
    return null;
  }

  const freshUser = await fetchCurrentUser(getToken(), restoredUser);
  if (freshUser) {
    storeUser(freshUser);
  }
  return freshUser;
}

export function isAuthenticated() {
  return !!getToken();
}
