import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { listTaskWorklistCandidates } from "../worklist/taskWorklistRepository.js";
import { listActiveQuestionnaireDrafts } from "./questionnaireDraftRepository.js";
import {
  filterDraftsForTaskCandidates,
  filterDraftsForUserSite,
  getDraftHouseholdId,
  getDraftSiteId,
} from "./draftPendingForms.js";

function hasDraftAnswers(draft) {
  return Object.keys(draft?.json_payload || {}).length > 0;
}

function isMeaningfulDraftValue(value) {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.some(isMeaningfulDraftValue);
  if (typeof value === "object") return Object.values(value).some(isMeaningfulDraftValue);
  return true;
}

function countDraftAnswers(draft) {
  return Object.values(draft?.json_payload || {}).filter(isMeaningfulDraftValue).length;
}

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
}

function normalizeDraft(draft) {
  const answers = draft.json_payload || {};
  return {
    id: draft.draft_id,
    form_code: draft.form_code || "-",
    form_version: draft.form_version || "",
    site_id: getDraftSiteId(draft),
    household_id: getDraftHouseholdId(draft),
    subject_type: draft.subject_type || "",
    subject_id: draft.subject_id || "",
    current_page: draft.completion_state?.currentPageName || "",
    answer_count: countDraftAnswers(draft),
    updated_at: draft.updated_at || "",
  };
}

function DraftCard({ draft }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.formBadge}>{draft.form_code}</Text>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle}>{draft.household_id || draft.subject_id || draft.id}</Text>
          <Text style={styles.cardSubtle}>Continue filling from Worklist only</Text>
        </View>
      </View>

      <View style={styles.detailGrid}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Draft Status</Text>
          <Text style={styles.detailValue}>Pending</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Last Saved</Text>
          <Text style={styles.detailValue}>{formatDateTime(draft.updated_at)}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Form Version</Text>
          <Text style={styles.detailValue}>{draft.form_version || "-"}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Current Page</Text>
          <Text style={styles.detailValue}>{draft.current_page || "-"}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Saved Answers</Text>
          <Text style={styles.detailValue}>{draft.answer_count}</Text>
        </View>
      </View>
    </View>
  );
}

export function DraftPendingFormsScreen({ user }) {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDrafts = useCallback(async () => {
    const siteDrafts = filterDraftsForUserSite(
      (await listActiveQuestionnaireDrafts()).filter(hasDraftAnswers),
      user,
    );
    const rows = filterDraftsForTaskCandidates(siteDrafts, listTaskWorklistCandidates()).map(normalizeDraft);
    setDrafts(rows);
  }, [user]);

  useEffect(() => {
    loadDrafts().finally(() => setLoading(false));
  }, [loadDrafts]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadDrafts().finally(() => setRefreshing(false));
  }, [loadDrafts]);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.title}>Draft/Pending Forms</Text>
          <Text style={styles.subtitle}>Local drafts saved on this device. Continue them from Worklist.</Text>
        </View>
        <Pressable onPress={handleRefresh} style={styles.refreshButton}>
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
          <Text style={styles.countText}>
            {drafts.length === 1 ? "Showing 1 draft" : `Showing ${drafts.length} drafts`}
          </Text>
          {drafts.length ? (
            drafts.map((draft) => <DraftCard key={draft.id} draft={draft} />)
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No draft/pending forms</Text>
              <Text style={styles.emptyText}>
                Forms will appear here after Save Draft is tapped before final submission.
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
    gap: 12,
    padding: 12,
    backgroundColor: "#eef2f5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headerTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: "#17202a",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900",
  },
  subtitle: {
    marginTop: 4,
    color: "#667085",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  refreshButton: {
    minWidth: 76,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: "#17202a",
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
  countText: {
    color: "#667085",
    fontSize: 14,
    fontWeight: "800",
  },
  card: {
    gap: 14,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#f59e0b",
    backgroundColor: "#fffbeb",
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
    color: "#17202a",
    fontSize: 20,
    fontWeight: "900",
  },
  cardSubtle: {
    marginTop: 2,
    color: "#92400e",
    fontSize: 13,
    fontWeight: "800",
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
    backgroundColor: "#ffffff",
  },
  detailLabel: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  detailValue: {
    color: "#17202a",
    fontSize: 15,
    fontWeight: "800",
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
    color: "#17202a",
    fontSize: 18,
    fontWeight: "900",
  },
  emptyText: {
    color: "#667085",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
});
