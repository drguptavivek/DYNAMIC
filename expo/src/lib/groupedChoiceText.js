/** Group headings are display-only; final coded answers remain questionnaire choices. */
export const GROUP_CONFIGS = {
  hhq_main_source_drinking_water_members_household_piped_water: [
    { id: "piped", label: "PIPED WATER", childValues: [11, 12, 13, 14], childHint: "Select piped water source" },
    { id: "tube", value: 21 },
    { id: "dug", label: "DUG WELL", childValues: [31, 32], childHint: "Select dug well type" },
    { id: "spring", label: "WATER FROM SPRING", childValues: [41, 42], childHint: "Select spring type" },
    { id: "rain", value: 51 },
    { id: "tanker", value: 61 },
    { id: "cart", value: 71 },
    { id: "surface", value: 81 },
    { id: "bottled", value: 91 },
    { id: "ro", value: 92 },
    { id: "other", value: 96 },
  ],
  hhq_kind_toilet_facility_members_household_usually_use_flush: [
    { id: "flush", label: "FLUSH OR POUR FLUSH TOILET", childValues: [11, 12, 13, 14, 15], childHint: "Select flush toilet type" },
    { id: "pit", label: "PIT LATRINE", childValues: [21, 22, 23], childHint: "Select pit latrine type" },
    { id: "twin", value: 31 },
    { id: "dry", value: 41 },
    { id: "open", value: 51 },
    { id: "other", value: 96 },
  ],
  hhq_main_material_floor_natural_floor: [
    { id: "natural", label: "NATURAL FLOOR", childValues: [11, 12, 13], childHint: "Select natural floor material" },
    { id: "rudimentary", label: "RUDIMENTARY FLOOR", childValues: [21, 22, 23, 24], childHint: "Select rudimentary floor material" },
    { id: "finished", label: "FINISHED FLOOR", childValues: [31, 32, 33, 34, 35, 36], childHint: "Select finished floor material" },
    { id: "other", value: 96 },
  ],
  hhq_main_material_roof_natural_roofing: [
    { id: "natural", label: "NATURAL ROOFING", childValues: [11, 12, 13, 14, 15], childHint: "Select natural roofing material" },
    { id: "rudimentary", label: "RUDIMENTARY ROOFING", childValues: [21, 22, 23, 24, 25], childHint: "Select rudimentary roofing material" },
    { id: "finished", label: "FINISHED ROOFING", childValues: [31, 32, 33, 34, 35, 36, 37, 38, 39], childHint: "Select finished roofing material" },
    { id: "other", value: 96 },
  ],
  hhq_main_material_external_walls_natural_walls: [
    { id: "natural", label: "NATURAL WALLS", childValues: [11, 12, 13, 14], childHint: "Select natural wall material" },
    { id: "rudimentary", label: "RUDIMENTARY WALLS", childValues: [21, 22, 23, 24, 25, 26], childHint: "Select rudimentary wall material" },
    { id: "finished", label: "FINISHED WALLS", childValues: [31, 32, 33, 34, 35, 36], childHint: "Select finished wall material" },
    { id: "other", value: 96 },
  ],
};

export function groupedChoiceTextKey(questionName, groupId, property) {
  return `${questionName}_${groupId}_${property}`;
}

export const GROUPED_CHOICE_TEXT = {};
export const GROUPED_CHOICE_TEXT_KEYS = {};
for (const [questionName, groups] of Object.entries(GROUP_CONFIGS)) {
  GROUPED_CHOICE_TEXT_KEYS[questionName] = [];
  for (const group of groups) {
    for (const property of ["label", "childHint"]) {
      if (!group[property]) continue;
      const key = groupedChoiceTextKey(questionName, group.id, property);
      GROUPED_CHOICE_TEXT[key] = group[property];
      GROUPED_CHOICE_TEXT_KEYS[questionName].push(key);
    }
  }
}
