import { formatNativeFormText, getNativeFormText } from "../../../lib/nativeFormText.js";
import React, { useEffect, useRef, useState } from "react";
import {
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { getAssignedBlbRegistryVillages } from "../../../modules/sync/syncService.js";
import { searchBlbRegistryPeople } from "../../../modules/households/blbRegistryRepository.js";
import {
  buildRegistryFacingId,
  getRegistryLookupPrefill,
  hasRegistryLookupCriteria,
  decodeRegistrySex,
} from "./bhqRegistryLookup.js";

const PAGE_SIZE = 10;

function formatAge(person, survey) {
  const age = person?.age_years ?? person?.age;
  return age === null || age === undefined || age === ""
    ? getNativeFormText(survey, "age_unavailable", "Age unavailable", survey?.locale)
    : formatNativeFormText(survey, "age_years", "{age} years", { age }, survey?.locale);
}

function getPersonStatus(person, survey) {
  return String(person?.domicile || person?.status || person?.curr_status || getNativeFormText(survey, "status_unavailable", "Status unavailable", survey?.locale)).trim();
}

function personFacingId(person, survey) {
  return person?.original_id
    || person?.originalId
    || buildRegistryFacingId(person?.village_code, person?.hh_list_no, person?.family_no, person?.ind_no)
    || person?.hdss_unique_id
    || person?.uid
    || getNativeFormText(survey, "hdss_id_unavailable", "HDSS ID unavailable", survey?.locale);
}

export function BhqRegistryLookupDrawer({ linkedUids = new Set(), survey, panel, onSelect, onClose }) {
  const { width } = useWindowDimensions();
  const initialPrefill = getRegistryLookupPrefill(survey, panel);
  const [villageCode, setVillageCode] = useState(initialPrefill.villageCode || "");
  const [houseNo, setHouseNo] = useState(initialPrefill.houseNo || "");
  const [search, setSearch] = useState(initialPrefill.name || "");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const queryToken = useRef(0);
  const nameInput = useRef(null);
  const canSearch = hasRegistryLookupCriteria({ villageCode, houseNo, search });

  const panelWidth = Math.min(width, Math.max(width * 0.92, 310), 480);

  useEffect(() => {
    queryToken.current += 1;
    const nextPrefill = getRegistryLookupPrefill(survey, panel);
    setVillageCode(nextPrefill.villageCode || "");
    setHouseNo(nextPrefill.houseNo || "");
    setSearch(nextPrefill.name || "");
    setRows([]);
    setOffset(0);
    setHasMore(false);
    setError("");
  }, [survey, panel]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (Platform.OS === "web") return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose?.();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  useEffect(() => {
    if (!canSearch) {
      queryToken.current += 1;
      setRows([]);
      setBusy(false);
      setLoadingMore(false);
      setHasMore(false);
      setOffset(0);
      setError("");
      return undefined;
    }
    setRows([]);
    setBusy(true);
    setHasMore(false);
    setOffset(0);
    const timer = setTimeout(() => {
      loadResults({ reset: true });
    }, 200);
    return () => {
      clearTimeout(timer);
      queryToken.current += 1;
    };
  }, [villageCode, houseNo, search, canSearch]);

  function updateFilter(setValue, value, currentValue) {
    if (value === currentValue) return;
    queryToken.current += 1;
    setRows([]);
    setHasMore(false);
    setOffset(0);
    setLoadingMore(false);
    setError("");
    setBusy(true);
    setValue(value);
  }

  async function loadResults({ reset = false } = {}) {
    const normalizedVillage = String(villageCode || "").trim();
    if (!canSearch) return;
    const nextOffset = reset ? 0 : offset;
    const token = ++queryToken.current;
    if (reset) setBusy(true);
    else setLoadingMore(true);
    setError("");
    try {
      const people = await searchBlbRegistryPeople({
        villageCode: normalizedVillage,
        houseNo: String(houseNo || "").trim(),
        search: String(search || "").trim(),
        offset: nextOffset,
        limit: PAGE_SIZE,
      }, getAssignedBlbRegistryVillages());
      if (token !== queryToken.current) return;
      const nextRows = Array.isArray(people) ? people : [];
      setRows((current) => reset ? nextRows : [...current, ...nextRows]);
      setOffset(nextOffset + nextRows.length);
      setHasMore(nextRows.length === PAGE_SIZE);
    } catch (lookupError) {
      if (token !== queryToken.current) return;
      setError(lookupError?.message || getNativeFormText(survey, "could_not_search_hdss_registry", "Could not search the HDSS registry.", survey?.locale));
      if (reset) setRows([]);
      setHasMore(false);
    } finally {
      if (token === queryToken.current) {
        setBusy(false);
        setLoadingMore(false);
      }
    }
  }

  function renderPerson({ item }) {
    const resultToken = queryToken.current;
    const displayName = String(item?.name || "").trim() || getNativeFormText(survey, "unnamed_person", "Unnamed person", survey?.locale);
    const id = personFacingId(item, survey);
    const alreadyLinked = linkedUids.has(String(item?.uid || "").trim());
    return (
      <View style={styles.personRow}>
        <View style={styles.personDetails}>
          <Text selectable numberOfLines={1} style={styles.personName}>{displayName}</Text>
          <Text selectable numberOfLines={1} style={styles.personId}>{id}</Text>
          <Text style={styles.personMeta}>
            {`${formatAge(item, survey)} · ${decodeRegistrySex(item?.sex)} · ${getPersonStatus(item, survey)}`}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={formatNativeFormText(survey, "select_hdss_person_name", "Select HDSS person {name}", { name: displayName }, survey?.locale)}
          accessibilityRole="button"
          disabled={alreadyLinked || busy || loadingMore}
          onPress={() => {
            if (resultToken === queryToken.current) onSelect?.(item);
          }}
          style={[styles.selectButton, alreadyLinked && styles.selectButtonDisabled]}
        >
          <Text style={styles.selectButtonText}>{alreadyLinked ? getNativeFormText(survey, "linked", "Linked", survey?.locale || "default") : getNativeFormText(survey, "select", "Select", survey?.locale || "default")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.root}>
        <Pressable accessibilityLabel={getNativeFormText(survey, "close_hdss_lookup", "Close HDSS lookup", survey?.locale || "default")} onPress={onClose} style={styles.scrim} />
        <View style={[styles.drawer, { width: panelWidth }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{getNativeFormText(survey, "bhq_member", "BHQ member", survey?.locale || "default")}</Text>
              <Text style={styles.title}>{getNativeFormText(survey, "find_hdss_person", "Find HDSS person", survey?.locale || "default")}</Text>
              <Text style={styles.subtitle}>{getNativeFormText(survey, "select_one_record_to_link_this_person", "Select one record to link this person.", survey?.locale || "default")}</Text>
            </View>
            <Pressable
              accessibilityLabel={getNativeFormText(survey, "close_hdss_lookup", "Close HDSS lookup", survey?.locale || "default")}
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={styles.closeButton}
            >
              <MaterialCommunityIcons color="#475467" name="close" size={23} />
            </Pressable>
          </View>

          <View style={styles.filters}>
            <View style={styles.filterField}>
              <Text style={styles.filterLabel}>{getNativeFormText(survey, "village_code", "Village code", survey?.locale || "default")}</Text>
              <TextInput
                accessibilityLabel={getNativeFormText(survey, "hdss_village_code", "HDSS village code", survey?.locale || "default")}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) => updateFilter(setVillageCode, value, villageCode)}
                placeholder={getNativeFormText(survey, "required", "Required", survey?.locale || "default")}
                style={styles.input}
                value={villageCode}
              />
            </View>
            <View style={styles.filterField}>
              <Text style={styles.filterLabel}>{getNativeFormText(survey, "house_number", "House number", survey?.locale || "default")}</Text>
              <TextInput
                accessibilityLabel={getNativeFormText(survey, "hdss_house_number", "HDSS house number", survey?.locale || "default")}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) => updateFilter(setHouseNo, value, houseNo)}
                placeholder={getNativeFormText(survey, "or_search_by_name", "Or search by name", survey?.locale || "default")}
                style={styles.input}
                value={houseNo}
              />
            </View>
            <View style={styles.filterFieldFull}>
              <Text style={styles.filterLabel}>{getNativeFormText(survey, "name_of_individual_or_hdss_original_id", "Name of individual or HDSS original ID", survey?.locale || "default")}</Text>
              <TextInput
                ref={nameInput}
                accessibilityLabel={getNativeFormText(survey, "search_hdss_name_or_original_id", "Search HDSS name or original ID", survey?.locale || "default")}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) => updateFilter(setSearch, value, search)}
                placeholder={getNativeFormText(survey, "name_or_name_name", "Name, or name,name", survey?.locale || "default")}
                style={styles.input}
                value={search}
              />
            </View>
            <Text style={styles.scopeHint}>{getNativeFormText(survey, "village_must_match_exactly_clear_the_house_number_for_name_only_search_comma_separated_names_find_ho", "Village must match exactly. Clear the house number for name-only search. Comma-separated names find households containing all names.", survey?.locale || "default")}</Text>
          </View>

          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>{getNativeFormText(survey, "hdss_people", "HDSS people", survey?.locale || "default")}</Text>
            {busy ? <Text style={styles.resultHint}>{getNativeFormText(survey, "searching", "Searching\u2026", survey?.locale || "default")}</Text> : null}
            {!busy && rows.length ? <Text style={styles.resultHint}>{formatNativeFormText(survey, "count_shown", "{count} shown", { count: rows.length }, survey?.locale)}</Text> : null}
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!busy && !error && !rows.length && canSearch ? (
            <Text style={styles.empty}>{getNativeFormText(survey, "no_hdss_people_match_these_filters", "No HDSS people match these filters.", survey?.locale || "default")}</Text>
          ) : null}
          {!busy && !error && !rows.length && villageCode.trim() && houseNo.trim() ? (
            <Pressable accessibilityRole="button" onPress={() => {
              updateFilter(setHouseNo, "", houseNo);
              nameInput.current?.focus();
            }} style={styles.nameSearchButton}>
              <Text style={styles.personId}>{getNativeFormText(survey, "search_by_name_instead", "Search by name instead", survey?.locale || "default")}</Text>
            </Pressable>
          ) : null}
          {!canSearch ? <Text style={styles.empty}>{getNativeFormText(survey, "enter_a_village_code_and_either_a_house_number_or_name", "Enter a village code and either a house number or name.", survey?.locale || "default")}</Text> : null}
          <FlatList
            contentContainerStyle={styles.results}
            data={rows}
            keyExtractor={(item, index) => String(item?.uid || item?.hdss_unique_id || item?.original_id || index)}
            keyboardShouldPersistTaps="handled"
            onEndReached={() => {
              if (!busy && !loadingMore && hasMore) loadResults();
            }}
            onEndReachedThreshold={0.6}
            renderItem={renderPerson}
            ListFooterComponent={loadingMore ? <Text style={styles.resultHint}>{getNativeFormText(survey, "loading_more", "Loading more\u2026", survey?.locale || "default")}</Text> : null}
            style={styles.resultList}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(16, 24, 40, 0.38)" },
  drawer: { height: "100%", paddingTop: 18, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "#ffffff", boxShadow: "-4px 0 18px rgba(16, 24, 40, 0.16)" },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#eaecf0" },
  headerCopy: { minWidth: 0, flex: 1, gap: 3 },
  eyebrow: { color: "#667085", fontSize: 11, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  title: { color: "#1f4d7a", fontSize: 20, fontWeight: "900" },
  subtitle: { color: "#667085", fontSize: 12 },
  closeButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, backgroundColor: "#ffffff" },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 12 },
  filterField: { minWidth: 110, flex: 1, gap: 4 },
  filterFieldFull: { width: "100%", gap: 4 },
  scopeHint: { width: "100%", color: "#667085", fontSize: 12 },
  nameSearchButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  filterLabel: { color: "#344054", fontSize: 11, fontWeight: "800" },
  input: { minHeight: 40, paddingHorizontal: 10, borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 7, color: "#18202a", backgroundColor: "#ffffff" },
  resultHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#eaecf0" },
  resultTitle: { color: "#18202a", fontSize: 14, fontWeight: "900" },
  resultHint: { color: "#667085", fontSize: 12, paddingVertical: 8 },
  error: { color: "#b42318", fontSize: 12, paddingVertical: 8 },
  empty: { color: "#667085", fontSize: 13, paddingVertical: 18, textAlign: "center" },
  results: { gap: 8, paddingBottom: 16 },
  resultList: { flex: 1 },
  personRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, backgroundColor: "#ffffff" },
  personDetails: { minWidth: 0, flex: 1, gap: 2 },
  personName: { color: "#18202a", fontSize: 14, fontWeight: "900" },
  personId: { color: "#1f4d7a", fontSize: 12, fontWeight: "800" },
  personMeta: { color: "#667085", fontSize: 12 },
  selectButton: { minHeight: 36, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderRadius: 7, backgroundColor: "#1f6feb" },
  selectButtonDisabled: { backgroundColor: "#98a2b3" },
  selectButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
});
