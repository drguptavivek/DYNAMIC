import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { listFormResponses } from "../tasks/taskRepository.js";

function normalizeFormResponse(row) {
  return {
    id: row.id || row.submission_id,
    form_code: row.form_code || "-",
    form_version: row.form_version || "",
    household_id: row.household_id || "",
    subject_type: row.subject_type || "",
    subject_id: row.subject_id || "",
    site_id: row.site_id ?? "",
    locality_code: row.locality_code || "",
    submitted_at: row.submitted_at || row.created_at || "",
    sync_status: row.sync_status || "pending",
  };
}

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
}

function uniqueOptions(rows, field) {
  return [...new Set(rows.map((row) => String(row[field] ?? "").trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );
}

function responseSearchText(response) {
  return [
    response.id,
    response.form_code,
    response.form_version,
    response.household_id,
    response.subject_type,
    response.subject_id,
    response.site_id,
    response.locality_code,
    response.sync_status,
    response.submitted_at,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filterResponses(responses, filters) {
  const search = String(filters.search || "").trim().toLowerCase();
  const siteId = String(filters.siteId || "").trim();
  const formId = String(filters.formId || "").trim().toLowerCase();
  const localityCode = String(filters.localityCode || "").trim();

  return responses.filter((response) => {
    if (search && !responseSearchText(response).includes(search)) return false;
    if (siteId && String(response.site_id) !== siteId) return false;
    if (formId && String(response.form_code || "").toLowerCase() !== formId) return false;
    if (localityCode && String(response.locality_code || "") !== localityCode) return false;
    return true;
  });
}

function FilterChip({ label, active, onPress, compact }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterChip, compact && styles.filterChipCompact, active && styles.filterChipActive]}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function InlineFilter({ label, value, options, onChange, compact }) {
  const choices = ["", ...options];
  return (
    <View style={[styles.inlineFilter, compact && styles.inlineFilterCompact]}>
      <Text style={styles.inlineFilterLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.inlineFilterChoices}
      >
        {choices.map((option) => {
          const active = String(value || "") === String(option || "");
          return (
            <FilterChip
              key={option || `${label}-all`}
              compact={compact}
              label={option || "All"}
              active={active}
              onPress={() => onChange(option)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

function FormCard({ response }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.formBadge}>{response.form_code}</Text>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {response.household_id || response.subject_id || response.id}
          </Text>
          <Text style={styles.cardSubtle} numberOfLines={1}>
            {response.form_version ? `Version ${response.form_version}` : "Submitted form"}
          </Text>
        </View>
      </View>

      <View style={styles.detailGrid}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Submitted At</Text>
          <Text style={styles.detailValue}>{formatDateTime(response.submitted_at)}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Sync Status</Text>
          <Text style={styles.detailValue}>{response.sync_status}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Site</Text>
          <Text style={styles.detailValue}>{response.site_id || "-"}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Locality</Text>
          <Text style={styles.detailValue}>{response.locality_code || "-"}</Text>
        </View>
      </View>
    </View>
  );
}

export function FormSubmissionListScreen({ mode }) {
  const uploaded = mode === "uploaded";
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [siteId, setSiteId] = useState("");
  const [formId, setFormId] = useState("");
  const [localityCode, setLocalityCode] = useState("");
  const syncStatus = uploaded ? "synced" : "pending";
  const siteOptions = uniqueOptions(responses, "site_id");
  const formOptions = uniqueOptions(responses, "form_code");
  const localityOptions = uniqueOptions(responses, "locality_code");
  const filteredResponses = filterResponses(responses, {
    search,
    siteId,
    formId,
    localityCode,
  });

  const loadResponses = useCallback(() => {
    const rows = listFormResponses({ sync_status: syncStatus }).map(normalizeFormResponse);
    setResponses(rows);
  }, [syncStatus]);

  useEffect(() => {
    try {
      loadResponses();
    } finally {
      setLoading(false);
    }
  }, [loadResponses]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    try {
      loadResponses();
    } finally {
      setRefreshing(false);
    }
  }, [loadResponses]);

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={[styles.header, compact && styles.headerCompact]}>
        <View style={styles.headerTitleBlock}>
          <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={1}>
            {uploaded ? "Uploaded Forms" : "Completed Forms"}
          </Text>
          <Text style={[styles.subtitle, compact && styles.subtitleCompact]} numberOfLines={2}>
            {uploaded
              ? "Forms already uploaded to the server."
              : "Submitted forms waiting for sync upload."}
          </Text>
        </View>
        <Pressable onPress={handleRefresh} style={[styles.refreshButton, compact && styles.refreshButtonCompact]}>
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color="#17202a" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          <View style={[styles.filterPanel, compact && styles.filterPanelCompact]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[styles.filterRow, compact && styles.filterRowCompact]}
            >
            <TextInput
              style={[styles.searchInput, compact && styles.searchInputCompact]}
              value={search}
              onChangeText={setSearch}
              placeholder="Search"
              placeholderTextColor="#7b8794"
            />
            <InlineFilter
              label="Site"
              value={siteId}
              options={siteOptions}
              onChange={setSiteId}
              compact={compact}
            />
            <InlineFilter
              label="Form"
              value={formId}
              options={formOptions}
              onChange={setFormId}
              compact={compact}
            />
            <InlineFilter
              label="Locality"
              value={localityCode}
              options={localityOptions}
              onChange={setLocalityCode}
              compact={compact}
            />
            </ScrollView>
          </View>

          <Text style={styles.countText}>
            {filteredResponses.length === 1
              ? "Showing 1 form"
              : `Showing ${filteredResponses.length} of ${responses.length} forms`}
          </Text>
          {filteredResponses.length ? (
            filteredResponses.map((response) => <FormCard key={response.id} response={response} />)
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                {responses.length ? "No matching forms" : uploaded ? "No uploaded forms" : "No completed forms"}
              </Text>
              <Text style={styles.emptyText}>
                {responses.length
                  ? "Change or clear filters to see more forms."
                  : uploaded
                    ? "Synced submissions will appear here after a successful Sync Now."
                    : "Forms will appear here after final submit and before sync upload."}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: "#eef2f5",
    padding: 20,
    gap: 16,
  },
  wrapCompact: {
    padding: 12,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCompact: {
    alignItems: "center",
    gap: 8,
  },
  headerTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: "#17202a",
  },
  titleCompact: {
    fontSize: 24,
    lineHeight: 30,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: "#667085",
    fontWeight: "700",
  },
  subtitleCompact: {
    fontSize: 13,
    lineHeight: 18,
    maxWidth: 500,
  },
  refreshButton: {
    minHeight: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: "#17202a",
  },
  refreshButtonCompact: {
    minWidth: 76,
    minHeight: 38,
    paddingHorizontal: 10,
  },
  refreshButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  list: {
    gap: 12,
    paddingBottom: 28,
  },
  filterPanel: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
  },
  filterPanelCompact: {
    padding: 8,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 4,
  },
  filterRowCompact: {
    gap: 6,
  },
  searchInput: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#c8d0d9",
    paddingHorizontal: 14,
    color: "#17202a",
    backgroundColor: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    width: 260,
    maxWidth: 260,
  },
  searchInputCompact: {
    width: 150,
    maxWidth: 150,
    minHeight: 40,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  inlineFilter: {
    minHeight: 48,
    maxWidth: 190,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 8,
    paddingRight: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e4e7ec",
    backgroundColor: "#f8fafc",
  },
  inlineFilterCompact: {
    minHeight: 40,
    maxWidth: 132,
    paddingLeft: 6,
  },
  inlineFilterLabel: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  inlineFilterChoices: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingRight: 4,
  },
  filterChip: {
    minHeight: 32,
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#c8d0d9",
    paddingHorizontal: 10,
    backgroundColor: "#ffffff",
  },
  filterChipCompact: {
    minHeight: 28,
    paddingHorizontal: 8,
  },
  filterChipActive: {
    borderColor: "#0369a1",
    backgroundColor: "#e0f2fe",
  },
  filterChipText: {
    color: "#344054",
    fontSize: 13,
    fontWeight: "800",
  },
  filterChipTextActive: {
    color: "#0369a1",
  },
  countText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#667085",
  },
  card: {
    gap: 14,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  formBadge: {
    minWidth: 54,
    overflow: "hidden",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: "center",
    color: "#ffffff",
    backgroundColor: "#ef4444",
    fontSize: 15,
    fontWeight: "900",
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#17202a",
  },
  cardSubtle: {
    marginTop: 2,
    fontSize: 13,
    color: "#667085",
    fontWeight: "700",
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  detailItem: {
    width: "47%",
    minWidth: 130,
    gap: 4,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#667085",
    textTransform: "uppercase",
  },
  detailValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#17202a",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCard: {
    gap: 6,
    padding: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#17202a",
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#667085",
    fontWeight: "700",
  },
});
