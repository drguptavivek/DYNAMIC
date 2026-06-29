import assert from "node:assert/strict";

import {
  FIELD_APP_ROUTES,
  FORM_OPEN_POLICY,
  SHELL_NAV_ITEMS,
  getRouteForTaskForm,
} from "../navigation/appNavigation.js";

assert.equal(
  FORM_OPEN_POLICY.globalFormMenuEnabled,
  false,
  "field app must not expose a global open-any-form menu",
);

const navRouteIds = SHELL_NAV_ITEMS.map((item) => item.id);
assert.deepEqual(navRouteIds, ["worklist", "sync", "households", "householdMembers", "profile"]);

assert.equal(
  SHELL_NAV_ITEMS.some((item) => item.id === "questionnaires" || item.kind === "formCatalog"),
  false,
  "shell navigation must not include questionnaire catalog entries",
);

assert.equal(FIELD_APP_ROUTES.worklist, "/worklist");
assert.equal(getRouteForTaskForm({ task_type: "PFF" }), "/questionnaires/PFF/new");

assert.throws(
  () => getRouteForTaskForm(null),
  /valid task/,
  "task form routes must require a valid task context",
);

console.log("Validated field app navigation policy.");
