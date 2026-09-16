const RELATIONSHIP_LABELS = new Map([
  [1, "Head"],
  [2, "Wife or husband"],
  [3, "Son/daughter"],
  [4, "Son/daughter-in-law"],
  [5, "Grandchild"],
  [6, "Parent"],
  [7, "Parent-in-law"],
  [8, "Brother/sister"],
  [9, "Brother-in-law or sister-in-law"],
  [10, "Niece/Nephew"],
  [11, "Other relative"],
  [12, "Adopted/Foster/Step-NO"],
  [13, "Domestic Servant"],
  [14, "Other not related"],
  [98, "Don't know"],
]);

function normalizedName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function isMatchingHouseholdHead(memberName, householdHeadName) {
  const member = normalizedName(memberName);
  const head = normalizedName(householdHeadName);
  return Boolean(member && head && member === head);
}

export function formatHouseholdRelationship(value, memberName, householdHeadName) {
  if (
    Number(value) === 1 &&
    householdHeadName &&
    !isMatchingHouseholdHead(memberName, householdHeadName)
  ) {
    return "Head selection mismatch";
  }
  return RELATIONSHIP_LABELS.get(Number(value)) || "Unknown";
}

export function formatHouseholdMemberStatus(member, householdHeadName) {
  const statuses = [];
  const markedHead = Number(member?.relationship_to_head) === 1;
  if (markedHead && isMatchingHouseholdHead(member?.member_name, householdHeadName)) {
    statuses.push("Household head");
  } else if (markedHead && householdHeadName) {
    statuses.push("Relationship needs review");
  }
  if (Number(member?.woman_questionnaire_eligible) === 1 || member?.woman_questionnaire_eligible === true) {
    statuses.push("WQ eligible");
  }
  return statuses.length ? statuses.join(" · ") : "Active member";
}
