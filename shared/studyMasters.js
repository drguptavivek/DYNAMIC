export const STUDY_SITES = [
  { site_id: 1, site_code: "BRL", site_name: "Bareilly" },
  { site_id: 2, site_code: "BLB", site_name: "Ballabgarh" },
  { site_id: 3, site_code: "BGM", site_name: "Belgavi" },
  { site_id: 4, site_code: "CHN", site_name: "Chennai" }
];

export const STUDY_VILLAGES = [
  {
    site_id: 2,
    village_code: "101",
    village_name: "Sunped",
    village_type: "village"
  },
  {
    site_id: 2,
    village_code: "204",
    village_name: "Sagarpur",
    village_type: "village"
  },
  {
    site_id: 2,
    village_code: "309",
    village_name: "Pehladpur",
    village_type: "village"
  },
  {
    site_id: 2,
    village_code: "410",
    village_name: "Deegh",
    village_type: "village"
  }
];

export function getStudySite(siteId) {
  return STUDY_SITES.find((site) => Number(site.site_id) === Number(siteId));
}

export function getStudySiteName(siteId) {
  return getStudySite(siteId)?.site_name || String(siteId || "");
}

export function listStudyVillages(siteId) {
  return STUDY_VILLAGES.filter((village) => Number(village.site_id) === Number(siteId));
}

export function getStudyVillage(siteId, villageCode) {
  const siteScopedVillage = STUDY_VILLAGES.find(
    (village) =>
      Number(village.site_id) === Number(siteId) &&
      String(village.village_code) === String(villageCode)
  );
  if (siteScopedVillage) return siteScopedVillage;

  return STUDY_VILLAGES.find(
    (village) => String(village.village_code) === String(villageCode)
  );
}

export function getStudyVillageName(siteId, villageCode) {
  return getStudyVillage(siteId, villageCode)?.village_name || String(villageCode || "");
}
