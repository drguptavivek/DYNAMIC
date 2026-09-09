/**
 * Detects a device clock that has been moved backwards (to back-date forms)
 * or that is far from server time.
 *
 * Two signals are combined:
 * - a high-water mark of the latest time this device has ever observed
 *   (local clock readings and server time from every sync), kept in the
 *   device key/value store so it survives local data resets. If "now" is
 *   earlier than that mark, the clock was rewound.
 * - the server/device delta measured at the last sync.
 *
 * Skew beyond CLOCK_SKEW_WARN_MS shows a prominent warning; when the device
 * is BEHIND trusted time by more than that, form entry is blocked because
 * that is exactly what back-dating an interview looks like.
 */
import { getDeviceValue, setDeviceValue } from "../../lib/deviceKeyValueStore.js";

export const CLOCK_SKEW_WARN_MS = 60 * 60 * 1000;
export const TRUSTED_CLOCK_MARK_KEY = "dynamic_trusted_clock_mark_v1";

export function formatSkew(ms) {
  const abs = Math.abs(Number(ms) || 0);
  const minutes = Math.round(abs / 60000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(abs / 3600000);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(abs / 86400000);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * @param {object} input
 * @param {number} input.nowMs           device time now (epoch ms)
 * @param {number|null} input.highWaterMarkMs  latest time ever observed, or null
 * @param {number|null} input.serverDeltaMs    server minus device at last sync (ms), or null
 * @param {number} [input.warnMs]
 */
export function assessClockSkew({ nowMs, highWaterMarkMs = null, serverDeltaMs = null, warnMs = CLOCK_SKEW_WARN_MS } = {}) {
  const now = Number(nowMs);
  const mark = highWaterMarkMs === null || highWaterMarkMs === undefined ? null : Number(highWaterMarkMs);
  const delta = serverDeltaMs === null || serverDeltaMs === undefined ? null : Number(serverDeltaMs);

  const rewoundMs = mark !== null && Number.isFinite(mark) ? Math.max(0, mark - now) : 0;
  const behindServerMs = delta !== null && Number.isFinite(delta) && delta > 0 ? delta : 0;
  const aheadOfServerMs = delta !== null && Number.isFinite(delta) && delta < 0 ? -delta : 0;
  const behindMs = Math.max(rewoundMs, behindServerMs);

  if (behindMs > warnMs) {
    const cause = rewoundMs >= behindServerMs
      ? `has been set back by about ${formatSkew(rewoundMs)}`
      : `is about ${formatSkew(behindServerMs)} behind the server`;
    return {
      status: "blocked",
      skewMs: -behindMs,
      rewoundMs,
      message:
        `This device's date and time ${cause}. Forms cannot be opened or saved until the date and time are ` +
        "corrected. Set date & time to automatic in the phone settings, then sync.",
    };
  }
  if (aheadOfServerMs > warnMs) {
    return {
      status: "warning",
      skewMs: aheadOfServerMs,
      rewoundMs,
      message:
        `This device's date and time is about ${formatSkew(aheadOfServerMs)} ahead of the server. ` +
        "Set date & time to automatic in the phone settings, then sync.",
    };
  }
  return { status: "ok", skewMs: behindMs ? -behindMs : aheadOfServerMs, rewoundMs, message: "" };
}

export async function loadTrustedClockMark() {
  try {
    const value = Number(await getDeviceValue(TRUSTED_CLOCK_MARK_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Raises the high-water mark to `observedMs` if it is later. Returns the mark. */
export async function recordObservedTime(observedMs) {
  const observed = Number(observedMs);
  const current = await loadTrustedClockMark();
  if (!Number.isFinite(observed) || observed <= 0) return current;
  if (current !== null && current >= observed) return current;
  try {
    await setDeviceValue(TRUSTED_CLOCK_MARK_KEY, String(Math.floor(observed)));
  } catch (error) {
    console.warn("Could not store trusted clock mark:", error);
  }
  return observed;
}

export async function recordServerTime(serverTimeUtc) {
  const ms = Date.parse(String(serverTimeUtc || ""));
  if (!Number.isFinite(ms)) return loadTrustedClockMark();
  return recordObservedTime(ms);
}

/**
 * One-stop evaluation used by the app shell: records "now", then assesses
 * against the mark and the last sync delta.
 */
export async function evaluateDeviceClock({ nowMs = Date.now(), serverDeltaMs = null } = {}) {
  const markBefore = await loadTrustedClockMark();
  // Record now only when it is not itself suspicious, so a rewound clock
  // cannot lower the mark; a later legitimate time still raises it.
  const assessment = assessClockSkew({ nowMs, highWaterMarkMs: markBefore, serverDeltaMs });
  if (assessment.status !== "blocked") await recordObservedTime(nowMs);
  return assessment;
}
