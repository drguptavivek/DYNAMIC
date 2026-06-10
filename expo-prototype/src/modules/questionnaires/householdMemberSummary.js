function getChoiceLabel(form, questionName, value, locale = "default") {
  const memberPanel = form?.pages
    ?.flatMap((page) => page.elements || [])
    ?.find((element) => element.name === "hhq_household_members");
  const question = memberPanel?.templateElements?.find(
    (element) => element.name === questionName
  );
  const choice = question?.choices?.find(
    (item) => String(item.value) === String(value)
  );
  const text = choice?.text;
  if (text && typeof text === "object") {
    return text[locale] || text.default || String(value || "");
  }
  return text || (value === undefined || value === null || value === "" ? "-" : String(value));
}

function valueOrDash(value) {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

export function buildHouseholdMemberSummaryRows(data = {}, form, locale = "default") {
  const members = Array.isArray(data.hhq_household_members)
    ? data.hhq_household_members
    : [];

  return members.map((member, index) => ({
    sr: Number(member.member_line_number || index + 1),
    memberName: valueOrDash(member.member_name),
    age: valueOrDash(member.member_age_years),
    sex: getChoiceLabel(form, "member_sex", member.member_sex, locale),
    relation: getChoiceLabel(
      form,
      "member_relationship_to_head",
      member.member_relationship_to_head,
      locale
    ),
    wqEligible: getChoiceLabel(
      form,
      "member_woman_questionnaire_eligible",
      member.member_woman_questionnaire_eligible,
      locale
    ),
  }));
}
