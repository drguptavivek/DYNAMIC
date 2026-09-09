/** Verifies raw networking exceptions become actionable field-worker messages. */
import assert from "node:assert/strict";

const { describeNetworkError, describeHttpFailure, isNetworkError } = await import(
  "../lib/networkErrors.js"
);

const PROD = "https://api.example.org/api/v1";

// The exact error seen on the device with a localhost build.
const cleartext = new Error(
  "fetch failed: java.net.UnknownServiceException: CLEARTEXT communication to localhost not permitted by network security policy"
);
assert.equal(isNetworkError(cleartext), true);
assert.equal(
  describeNetworkError(cleartext, { action: "Login", apiBaseUrl: "http://localhost:3310/api/v1" }),
  "Login failed: this app build is pointed at localhost:3310, which is the phone itself, not the study server. Install the build configured for the study server."
);

assert.equal(
  describeNetworkError(cleartext, { action: "Login", apiBaseUrl: "http://192.168.1.20:3310/api/v1" }),
  "Login failed: the app is set to an insecure address (http://192.168.1.20:3310/api/v1). Install the build configured for the study server (https)."
);

assert.equal(
  describeNetworkError(new Error("java.net.UnknownHostException: Unable to resolve host \"api.example.org\""), {
    action: "Sync",
    apiBaseUrl: PROD,
  }),
  "Sync failed: cannot find the server api.example.org. Check that mobile data or Wi-Fi is on and try again."
);

assert.equal(
  describeNetworkError(new Error("Network request failed"), { action: "Sync", apiBaseUrl: PROD }),
  "Sync failed: cannot reach the server api.example.org. Check that mobile data or Wi-Fi is on and try again."
);

assert.equal(
  describeNetworkError(new Error("java.net.SocketTimeoutException: timeout"), { action: "Sync", apiBaseUrl: PROD }),
  "Sync failed: the server api.example.org took too long to respond. Check the signal strength and try again."
);

assert.equal(
  describeNetworkError(new Error("javax.net.ssl.SSLHandshakeException: Chain validation failed"), {
    action: "Login",
    apiBaseUrl: PROD,
  }),
  "Login failed: secure connection to api.example.org could not be established. Check the phone's date and time, then try again."
);

// Non-network errors keep their own text behind the action prefix.
assert.equal(isNetworkError(new Error("Device registration failed: Forbidden")), false);
assert.equal(
  describeNetworkError(new Error("Device registration failed: Forbidden"), { action: "Login", apiBaseUrl: PROD }),
  "Login failed: Device registration failed: Forbidden"
);
assert.equal(describeNetworkError(undefined, { action: "Login", apiBaseUrl: PROD }), "Login failed.");

// HTTP failures: Android often has an empty statusText.
assert.equal(describeHttpFailure({ status: 401, statusText: "" }, null, "Login"), "Login failed: the username or password was not accepted.");
assert.equal(describeHttpFailure({ status: 503, statusText: "" }, null, "Login"), "Login failed: the server reported an error (HTTP 503). Try again shortly.");
assert.equal(describeHttpFailure({ status: 400, statusText: "Bad Request" }, "Username is required", "Login"), "Login failed: Username is required");
assert.equal(describeHttpFailure({ status: 404, statusText: "" }, null, "QR login"), "QR login failed (HTTP 404).");

console.log("Network error message validation passed");
