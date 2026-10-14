/**
 * Offline cache for the Ballabgarh household/individual master registry.
 *
 * Native devices keep rows in the shared offline SQLite database (tables are
 * created in householdRepository.js initializeSqlite). Web builds fall back to
 * localStorage because the household cache uses the same strategy.
 */
import { Platform } from "react-native";

import { getOfflineDatabase } from "../storage/offlineDatabase";

const REGISTRY_STORAGE_KEY = "dynamic_blb_registry_v1";

function getWebStorage() {
  return Platform.OS === "web" && typeof window !== "undefined" ? window.localStorage : null;
}

function readWebRegistry() {
  const storage = getWebStorage();
  if (!storage) return { households: [], individuals: [] };
  try {
    const raw = storage.getItem(REGISTRY_STORAGE_KEY);
    if (!raw) return { households: [], individuals: [] };
    const parsed = JSON.parse(raw);
    return {
      households: Array.isArray(parsed.households) ? parsed.households : [],
      individuals: Array.isArray(parsed.individuals) ? parsed.individuals : [],
    };
  } catch {
    return { households: [], individuals: [] };
  }
}

function writeWebRegistry(registry) {
  const storage = getWebStorage();
  if (!storage) return;
  try {
    storage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(registry));
  } catch (error) {
    console.warn("Could not persist BLB registry on web:", error);
  }
}

function householdKey(hhListNo, familyNo) {
  return `${String(hhListNo || "").trim()}|${String(familyNo || "").trim()}`;
}

function individualKey(hhListNo, familyNo, indNo) {
  return `${householdKey(hhListNo, familyNo)}|${String(indNo || "").trim()}`;
}

export async function replaceBlbRegistry({ households, individuals }) {
  const nextHouseholds = Array.isArray(households) ? households : [];
  const nextIndividuals = Array.isArray(individuals) ? individuals : [];
  if (Platform.OS !== "web") {
    const db = getOfflineDatabase();
    await db.execAsync("BEGIN TRANSACTION");
    try {
      await db.runAsync("DELETE FROM blb_registry_households WHERE 1=1");
      await db.runAsync("DELETE FROM blb_registry_individuals WHERE 1=1");
      for (const household of nextHouseholds) {
        await db.runAsync(
          `INSERT INTO blb_registry_households
             (hh_list_no, family_no, head_name, address, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            String(household.hh_list_no),
            String(household.family_no),
            household.head_name || null,
            household.address || null,
            household.updated_at || new Date().toISOString(),
          ],
        );
      }
      for (const individual of nextIndividuals) {
        await db.runAsync(
          `INSERT INTO blb_registry_individuals
             (uid, hh_list_no, family_no, ind_no, name, age_years, sex, status, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            String(individual.uid),
            String(individual.hh_list_no),
            String(individual.family_no),
            String(individual.ind_no),
            String(individual.name),
            individual.age_years === null || individual.age_years === undefined
              ? null
              : Number(individual.age_years),
            individual.sex || null,
            String(individual.status || "alive"),
            individual.updated_at || new Date().toISOString(),
          ],
        );
      }
      await db.execAsync("COMMIT");
    } catch (error) {
      try {
        await db.execAsync("ROLLBACK");
      } catch {
        // Keep the original transaction error.
      }
      throw error;
    }
    return { households: nextHouseholds.length, individuals: nextIndividuals.length };
  }
  const registry = { households: nextHouseholds, individuals: nextIndividuals };
  writeWebRegistry(registry);
  return { households: nextHouseholds.length, individuals: nextIndividuals.length };
}

export async function getBlbRegistryCounts() {
  if (Platform.OS !== "web") {
    const db = getOfflineDatabase();
    const households = await db.getFirstAsync(
      "SELECT COUNT(*) AS count FROM blb_registry_households",
    );
    const individuals = await db.getFirstAsync(
      "SELECT COUNT(*) AS count FROM blb_registry_individuals",
    );
    return { households: Number(households?.count || 0), individuals: Number(individuals?.count || 0) };
  }
  const registry = readWebRegistry();
  return { households: registry.households.length, individuals: registry.individuals.length };
}

export async function findBlbRegistryHousehold(hhListNo, familyNo) {
  if (Platform.OS !== "web") {
    const db = getOfflineDatabase();
    return (
      await db.getFirstAsync(
        `SELECT * FROM blb_registry_households WHERE hh_list_no = ? AND family_no = ?`,
        [String(hhListNo || "").trim(), String(familyNo || "").trim()],
      )
    ) || null;
  }
  const registry = readWebRegistry();
  const key = householdKey(hhListNo, familyNo);
  return (
    registry.households.find(
      (household) => householdKey(household.hh_list_no, household.family_no) === key,
    ) || null
  );
}

export async function findBlbRegistryIndividual(hhListNo, familyNo, indNo) {
  if (Platform.OS !== "web") {
    const db = getOfflineDatabase();
    return (
      await db.getFirstAsync(
        `SELECT * FROM blb_registry_individuals
         WHERE hh_list_no = ? AND family_no = ? AND ind_no = ?`,
        [String(hhListNo || "").trim(), String(familyNo || "").trim(), String(indNo || "").trim()],
      )
    ) || null;
  }
  const registry = readWebRegistry();
  const key = individualKey(hhListNo, familyNo, indNo);
  return (
    registry.individuals.find(
      (individual) =>
        individualKey(individual.hh_list_no, individual.family_no, individual.ind_no) === key,
    ) || null
  );
}
