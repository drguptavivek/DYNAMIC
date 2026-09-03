/** Verifies rewound / skewed device clocks are detected and forms are blocked. */
import assert from "node:assert/strict";

const {
  CLOCK_SKEW_WARN_MS,
  assessClockSkew,
  evaluateDeviceClock,
  formatSkew,
  loadTrustedClockMark,
  recordObservedTime,
  recordServerTime,
} = await import("../modules/sync/trustedClock.js");

const HOUR = 60 * 60 * 1000;
const T0 = Date.parse("2026-09-03T10:00:00Z");

assert.equal(CLOCK_SKEW_WARN_MS, HOUR);
assert.equal(formatSkew(30 * 60000), "30 minutes");
assert.equal(formatSkew(3 * HOUR), "3 hours");
assert.equal(formatSkew(3 * 24 * HOUR), "3 days");

// No history: nothing to compare, ok.
assert.equal(assessClockSkew({ nowMs: T0 }).status, "ok");

// Clock moved back 30 minutes: within tolerance.
assert.equal(assessClockSkew({ nowMs: T0 - 30 * 60000, highWaterMarkMs: T0 }).status, "ok");

// Clock moved back 2 days: blocked with an actionable message.
const rewound = assessClockSkew({ nowMs: T0 - 2 * 24 * HOUR, highWaterMarkMs: T0 });
assert.equal(rewound.status, "blocked");
assert.match(rewound.message, /set back by about 2 days/);
assert.match(rewound.message, /cannot be opened or saved/);

// Device behind the server by 3 hours at last sync: blocked.
const behind = assessClockSkew({ nowMs: T0, highWaterMarkMs: T0, serverDeltaMs: 3 * HOUR });
assert.equal(behind.status, "blocked");
assert.match(behind.message, /3 hours behind the server/);

// Device ahead of the server by 2 hours: warning, not blocked.
const ahead = assessClockSkew({ nowMs: T0, highWaterMarkMs: T0, serverDeltaMs: -2 * HOUR });
assert.equal(ahead.status, "warning");
assert.match(ahead.message, /2 hours ahead of the server/);

// Exactly one hour is still ok; one minute more is not.
assert.equal(assessClockSkew({ nowMs: T0 - HOUR, highWaterMarkMs: T0 }).status, "ok");
assert.equal(assessClockSkew({ nowMs: T0 - HOUR - 60000, highWaterMarkMs: T0 }).status, "blocked");

// Persistence: the mark only ever rises.
assert.equal(await loadTrustedClockMark(), null);
assert.equal(await recordObservedTime(T0), T0);
assert.equal(await recordObservedTime(T0 - HOUR), T0, "an earlier reading does not lower the mark");
assert.equal(await recordServerTime("2026-09-03T12:00:00Z"), T0 + 2 * HOUR);
assert.equal(await loadTrustedClockMark(), T0 + 2 * HOUR);

// evaluateDeviceClock: a legitimate later time raises the mark; a rewound
// clock is blocked and does not lower it.
assert.equal((await evaluateDeviceClock({ nowMs: T0 + 3 * HOUR })).status, "ok");
assert.equal(await loadTrustedClockMark(), T0 + 3 * HOUR);
const tampered = await evaluateDeviceClock({ nowMs: T0 - 5 * 24 * HOUR });
assert.equal(tampered.status, "blocked");
assert.equal(await loadTrustedClockMark(), T0 + 3 * HOUR);
// Corrected clock clears the block.
assert.equal((await evaluateDeviceClock({ nowMs: T0 + 4 * HOUR })).status, "ok");

console.log("Trusted clock validation passed");
