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
  decodeRegistrySex,
} from "./bhqRegistryLookup.js";

const PAGE_SIZE = 10;

function formatAge(person) {
  const age = person?.age_years ?? person?.age;
  return age === null || age === undefined || age === "" ? "Age unavailable" : `${age} years`;
}

function getPersonStatus(person) {
  return String(person?.domicile || person?.status || person?.curr_status || "Status unavailable").trim();
}

function personFacingId(person) {
  return person?.original_id
    || person?.originalId
    || buildRegistryFacingId(person?.village_code, person?.hh_list_no, person?.family_no, person?.ind_no)
    || person?.hdss_unique_id
    || person?.uid
    || "HDSS ID unavailable";
}

export function BhqRegistryLookupDrawer({ linkedUids = new Set(), survey, onSelect, onClose }) {
  const { width } = useWindowDimensions();
  const initialPrefill = getRegistryLookupPrefill(survey);
  const [villageCode, setVillageCode] = useState(initialPrefill.villageCode || "");
  const [houseNo, setHouseNo] = useState(initialPrefill.houseNo || "");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const queryToken = useRef(0);

  const panelWidth = Math.min(width, Math.max(width * 0.92, 310), 480);

  useEffect(() => {
    queryToken.current += 1;
    const nextPrefill = getRegistryLookupPrefill(survey);
    setVillageCode(nextPrefill.villageCode || "");
    setHouseNo(nextPrefill.houseNo || "");
    setSearch("");
    setRows([]);
    setOffset(0);
    setHasMore(false);
    setError("");
  }, [survey]);

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
    const normalizedVillage = String(villageCode || "").trim();
    if (!normalizedVillage) {
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
  }, [villageCode, houseNo, search]);

  async function loadResults({ reset = false } = {}) {
    const normalizedVillage = String(villageCode || "").trim();
    if (!normalizedVillage) return;
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
      setError(lookupError?.message || "Could not search the HDSS registry.");
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
    const displayName = String(item?.name || "Unnamed person").trim() || "Unnamed person";
    const id = personFacingId(item);
    const alreadyLinked = linkedUids.has(String(item?.uid || "").trim());
    return (
      <View style={styles.personRow}>
        <View style={styles.personDetails}>
          <Text selectable numberOfLines={1} style={styles.personName}>{displayName}</Text>
          <Text selectable numberOfLines={1} style={styles.personId}>{id}</Text>
          <Text style={styles.personMeta}>
            {`${formatAge(item)} · ${decodeRegistrySex(item?.sex)} · ${getPersonStatus(item)}`}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={`Select HDSS person ${displayName}`}
          accessibilityRole="button"
          disabled={alreadyLinked || busy || loadingMore}
          onPress={() => onSelect?.(item)}
          style={[styles.selectButton, alreadyLinked && styles.selectButtonDisabled]}
        >
          <Text style={styles.selectButtonText}>{alreadyLinked ? "Linked" : "Select"}</Text>
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
        <Pressable accessibilityLabel="Close HDSS lookup" onPress={onClose} style={styles.scrim} />
        <View style={[styles.drawer, { width: panelWidth }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>BHQ member</Text>
              <Text style={styles.title}>Find HDSS person</Text>
              <Text style={styles.subtitle}>Select one record to link this person.</Text>
            </View>
            <Pressable
              accessibilityLabel="Close HDSS lookup"
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
              <Text style={styles.filterLabel}>Village / locality code</Text>
              <TextInput
                accessibilityLabel="HDSS village code"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setVillageCode}
                placeholder="Required"
                style={styles.input}
                value={villageCode}
              />
            </View>
            <View style={styles.filterField}>
              <Text style={styles.filterLabel}>House number</Text>
              <TextInput
                accessibilityLabel="HDSS house number"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setHouseNo}
                placeholder="Optional"
                style={styles.input}
                value={houseNo}
              />
              {houseNo.trim() ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Search all houses"
                  onPress={() => setHouseNo("")} style={styles.clearHouseButton}>
                  <Text style={styles.resultHint}>All houses</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.filterFieldFull}>
              <Text style={styles.filterLabel}>Name or HDSS original ID</Text>
              <TextInput
                accessibilityLabel="Search HDSS name or original ID"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setSearch}
                placeholder="Type to filter results"
                style={styles.input}
                value={search}
              />
            </View>
            <Text style={styles.scopeHint}>Locality 02 searches the mapped HDSS villages; enter a source village code to narrow.</Text>
          </View>

          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>HDSS people</Text>
            {busy ? <Text style={styles.resultHint}>Searching…</Text> : null}
            {!busy && rows.length ? <Text style={styles.resultHint}>{`${rows.length} shown`}</Text> : null}
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!busy && !error && !rows.length && villageCode.trim() ? (
            <Text style={styles.empty}>No HDSS people match these filters.</Text>
          ) : null}
          {!villageCode.trim() ? <Text style={styles.empty}>Enter a village code to search.</Text> : null}
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
            ListFooterComponent={loadingMore ? <Text style={styles.resultHint}>Loading more…</Text> : null}
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
  clearHouseButton: { minHeight: 44, justifyContent: "center", alignItems: "flex-start" },
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
