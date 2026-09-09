import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.TZ = "Asia/Kolkata";
const { getLocalCalendarDate } = await import("../lib/localDate.js");

const afterLocalMidnight = new Date("2026-09-03T19:15:00.000Z");
assert.equal(afterLocalMidnight.toISOString().slice(0, 10), "2026-09-03");
assert.equal(getLocalCalendarDate(afterLocalMidnight), "2026-09-04");

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const openPolicySource = fs.readFileSync(
  path.resolve(testRoot, "../modules/worklist/taskOpenPolicy.js"),
  "utf8",
);
assert.match(openPolicySource, /getLocalCalendarDate\(\)/);
assert.doesNotMatch(openPolicySource, /toISOString\(\)\.split/);

console.log("Local calendar date validation passed");
