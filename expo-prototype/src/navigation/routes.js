export const ROUTES = {
  home: "#/",
  households: "#/households",
  householdNew: "#/households/new",
  householdMembers: "#/household-members",
  householdMembersForHousehold: (householdId) => `#/household-members/${encodeURIComponent(householdId)}`,
  profile: "#/profile",
  questionnaire: (formCode) => `#/questionnaires/${formCode}`,
  questionnaireNew: (formCode) => `#/questionnaires/${formCode}/new`,
  worklist: "#/worklist",
  sync: "#/sync",
};

export function parseHashRoute(hash, defaultFormCode) {
  const path = (hash || "#/").replace(/^#/, "") || "/";
  const parts = path.split("/").filter(Boolean);

  if (!parts.length) {
    return { view: "home", formCode: defaultFormCode, mode: "dashboard" };
  }

  if (parts[0] === "households") {
    return {
      view: "households",
      formCode: defaultFormCode,
      mode: parts[1] === "new" ? "new" : "dashboard",
    };
  }

  if (parts[0] === "household-members" || parts[0]?.toLowerCase() === "householdmembers") {
    return {
      view: "householdMembers",
      householdId: parts[1] ? decodeURIComponent(parts[1]) : "",
      formCode: defaultFormCode,
      mode: "dashboard",
    };
  }

  if (parts[0] === "profile") {
    return { view: "profile", formCode: defaultFormCode, mode: "dashboard" };
  }

  if (parts[0] === "questionnaires" && parts[1]) {
    return {
      view: "questionnaire",
      formCode: parts[1],
      mode: parts[2] === "new" ? "new" : "dashboard",
    };
  }

  if (parts[0] === "worklist") {
    return { view: "worklist", formCode: defaultFormCode, mode: "dashboard" };
  }

  if (parts[0] === "sync") {
    return { view: "sync", formCode: defaultFormCode, mode: "dashboard" };
  }

  return { view: "home", formCode: defaultFormCode, mode: "dashboard" };
}

export function navigateTo(route) {
  if (typeof window === "undefined") return;
  if (window.location.hash === route) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  window.location.hash = route;
}
