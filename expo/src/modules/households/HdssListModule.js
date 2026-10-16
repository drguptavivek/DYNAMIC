import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { decodeRegistrySex } from "../../components/forms/renderers/bhqRegistryLookup.js";
import { getSelectedBlbRegistryVillages } from "./blbRegistryScope.js";
import { countBlbRegistryHouseholds, listBlbRegistryHouseholds, listBlbRegistryHouseholdMembers } from "./blbRegistryRepository.js";

const PAGE_SIZE = 50;

function Button({ children, onPress, disabled = false }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
      onPress={onPress} style={[styles.button, disabled && styles.disabled]}>
      <Text style={styles.buttonText}>{children}</Text>
    </Pressable>
  );
}

function householdKey(household) {
  return JSON.stringify([household.village_code, household.hh_list_no, household.family_no]);
}

function householdLabel(household) {
  return `House ${household.hh_list_no || "—"} · Family ${household.family_no || "—"}`;
}

function LoadState({ loading, error, onRetry, emptyMessage }) {
  if (loading) return <ActivityIndicator accessibilityLabel="Loading HDSS records" style={styles.notice} />;
  return (
    <View style={styles.notice}>
      <Text accessibilityRole={error ? "alert" : undefined} style={error ? styles.error : styles.secondary}>
        {error || emptyMessage}
      </Text>
      {error ? <Button onPress={onRetry}>Retry</Button> : null}
    </View>
  );
}

export function HdssListModule({ user, selectedLocalityCode }) {
  const villages = getSelectedBlbRegistryVillages(user, selectedLocalityCode);
  // Remount before rendering records after an account or locality-scope change.
  const scopeKey = JSON.stringify([user?.id || user?.user_id || user?.username, user?.role, villages]);
  return <HdssBrowser key={scopeKey} villages={villages} />;
}

function HdssBrowser({ villages }) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(null);
  const [count, setCount] = useState(null);
  const scrollOffset = useRef(0);
  const queryKey = JSON.stringify([search, page, retry]);
  const countKey = JSON.stringify([search, retry]);

  useFocusEffect(useCallback(() => {
    if (!selected) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setSelected(null);
      return true;
    });
    return () => subscription.remove();
  }, [selected]));

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => countBlbRegistryHouseholds({ search }, villages)).then((total) => {
      if (!cancelled) setCount({ key: countKey, total });
    }).catch(() => {
      if (!cancelled) setCount({ key: countKey, error: "Could not count HDSS pages. Please refresh." });
    });
    return () => { cancelled = true; };
  }, [countKey]);

  useEffect(() => {
    let cancelled = false;
    if (!villages.length) return undefined;
    Promise.resolve().then(() => listBlbRegistryHouseholds({
      search, offset: page * PAGE_SIZE, limit: PAGE_SIZE,
    }, villages)).then((data) => {
      if (!cancelled) setResult({ key: queryKey, ...data });
    }).catch(() => {
      if (!cancelled) setResult({ key: queryKey, households: [], error: "Could not load HDSS households. Please retry." });
    });
    return () => { cancelled = true; };
  }, [queryKey]);

  if (!villages.length) {
    return <View style={styles.container}><Text style={styles.secondary}>
      HDSS records are available only for your assigned Ballabhgarh villages. Select an assigned Ballabhgarh locality in the menu.
    </Text></View>;
  }

  if (selected) {
    return <HouseholdMembers household={selected} villages={villages} onBack={() => setSelected(null)} />;
  }

  const current = result?.key === queryKey ? result : null;
  const loading = !current;
  const households = current?.households || [];
  const currentCount = count?.key === countKey ? count : null;
  const totalPages = currentCount && !currentCount.error ? Math.max(1, Math.ceil(currentCount.total / PAGE_SIZE)) : null;
  function submitSearch() {
    const trimmed = input.trim();
    setInput(trimmed);
    setSearch(trimmed);
    scrollOffset.current = 0;
    setPage(0);
    setRetry((value) => value + 1);
  }

  return (
    <View style={styles.container}>
      <View style={styles.paging}>
        <Text style={styles.title}>HDSS households</Text>
        <Button disabled={loading} onPress={() => setRetry((value) => value + 1)}>Refresh</Button>
      </View>
      <Text style={styles.secondary}>Search any member’s name. Separate names with commas to find a household containing all those names.</Text>
      <View style={styles.searchRow}>
        <TextInput accessibilityLabel="Search HDSS by member names" placeholder="Names, e.g. Rajat, Ankit"
          placeholderTextColor="#687582" autoCapitalize="none" autoCorrect={false}
          returnKeyType="search" value={input} onChangeText={setInput}
          onSubmitEditing={submitSearch} style={styles.input} />
        <Button onPress={submitSearch}>Search</Button>
      </View>
      <FlatList style={styles.list} data={households} keyExtractor={householdKey}
        contentOffset={{ x: 0, y: scrollOffset.current }}
        onScroll={(event) => { scrollOffset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={100}
        keyboardShouldPersistTaps="handled" contentContainerStyle={styles.listContent}
        ListEmptyComponent={<LoadState loading={loading} error={current?.error}
          onRetry={() => setRetry((value) => value + 1)}
          emptyMessage={search ? "No households match this member name." : "No HDSS households are cached for this locality. Run Sync Now after the HDSS list has been imported."} />}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${householdLabel(item)}`}
            onPress={() => setSelected(item)} style={styles.card}>
            <Text style={styles.cardTitle}>{householdLabel(item)}</Text>
            <Text style={styles.secondary}>{item.village_name || item.village_code} · Village {item.village_code}</Text>
            <Text style={styles.memberNames}>{item.member_names?.join(", ") || "Names unavailable"}</Text>
            <Text style={styles.secondary}>{item.member_count} members · View all members</Text>
          </Pressable>
        )} />
      <View style={styles.paging}>
        <Button disabled={page === 0 || loading} onPress={() => { scrollOffset.current = 0; setPage((value) => value - 1); }}>Previous</Button>
        <Text style={styles.secondary}>Page {page + 1} / {totalPages ?? "…"}</Text>
        <Button disabled={loading || !current?.hasMore} onPress={() => { scrollOffset.current = 0; setPage((value) => value + 1); }}>Next</Button>
      </View>
      {currentCount?.error ? <Text accessibilityRole="alert" style={styles.error}>{currentCount.error}</Text> : null}
    </View>
  );
}

function HouseholdMembers({ household, villages, onBack }) {
  const [result, setResult] = useState(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    Promise.resolve().then(() => listBlbRegistryHouseholdMembers({
      villageCode: household.village_code, houseNo: household.hh_list_no, familyNo: household.family_no,
    }, villages)).then((members) => {
      if (!cancelled) setResult({ members });
    }).catch(() => {
      if (!cancelled) setResult({ members: [], error: "Could not load household members. Please retry." });
    });
    return () => { cancelled = true; };
  }, [retry]);

  return (
    <View style={styles.container}>
      <View style={styles.back}><Button onPress={onBack}>Back to households</Button></View>
      <Text style={styles.title}>{householdLabel(household)}</Text>
      <Text style={styles.secondary}>{household.village_name || household.village_code} · Village {household.village_code}</Text>
      <Text style={styles.secondary}>{result?.members ? `${result.members.length} members` : "All household members"}</Text>
      <FlatList style={styles.list} data={result?.members || []} keyExtractor={(member) => String(member.uid)}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<LoadState loading={!result} error={result?.error}
          onRetry={() => setRetry((value) => value + 1)} emptyMessage="No members are cached for this household. Run Sync Now to refresh HDSS records." />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.name || "Name unavailable"}</Text>
            <Text style={styles.secondary}>Individual {item.ind_no || "—"}</Text>
            <Text style={styles.memberNames}>{item.age_years == null ? "Age unavailable" : `Source age: ${item.age_years} years`}
              {` · ${decodeRegistrySex(item.sex)}`}</Text>
            <Text style={styles.secondary}>Status: {item.domicile || item.status || item.curr_status || "Unavailable"}</Text>
          </View>
        )} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 10, backgroundColor: "#edf2f5" },
  title: { fontSize: 22, fontWeight: "700", color: "#17202a" },
  secondary: { fontSize: 14, color: "#586573" },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: { flex: 1, minWidth: 0, minHeight: 48, borderWidth: 1, borderColor: "#c7d0d8", borderRadius: 8, paddingHorizontal: 12, backgroundColor: "#fff", color: "#17202a", fontSize: 16 },
  button: { minHeight: 48, justifyContent: "center", alignItems: "center", paddingHorizontal: 14, borderRadius: 8, backgroundColor: "#17202a" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  disabled: { opacity: 0.4 },
  list: { flex: 1 },
  listContent: { gap: 10, paddingVertical: 4 },
  card: { borderWidth: 1, borderColor: "#d8dee4", borderRadius: 10, padding: 14, gap: 6, backgroundColor: "#fff" },
  cardTitle: { fontSize: 17, fontWeight: "700", color: "#17202a" },
  memberNames: { fontSize: 15, color: "#17202a" },
  notice: { paddingVertical: 24, gap: 12, alignItems: "center" },
  error: { color: "#b42318", fontSize: 15 },
  paging: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", alignItems: "center", gap: 8 },
  back: { alignItems: "flex-start" },
});
