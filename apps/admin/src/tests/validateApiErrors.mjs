import assert from "node:assert/strict";
import { formatApiError } from "../lib/apiErrors.ts";

assert.equal(
  formatApiError(
    { error: { message: "CSV validation failed", details: { issues: [{ line: 4, code: "duplicate_uid" }] } } },
    "fallback",
  ),
  "CSV validation failed: line 4: duplicate uid",
);

assert.equal(
  formatApiError(
    { error: { message: "CSV validation failed", details: { issues: [{ line: 1, code: "missing_column", column: "age" }] } } },
    "fallback",
  ),
  "CSV validation failed: line 1, column age: missing column",
);

assert.equal(
  formatApiError(
    {
      error: {
        message: "CSV validation failed",
        details: {
          issues: [
            { line: 2, code: "duplicate_uid", column: "hdss_unique_id" },
            { line: 3, code: "missing_uid", column: "hdss_unique_id" },
            { line: 4, code: "invalid_age", column: "age" },
            { line: 5, code: "invalid_sex", column: "sex" },
          ],
        },
      },
    },
    "fallback",
  ),
  "CSV validation failed: line 2, column hdss_unique_id: duplicate uid; line 3, column hdss_unique_id: missing uid; line 4, column age: invalid age; 4 issues total",
);

assert.equal(
  formatApiError(
    { error: { message: "CSV validation failed", details: { issues: [{ line: "not-a-line", code: null, value: "PII" }] } } },
    "fallback",
  ),
  "CSV validation failed",
);

assert.equal(
  formatApiError(
    { error: { message: "Invalid request", details: { errors: [{ path: ["name"], message: "Required" }] } } },
    "fallback",
  ),
  "name: Required",
);

assert.equal(formatApiError("not-json", "fallback"), "fallback");

console.log("API error formatting validation passed");
