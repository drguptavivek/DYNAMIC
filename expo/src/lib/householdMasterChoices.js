import {
  getStudySiteName,
  getStudyVillageName
} from "../../../shared/studyMasters.js";

const SITE_FIELD = "hhq_site_id";
const LOCALITY_FIELD = "hhq_locality_code";

function isActiveAssignment(assignment, today) {
  if (!assignment?.locality_code) return false;
  if (!assignment.active_to) return true;
  return String(assignment.active_to) >= today;
}

export function getAssignedSites(user, today = new Date().toISOString().split("T")[0]) {
  const assignments = Array.isArray(user?.area_assignments) ? user.area_assignments : [];
  const siteIds = assignments
    .filter((assignment) => isActiveAssignment(assignment, today))
    .map((assignment) => Number(assignment.site_id))
    .filter((siteId) => Number.isFinite(siteId));

  if (siteIds.length === 0 && user?.site_id !== null && user?.site_id !== undefined) {
    siteIds.push(Number(user.site_id));
  }

  return [...new Set(siteIds)]
    .sort((a, b) => a - b)
    .map((siteId) => ({
      value: siteId,
      text: { default: getStudySiteName(siteId) }
    }));
}

export function getAssignedLocalities(
  user,
  localities = [],
  selectedSiteId = null,
  today = new Date().toISOString().split("T")[0]
) {
  const assignments = Array.isArray(user?.area_assignments) ? user.area_assignments : [];
  // Locality codes repeat between sites (for example, code 01 can exist at
  // several sites). Always resolve the master row by the complete location
  // identity so one site's name cannot leak into another site's UI.
  const localitiesBySiteAndCode = new Map(
    localities.map((locality) => [
      `${Number(locality.site_id)}:${String(locality.locality_code)}`,
      locality,
    ])
  );
  const activeAssignments = assignments
    .filter((assignment) => isActiveAssignment(assignment, today))
    .filter((assignment) => {
      if (!selectedSiteId) return true;
      return Number(assignment.site_id) === Number(selectedSiteId);
    });
  const fallbackLocalities =
    activeAssignments.length === 0 && selectedSiteId
      ? localities
          .filter((locality) => Number(locality.site_id) === Number(selectedSiteId))
          .map((locality) => ({
            site_id: selectedSiteId,
            locality_code: locality.locality_code,
            locality_name: locality.locality_name
          }))
      : [];
  const choices = [...activeAssignments, ...fallbackLocalities]
    .map((assignment) => {
      const code = String(assignment.locality_code);
      const locality = localitiesBySiteAndCode.get(
        `${Number(assignment.site_id)}:${code}`
      );
      return {
        value: code,
        text: {
          default:
            assignment.locality_name ||
            locality?.locality_name ||
            getStudyVillageName(assignment.site_id, code) ||
            code
        },
        site_id: Number(assignment.site_id)
      };
    });

  const seen = new Set();
  return choices
    .filter((choice) => {
      const key = `${choice.site_id}:${choice.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => String(a.text.default).localeCompare(String(b.text.default)))
    .map(({ site_id: _siteId, ...choice }) => choice);
}

function updateElementChoices(element, choicesByName) {
  const next = { ...element };
  if (choicesByName[next.name]) {
    const existingChoicesByValue = new Map(
      (Array.isArray(next.choices) ? next.choices : []).map((choice) => [
        String(choice?.value ?? choice),
        choice
      ])
    );
    next.choices = choicesByName[next.name].map((choice) => {
      const existingChoice = existingChoicesByValue.get(String(choice.value));
      const existingText =
        existingChoice && typeof existingChoice === "object" && !Array.isArray(existingChoice)
          ? existingChoice.text
          : undefined;
      const existingLocalizedText =
        existingText && typeof existingText === "object" && !Array.isArray(existingText)
          ? existingText
          : {};
      return {
        ...choice,
        text: {
          ...existingLocalizedText,
          ...(choice.text || {})
        }
      };
    });
  }
  if (Array.isArray(next.elements)) {
    next.elements = next.elements.map((child) => updateElementChoices(child, choicesByName));
  }
  if (Array.isArray(next.templateElements)) {
    next.templateElements = next.templateElements.map((child) =>
      updateElementChoices(child, choicesByName)
    );
  }
  return next;
}

export function applyHouseholdMasterChoices(surveyJson, { user, localities = [] } = {}) {
  const siteChoices = getAssignedSites(user);
  const defaultSiteId = siteChoices.length === 1 ? siteChoices[0].value : null;
  const localityChoices = getAssignedLocalities(user, localities, defaultSiteId);
  const choicesByName = {};

  if (siteChoices.length > 0) {
    choicesByName[SITE_FIELD] = siteChoices;
  }
  if (localityChoices.length > 0) {
    choicesByName[LOCALITY_FIELD] = localityChoices;
  }

  if (Object.keys(choicesByName).length === 0) {
    return surveyJson;
  }

  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) => updateElementChoices(element, choicesByName))
    }))
  };
}
