import "./styles.css";

const state = { sites: [], villages: [] };
const statusEl = document.getElementById("pageStatus");
const sitesBody = document.getElementById("sitesBody");
const villagesBody = document.getElementById("villagesBody");
const householdsBody = document.getElementById("householdsBody");
const appShell = document.getElementById("appShell");
const secondaryNav = document.getElementById("secondaryNav");
const panes = {
  home: document.getElementById("homePane"),
  households: document.getElementById("householdsPane"),
  pregnancies: document.getElementById("pregnanciesPane"),
  children: document.getElementById("childrenPane"),
  sites: document.getElementById("sitesPane"),
  localities: document.getElementById("localitiesPane"),
  users: document.getElementById("usersPane")
};
const navLinks = {
  sites: document.getElementById("navSites"),
  localities: document.getElementById("navLocalities"),
  users: document.getElementById("navUsers")
};
const topNavLinks = {
  home: document.getElementById("topNavHome"),
  households: document.getElementById("topNavHouseholds"),
  pregnancies: document.getElementById("topNavPregnancies"),
  children: document.getElementById("topNavChildren"),
  masters: document.getElementById("topNavMasters")
};
const routeTitles = {
  home: "Home",
  households: "Households",
  pregnancies: "Pregnancies",
  children: "Children",
  sites: "Sites",
  localities: "Study Villages/Hamlets/Colonies",
  users: "Users"
};

function currentRoute() {
  const route = window.location.hash.replace("#", "") || "home";
  return routeTitles[route] ? route : "home";
}

function setRoute(route) {
  const isMastersRoute = ["sites", "localities", "users"].includes(route);
  Object.entries(panes).forEach(([key, pane]) => pane.classList.toggle("hidden", key !== route));
  Object.entries(navLinks).forEach(([key, link]) => link.classList.toggle("active", key === route));
  Object.entries(topNavLinks).forEach(([key, link]) => {
    const isActive = key === route || (key === "masters" && isMastersRoute);
    link.classList.toggle("active", isActive);
  });
  secondaryNav.classList.toggle("hidden", !isMastersRoute);
  appShell.classList.toggle("no-sidebar", !isMastersRoute);
  document.getElementById("pageTitle").textContent = routeTitles[route];
  document.getElementById("breadcrumbCurrent").textContent = routeTitles[route];
  if (route === "households") loadHouseholds().catch((error) => setStatus(error.message, "error"));
}

function setStatus(message, tone = "") {
  statusEl.textContent = message;
  statusEl.className = tone ? "status " + tone : "status";
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body.data;
}

function textCell(value) {
  const td = document.createElement("td");
  const div = document.createElement("div");
  div.className = "read-only";
  div.textContent = value ?? "";
  td.appendChild(div);
  return td;
}

function fieldCell(element) {
  const td = document.createElement("td");
  td.appendChild(element);
  return td;
}

function button(label, className, onClick) {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = label;
  if (className) el.className = className;
  el.addEventListener("click", onClick);
  return el;
}

function input(value, attrs = {}) {
  const el = document.createElement("input");
  el.value = value ?? "";
  Object.entries(attrs).forEach(([key, attrValue]) => el.setAttribute(key, attrValue));
  return el;
}

function siteLabel(siteId) {
  const site = state.sites.find((candidate) => Number(candidate.site_id) === Number(siteId));
  return site ? site.site_id + " - " + site.site_name : String(siteId ?? "");
}

function siteSelect(value) {
  const select = document.createElement("select");
  state.sites.forEach((site) => {
    const option = document.createElement("option");
    option.value = site.site_id;
    option.textContent = siteLabel(site.site_id);
    option.selected = Number(site.site_id) === Number(value);
    select.appendChild(option);
  });
  return select;
}

function actionCell(...buttons) {
  const td = document.createElement("td");
  const div = document.createElement("div");
  div.className = "actions";
  buttons.forEach((item) => div.appendChild(item));
  td.appendChild(div);
  return td;
}

function renderSites() {
  sitesBody.replaceChildren();
  state.sites.forEach((site) => sitesBody.appendChild(renderSiteReadOnlyRow(site)));
}

function renderVillages() {
  villagesBody.replaceChildren();
  state.villages.forEach((village) => villagesBody.appendChild(renderVillageReadOnlyRow(village)));
}

function renderHouseholds(households) {
  householdsBody.replaceChildren();
  if (!households.length) {
    const row = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.textContent = "No households synced yet.";
    row.appendChild(td);
    householdsBody.appendChild(row);
    return;
  }
  households.forEach((household) => {
    const row = document.createElement("tr");
    row.appendChild(textCell(household.household_id));
    row.appendChild(textCell(household.site_id));
    row.appendChild(textCell(household.locality_name || household.locality_code));
    row.appendChild(textCell((household.structure_number || "") + " / " + (household.household_number || "")));
    row.appendChild(textCell(household.address));
    row.appendChild(textCell(household.household_head_name));
    row.appendChild(textCell(household.consent_status));
    row.appendChild(textCell(household.updated_at));
    householdsBody.appendChild(row);
  });
}

function renderSiteReadOnlyRow(site) {
  const row = document.createElement("tr");
  row.appendChild(textCell(site.site_id));
  row.appendChild(textCell(site.site_code));
  row.appendChild(textCell(site.site_name));
  row.appendChild(actionCell(
    button("Edit", "secondary", () => row.replaceWith(renderSiteEditRow(site, false))),
    button("Delete", "danger", () => deleteRow("/api/masters/study-sites/" + site.site_id, "Delete study site " + site.site_name + "?"))
  ));
  return row;
}

function renderSiteEditRow(site, isNew) {
  const row = document.createElement("tr");
  const siteId = input(site.site_id, { type: "number", min: "1" });
  const siteCode = input(site.site_code, { maxlength: "12" });
  const siteName = input(site.site_name);
  if (!isNew) siteId.disabled = true;
  row.appendChild(fieldCell(siteId));
  row.appendChild(fieldCell(siteCode));
  row.appendChild(fieldCell(siteName));
  row.appendChild(actionCell(
    button("Save", "", () => saveSite(site, isNew, siteId, siteCode, siteName)),
    button("Cancel", "secondary", () => isNew ? row.remove() : row.replaceWith(renderSiteReadOnlyRow(site)))
  ));
  return row;
}

async function saveSite(site, isNew, siteId, siteCode, siteName) {
  const payload = {
    site_id: Number(siteId.value),
    site_code: siteCode.value,
    site_name: siteName.value
  };
  const url = isNew ? "/api/masters/study-sites" : "/api/masters/study-sites/" + site.site_id;
  await saveRow(url, isNew ? "POST" : "PUT", payload);
}

function renderVillageReadOnlyRow(village) {
  const row = document.createElement("tr");
  row.appendChild(textCell(siteLabel(village.site_id)));
  row.appendChild(textCell(village.village_code));
  row.appendChild(textCell(village.village_name));
  row.appendChild(textCell(village.village_type));
  const url = "/api/masters/study-sites/" + village.site_id + "/villages/" + encodeURIComponent(village.village_code);
  row.appendChild(actionCell(
    button("Edit", "secondary", () => row.replaceWith(renderVillageEditRow(village, false))),
    button("Delete", "danger", () => deleteRow(url, "Delete locality " + village.village_name + "?"))
  ));
  return row;
}

function renderVillageEditRow(village, isNew) {
  const row = document.createElement("tr");
  const siteId = siteSelect(village.site_id);
  const code = input(village.village_code);
  const name = input(village.village_name);
  const type = input(village.village_type || "village");
  if (!isNew) {
    siteId.disabled = true;
    code.disabled = true;
  }
  row.appendChild(fieldCell(siteId));
  row.appendChild(fieldCell(code));
  row.appendChild(fieldCell(name));
  row.appendChild(fieldCell(type));
  row.appendChild(actionCell(
    button("Save", "", () => saveVillage(village, isNew, siteId, code, name, type)),
    button("Cancel", "secondary", () => isNew ? row.remove() : row.replaceWith(renderVillageReadOnlyRow(village)))
  ));
  return row;
}

async function saveVillage(village, isNew, siteId, code, name, type) {
  const payload = {
    site_id: Number(siteId.value),
    village_code: code.value,
    village_name: name.value,
    village_type: type.value
  };
  const url = isNew
    ? "/api/masters/study-villages"
    : "/api/masters/study-sites/" + village.site_id + "/villages/" + encodeURIComponent(village.village_code);
  await saveRow(url, isNew ? "POST" : "PUT", payload);
}

async function saveRow(url, method, payload) {
  try {
    setStatus("Saving...");
    await fetchJson(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    await loadMasters();
    setStatus("Saved.");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function deleteRow(url, message) {
  if (!confirm(message)) return;
  try {
    setStatus("Deleting...");
    await fetchJson(url, { method: "DELETE" });
    await loadMasters();
    setStatus("Deleted.");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function loadMasters() {
  const [sites, villages] = await Promise.all([
    fetchJson("/api/masters/study-sites"),
    fetchJson("/api/masters/study-villages")
  ]);
  state.sites = sites;
  state.villages = villages;
  renderSites();
  renderVillages();
  setStatus("");
}

async function loadHouseholds() {
  const households = await fetchJson("/api/households");
  renderHouseholds(households);
  setStatus("");
}

document.getElementById("refreshButton").addEventListener("click", loadMasters);
document.getElementById("topNavHouseholds").addEventListener("click", () => {
  loadHouseholds().catch((error) => setStatus(error.message, "error"));
});
document.getElementById("addSiteButton").addEventListener("click", () => {
  window.location.hash = "#sites";
  sitesBody.prepend(renderSiteEditRow({ site_id: "", site_code: "", site_name: "" }, true));
});
document.getElementById("addVillageButton").addEventListener("click", () => {
  window.location.hash = "#localities";
  villagesBody.prepend(renderVillageEditRow({
    site_id: state.sites[0]?.site_id || "",
    village_code: "",
    village_name: "",
    village_type: "village"
  }, true));
});
window.addEventListener("hashchange", () => setRoute(currentRoute()));

setRoute(currentRoute());
loadMasters().catch((error) => setStatus(error.message, "error"));
