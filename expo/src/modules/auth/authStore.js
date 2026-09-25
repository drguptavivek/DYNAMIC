import * as Application from "expo-application";
import { Platform } from "react-native";
import { getDb } from "../tasks/taskSchema.js";
import { clearSyncedTaskCache } from "../tasks/taskRepository.js";
import { clearHouseholdCacheForSync } from "../households/householdRepository.js";
import { API_BASE_URL } from "../sync/apiConfig.js";
import { clearLocalDeviceData } from "../storage/localDeviceDataReset.js";
import { formatAndroidDeviceId } from "./deviceIdentity.js";
import { describeHttpFailure, describeNetworkError } from "../../lib/networkErrors.js";

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
  if (Platform.OS === "android") {
    try {
      const androidDeviceId = formatAndroidDeviceId(Application.getAndroidId());
      if (androidDeviceId) {
        setMeta("device_id", androidDeviceId);
        return androidDeviceId;
      }
    } catch (error) {
      console.warn("Could not read Android device identity; using local fallback:", error);
    }
  }

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
    let message = `Device registration failed: ${response.statusText}`;
    try {
      const payload = await response.json();
      message = payload?.error?.message || message;
    } catch {
      // Keep the HTTP fallback when the server response is not JSON.
    }
    throw new Error(message);
  }

  return { deviceId, registration: unwrapApiData(await response.json()) };
}

async function readErrorMessage(response) {
  try {
    const payload = await response.clone().json();
    return payload?.error?.message || payload?.message || null;
  } catch {
    return null;
  }
}

export async function login(username, password) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      return { ok: false, error: describeHttpFailure(response, await readErrorMessage(response), "Login") };
    }

    const data = unwrapApiData(await response.json());
    const { access_token, refresh_token, user } = data;

    const fetchedUser = await fetchCurrentUser(access_token, user);
    const { deviceId } = await registerCurrentDevice(access_token, fetchedUser);
    // A fresh login starts from a clean device: drop all locally stored study
    // data and the previous session so only the new user's server-synced scope
    // remains after the first sync.
    await clearLocalDeviceData();
    resetSyncedCacheForLogin();
    setMeta("access_token", access_token);
    setMeta("refresh_token", refresh_token || "");
    setMeta("device_id", deviceId);
    const enrichedUser = { ...fetchedUser, device_id: deviceId };
    storeUser(enrichedUser);
    return { ok: true, user: enrichedUser };
  } catch (error) {
    console.error("Login error:", error);
    return { ok: false, error: describeNetworkError(error, { action: "Login" }) };
  }
}

export async function loginWithQrPayload(qrPayload) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/qr-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qr_payload: qrPayload }),
    });

    if (!response.ok) {
      return { ok: false, error: describeHttpFailure(response, await readErrorMessage(response), "QR login") };
    }

    const data = unwrapApiData(await response.json());
    const { access_token, refresh_token, user } = data;

    const fetchedUser = await fetchCurrentUser(access_token, user);
    const { deviceId } = await registerCurrentDevice(access_token, fetchedUser);
    // A fresh login starts from a clean device: drop all locally stored study
    // data and the previous session so only the new user's server-synced scope
    // remains after the first sync.
    await clearLocalDeviceData();
    resetSyncedCacheForLogin();
    setMeta("access_token", access_token);
    setMeta("refresh_token", refresh_token || "");
    setMeta("device_id", deviceId);
    const enrichedUser = { ...fetchedUser, device_id: deviceId };
    storeUser(enrichedUser);
    return { ok: true, user: enrichedUser };
  } catch (error) {
    console.error("QR login error:", error);
    return { ok: false, error: describeNetworkError(error, { action: "QR login" }) };
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

export async function logout() {
  try {
    await clearLocalDeviceData();
    currentUser = null;
  } catch (error) {
    console.error("Logout error:", error);
    try {
      setMeta("access_token", "");
      setMeta("refresh_token", "");
      setMeta("auth_user", "");
      currentUser = null;
    } catch (fallbackError) {
      console.error("Logout fallback error:", fallbackError);
    }
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

export async function refreshStoredSession() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return { ok: false, definitive: true };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) {
      return {
        ok: false,
        definitive: [400, 401, 403].includes(response.status),
      };
    }

    const data = unwrapApiData(await response.json());
    if (!data?.access_token) {
      return { ok: false, definitive: true };
    }
    setMeta("access_token", data.access_token);
    setMeta("refresh_token", data.refresh_token || refreshToken);
    return { ok: true, accessToken: data.access_token };
  } catch (error) {
    console.error("Session refresh failed:", error);
    return { ok: false, definitive: false };
  }
}

async function checkStoredSession(accessToken) {
  if (!accessToken) return { status: "rejected" };
  try {
    const response = await fetch(`${API_BASE_URL}/users/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    if (response.status === 401 || response.status === 403) {
      return { status: "rejected" };
    }
    if (response.ok) {
      return { status: "accepted", user: unwrapApiData(await response.json()) };
    }
    return { status: "unavailable" };
  } catch (error) {
    console.error("Session restore check failed:", error);
    return { status: "unavailable" };
  }
}

function restoreCachedUser(freshUser, restoredUser) {
  const restored = {
    ...(freshUser || restoredUser),
    device_id: restoredUser?.device_id || getOrCreateDeviceId(),
  };
  storeUser(restored);
  return restored;
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

  const accessToken = getToken();
  if (!accessToken && !getRefreshToken()) {
    return null;
  }

  let sessionCheck = await checkStoredSession(accessToken);
  if (sessionCheck.status === "rejected") {
    // Access tokens are intentionally short lived. Rotate the stored refresh
    // token before treating the saved login as invalid.
    const refreshed = await refreshStoredSession();
    if (refreshed.ok) {
      sessionCheck = await checkStoredSession(refreshed.accessToken);
    } else if (refreshed.definitive) {
      await clearLocalDeviceData();
      currentUser = null;
      return null;
    } else {
      sessionCheck = { status: "unavailable" };
    }
  }

  if (sessionCheck.status === "accepted") {
    return restoreCachedUser(sessionCheck.user, restoredUser);
  }
  if (sessionCheck.status === "rejected") {
    // A newly refreshed token was rejected, so the server has definitively
    // invalidated this session. Prevent stale rows crossing into a new login.
    await clearLocalDeviceData();
    currentUser = null;
    return null;
  }

  // Network errors and temporary server failures retain the cached offline
  // session. Local study data remains protected by the app PIN.
  if (restoredUser) {
    return restoreCachedUser(null, restoredUser);
  }
  return null;
}

export function isAuthenticated() {
  return !!getToken();
}
