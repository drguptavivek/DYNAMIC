export const LOGIN_QR_TYPE = "dynamic-login-token-v1";

export function parseLoginQrPayload(value) {
  if (!value || typeof value !== "string") {
    throw new Error("QR code is empty");
  }

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("This is not a DYNAMIC login QR code");
  }

  if (!parsed || parsed.type !== LOGIN_QR_TYPE) {
    throw new Error("This QR code is not for DYNAMIC login");
  }

  const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
  if (!token) {
    throw new Error("Login QR code is missing secure login token");
  }

  return { qrPayload: JSON.stringify({ type: LOGIN_QR_TYPE, token }) };
}
