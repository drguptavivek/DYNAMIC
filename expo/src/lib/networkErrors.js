/**
 * Turns raw fetch/Java networking exceptions into messages a field worker can
 * act on. Raw text such as
 * "fetch failed: java.net.UnknownServiceException: CLEARTEXT communication to
 * localhost not permitted by network security policy" is replaced by a plain
 * statement of what is wrong and what to do.
 */
import { API_BASE_URL } from "../modules/sync/apiConfig.js";

function hostOf(url) {
  try {
    return new URL(String(url)).host;
  } catch {
    return String(url || "");
  }
}

function isLocalHost(host) {
  const bare = String(host || "").split(":")[0].toLowerCase();
  return bare === "localhost" || bare === "127.0.0.1" || bare === "10.0.2.2" || bare === "::1";
}

const NETWORK_PATTERNS = [
  /network request failed/i,
  /fetch failed/i,
  /failed to fetch/i,
  /UnknownServiceException/i,
  /UnknownHostException/i,
  /ConnectException/i,
  /SocketTimeoutException/i,
  /SSLHandshakeException/i,
  /CLEARTEXT/i,
  /ECONNREFUSED/i,
  /ECONNRESET/i,
  /ENOTFOUND/i,
  /EAI_AGAIN/i,
  /ETIMEDOUT/i,
  /timed? ?out/i,
  /Unable to resolve host/i,
  /software caused connection abort/i,
];

export function isNetworkError(error) {
  const message = String(error?.message || error || "");
  return NETWORK_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * @param {unknown} error  the thrown error
 * @param {{ action?: string, apiBaseUrl?: string }} options
 *   action: what was being attempted ("Login", "Sync"), used as the prefix
 *   for non-network errors.
 */
export function describeNetworkError(error, { action = "Request", apiBaseUrl = API_BASE_URL } = {}) {
  const raw = String(error?.message || error || "").trim();
  const host = hostOf(apiBaseUrl);
  const scheme = String(apiBaseUrl || "").split(":")[0].toLowerCase();

  if (!isNetworkError(error)) {
    return raw ? `${action} failed: ${raw}` : `${action} failed.`;
  }

  if (isLocalHost(host)) {
    return (
      `${action} failed: this app build is pointed at ${host}, which is the phone itself, not the study server. ` +
      "Install the build configured for the study server."
    );
  }
  if (/CLEARTEXT|UnknownServiceException/i.test(raw) || scheme === "http") {
    return (
      `${action} failed: the app is set to an insecure address (${apiBaseUrl}). ` +
      "Install the build configured for the study server (https)."
    );
  }
  if (/SSLHandshakeException|certificate/i.test(raw)) {
    return (
      `${action} failed: secure connection to ${host} could not be established. ` +
      "Check the phone's date and time, then try again."
    );
  }
  if (/UnknownHostException|ENOTFOUND|EAI_AGAIN|Unable to resolve host/i.test(raw)) {
    return (
      `${action} failed: cannot find the server ${host}. ` +
      "Check that mobile data or Wi-Fi is on and try again."
    );
  }
  if (/timed? ?out|SocketTimeoutException|ETIMEDOUT/i.test(raw)) {
    return (
      `${action} failed: the server ${host} took too long to respond. ` +
      "Check the signal strength and try again."
    );
  }
  return (
    `${action} failed: cannot reach the server ${host}. ` +
    "Check that mobile data or Wi-Fi is on and try again."
  );
}

/**
 * Message for a non-2xx HTTP response. Android's fetch often reports an empty
 * statusText, so fall back to the status code and the server's own message.
 */
export function describeHttpFailure(response, payloadMessage, action = "Request") {
  const status = Number(response?.status);
  const statusText = String(response?.statusText || "").trim();
  if (payloadMessage) return `${action} failed: ${payloadMessage}`;
  if (status === 401 || status === 403) return `${action} failed: the username or password was not accepted.`;
  if (status >= 500) return `${action} failed: the server reported an error (HTTP ${status}). Try again shortly.`;
  if (Number.isFinite(status) && status > 0) {
    return `${action} failed (HTTP ${status}${statusText ? ` ${statusText}` : ""}).`;
  }
  return `${action} failed.`;
}
