import assert from "node:assert/strict";

import {
  STUDY_SITES,
  getStudySiteName,
  getStudyVillageName,
  listStudyVillages
} from "../../../shared/studyMasters.js";

assert.equal(STUDY_SITES.length, 4);
assert.equal(getStudySiteName(1), "Bareilly");
assert.equal(getStudySiteName(2), "Ballabgarh");
assert.equal(listStudyVillages(2).length, 4);
assert.equal(getStudyVillageName(2, "01"), "Sunped");
assert.equal(getStudyVillageName(2, "02"), "Sagarpur");

console.log("Validated study site and village masters.");
