import { getDb } from "../tasks/taskSchema.js";

let currentUser = null;
const API_BASE_URL = "http://localhost:3000/api/v1";

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
    setMeta("auth_user", JSON.stringify(user));

    currentUser = user;
    return { ok: true, user };
  } catch (error) {
    console.error("Login error:", error);
    return { ok: false, error: error.message };
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
  const userJson = getMeta("auth_user");
  if (userJson) {
    try {
      currentUser = JSON.parse(userJson);
      return currentUser;
    } catch (e) {
      console.error("Error restoring session:", e);
      return null;
    }
  }
  return null;
}

export function isAuthenticated() {
  return !!getToken();
}
