const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

function getToken(): string | null {
  return localStorage.getItem("access_token");
}

/**
 * Clears the stored admin session and returns to the login page when the API
 * rejects the access token (401). Login requests themselves are excluded so a
 * wrong password still renders the inline error instead of reloading the page.
 */
function handleRejectedSession(path: string, res: Response) {
  if (res.status !== 401 || path.startsWith("/auth/")) return;
  localStorage.removeItem("access_token");
  localStorage.removeItem("user");
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

type ApiErrorIssue = {
  path?: Array<string | number>;
  message?: string;
};

function formatApiError(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;

  const error = (json as { error?: unknown }).error;
  if (!error || typeof error !== "object") return fallback;

  const message = (error as { message?: unknown }).message;
  const details = (error as { details?: unknown }).details;
  const errors = details && typeof details === "object"
    ? (details as { errors?: unknown }).errors
    : undefined;

  if (Array.isArray(errors) && errors.length > 0) {
    const formatted = errors
      .map((issue: ApiErrorIssue) => {
        const path = Array.isArray(issue.path) ? issue.path.join(".") : "";
        return path && issue.message ? `${path}: ${issue.message}` : issue.message;
      })
      .filter(Boolean);

    if (formatted.length > 0) return formatted.slice(0, 3).join("; ");
  }

  return typeof message === "string" && message ? message : fallback;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  handleRejectedSession(path, res);

  const json = await res.json();
  if (!res.ok) throw new Error(formatApiError(json, `HTTP ${res.status}`));
  return json.data as T;
}

export async function apiFetchPage<T>(
  path: string,
): Promise<{ data: T; meta: { total: number; page: number; per_page: number } }> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  handleRejectedSession(path, res);
  const json = await res.json();
  if (!res.ok) throw new Error(formatApiError(json, `HTTP ${res.status}`));
  return { data: json.data as T, meta: json.meta };
}
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  handleRejectedSession(path, res);

  const json = await res.json();
  if (!res.ok) throw new Error(formatApiError(json, `HTTP ${res.status}`));
  return json.data as T;
}

export async function apiDownload(path: string): Promise<Blob> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  handleRejectedSession(path, res);

  if (!res.ok) {
    const json = await res.json().catch(() => undefined);
    throw new Error(formatApiError(json, `HTTP ${res.status}`));
  }
  return res.blob();
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  getPage: <T>(path: string) => apiFetchPage<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: "DELETE",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  upload: <T>(path: string, formData: FormData) => apiUpload<T>(path, formData),
  download: (path: string) => apiDownload(path),
};
