import assert from "node:assert/strict";

const { buildFieldWorkerProfile } = await import("../modules/profile/profileData.js");

const profile = buildFieldWorkerProfile(
  {
    username: "dev-field-worker",
    display_name: "Dev Field Worker",
    role: "field_worker",
    site_id: 4,
    area_assignments: [
      { site_id: 4, locality_code: "04", active_from: "2026-01-01", active_to: null },
      { site_id: 4, locality_code: "99", active_from: "2025-01-01", active_to: "2025-12-31" }
    ]
  },
  [{ site_id: 4, locality_code: "04", locality_name: "Chennai" }],
  "2026-06-05"
);

assert.equal(profile.display_name, "Dev Field Worker");
assert.equal(profile.username, "dev-field-worker");
assert.equal(profile.site_name, "Chennai");
assert.deepEqual(profile.active_assignments, [
  {
    site_id: 4,
    site_name: "Chennai",
    locality_code: "04",
    locality_name: "Chennai",
    active_from: "2026-01-01",
    active_to: ""
  }
]);

console.log("Validated field worker profile data.");
