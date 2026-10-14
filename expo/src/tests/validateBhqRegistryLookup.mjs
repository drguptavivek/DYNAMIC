/** Verifies Ballabgarh registry lookup logic and BHQ roster field wiring. */
import assert from "node:assert/strict";

const lookup = await import(
  "../components/forms/renderers/bhqRegistryLookup.js"
);
const {
  BHQ_REGISTRY_ID_FIELD,
  BHQ_REGISTRY_STATUS_FIELD,
  BHQ_REGISTRY_UID_FIELD,
  applyRegistryIndividualToPanel,
  buildRegistryConfirmationMessage,
  buildRegistryFacingId,
  clearRegistryIndividualFromPanel,
  isBhqRegistrySite,
  masterStatusToChoice,
} = lookup;

// Facing ID format: hh-fam-ind.
assert.equal(buildRegistryFacingId("105", "01", "2"), "105-01-2");
assert.equal(buildRegistryFacingId("", "01", "2"), "");
assert.equal(buildRegistryFacingId("105", null, "2"), "");

// Master status -> roster status choice.
assert.equal(masterStatusToChoice("alive"), 1);
assert.equal(masterStatusToChoice("Dead"), 2);
assert.equal(masterStatusToChoice("EMIGRATED"), 3);
assert.equal(masterStatusToChoice("unknown-status"), 4);
assert.equal(masterStatusToChoice(""), 4);

// Confirmation shows name/age/sex and warns on non-alive status.
const alive = {
  uid: "BLB-105-01-1-abc",
  hh_list_no: "105",
  family_no: "01",
  ind_no: "1",
  name: "Ram Kumar",
  age_years: 45,
  sex: "M",
  status: "alive",
};
const aliveMessage = buildRegistryConfirmationMessage(alive);
assert.match(aliveMessage, /105-01-1/);
assert.match(aliveMessage, /Ram Kumar/);
assert.match(aliveMessage, /45/);
assert.match(aliveMessage, /\bM\b/);
assert.match(aliveMessage, /alive/);
assert.doesNotMatch(aliveMessage, /WARNING/);

const dead = { ...alive, status: "dead" };
assert.match(buildRegistryConfirmationMessage(dead), /WARNING/);
assert.match(buildRegistryConfirmationMessage(dead), /dead/);

// Panel application populates facing ID, hidden uid, and status default.
const values = new Map();
const panel = {
  getQuestionByName: (name) => ({
    set value(v) {
      values.set(name, v);
    },
    get value() {
      return values.get(name);
    },
  }),
};
assert.equal(applyRegistryIndividualToPanel(panel, alive), true);
assert.equal(values.get(BHQ_REGISTRY_ID_FIELD), "105-01-1");
assert.equal(values.get(BHQ_REGISTRY_UID_FIELD), "BLB-105-01-1-abc");
assert.equal(values.get(BHQ_REGISTRY_STATUS_FIELD), 1);

values.clear();
applyRegistryIndividualToPanel(panel, dead);
assert.equal(values.get(BHQ_REGISTRY_STATUS_FIELD), 2);

// Clear removes identity fields but keeps status editable.
applyRegistryIndividualToPanel(panel, alive);
clearRegistryIndividualFromPanel(panel);
assert.equal(values.get(BHQ_REGISTRY_ID_FIELD), undefined);
assert.equal(values.get(BHQ_REGISTRY_UID_FIELD), undefined);
assert.equal(values.get(BHQ_REGISTRY_STATUS_FIELD), 1);

// Registry lookup only activates for the BHQ roster on the Ballabgarh site.
assert.equal(isBhqRegistrySite({ getValue: (name) => (name === "hhq_site_id" ? 2 : null) }), true);
assert.equal(isBhqRegistrySite({ getValue: () => 1 }), false);
assert.equal(isBhqRegistrySite({ getValue: () => null }), false);

// Form JSON carries the three roster fields with the uid hidden.
const fs = await import("node:fs");
const form = JSON.parse(
  fs.readFileSync(
    new URL("../data/forms/baseline_household_questionnaire_v2026.05.09.json", import.meta.url),
    "utf8",
  ),
);
function findPanel(element) {
  if (element?.name === "hhq_household_members") return element;
  for (const child of element?.elements || []) {
    const found = findPanel(child);
    if (found) return found;
  }
  return null;
}
let roster;
for (const page of form.pages) {
  for (const element of page.elements || []) {
    roster = roster || findPanel(element);
  }
}
assert.ok(roster, "roster panel found");
const names = roster.templateElements.map((element) => element.name);
assert.ok(names.includes(BHQ_REGISTRY_ID_FIELD), "facing ID field present");
assert.ok(names.includes(BHQ_REGISTRY_UID_FIELD), "hidden uid field present");
assert.ok(names.includes(BHQ_REGISTRY_STATUS_FIELD), "status field present");
const uidElement = roster.templateElements.find((element) => element.name === BHQ_REGISTRY_UID_FIELD);
assert.equal(uidElement.renderingHint.render_as, "background");
const statusElement = roster.templateElements.find(
  (element) => element.name === BHQ_REGISTRY_STATUS_FIELD,
);
assert.equal(statusElement.choices.length, 4);
assert.deepEqual(
  statusElement.choices.map((choice) => choice.value),
  [1, 2, 3, 4],
);

console.log("Validated BHQ registry lookup wiring.");
