import { getFormDisplayCode } from "../../lib/formDisplayCodes.js";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { listTaskWorklistCandidates } from "../worklist/taskWorklistRepository.js";
import { listActiveQuestionnaireDraftSummaries } from "./questionnaireDraftRepository.js";
import { getHouseholdMemberSync, getHouseholdSync } from "../../lib/householdSync.js";
import { useListPaging } from "../../lib/useListPaging.js";
import {
  countDraftAnswers,
  filterDraftsForTaskCandidates,
  filterDraftsForUserSite,
  getDraftHouseholdId,
  getDraftSiteId,
} from "./draftPendingForms.js";

// Summary rows always carry a populated answer_count column (written by
// persistDraft/backfilled for pre-existing rows), so this only falls back to
// counting json_payload keys for a row that predates the backfill.
function hasDraftAnswers(draft) {
  if (typeof draft?.answer_count === "number") return draft.answer_count > 0;
  return countDraftAnswers(draft) > 0;
}

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
}

function normalizeDraft(draft) {
  const householdId = draft.household_id || getDraftHouseholdId(draft);
  const answers = draft.json_payload || {};
  const formCode = String(draft.form_code || "").toUpperCase();
  const household = householdId ? getHouseholdSync(householdId) : null;
  const member =
    ["WQ", "BWQ"].includes(formCode) && draft.subject_id
      ? getHouseholdMemberSync(draft.subject_id)
      : null;
  const womanName =
    member?.member_name ||
    answers.wq_name_woman ||
    answers.wq_woman_name ||
    answers.woman_name ||
    "";
  const householdHeadName =
    household?.household_head_name ||
    answers.hhq_household_head_name ||
    answers.wq_household_head_name ||
    "";
  const displayName =
    ["WQ", "BWQ"].includes(formCode)
      ? womanName || draft.respondent_label || householdId || draft.subject_id || draft.draft_id
      : householdHeadName || draft.respondent_label || householdId || draft.subject_id || draft.draft_id;
  return {
    id: draft.draft_id,
    form_code: draft.form_code || "-",
    form_version: draft.form_version || "",
    site_id: draft.site_id ?? getDraftSiteId(draft),
    household_id: householdId,
    subject_type: draft.subject_type || "",
    subject_id: draft.subject_id || "",
    current_page: draft.completion_state?.currentPageName || "",
    answer_count: typeof draft.answer_count === "number" ? draft.answer_count : countDraftAnswers(draft),
    respondent_label: displayName,
    household_head_name: householdHeadName,
    woman_name: womanName,
    updated_at: draft.updated_at || "",
  };
}

function DraftCard({ draft }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.formBadge}>{getFormDisplayCode(draft.form_code)}</Text>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle}>{draft.respondent_label}</Text>
          <Text style={styles.cardSubtle} numberOfLines={1}>
            Household: {draft.household_id || "-"}
          </Text>
        </View>
      </View>

      <View style={styles.compactDetails}>
        <Text style={styles.compactValue}>Pending · {draft.answer_count} answers</Text>
        <Text style={styles.compactValue} numberOfLines={1}>
          Saved: {formatDateTime(draft.updated_at)}
        </Text>
        <Text style={styles.compactValue} numberOfLines={1}>
          Page: {draft.current_page || "-"} · Version: {draft.form_version || "-"}
        </Text>
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
      (await listActiveQuestionnaireDraftSummaries()).filter(hasDraftAnswers),
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

  // Keep the complete, filtered summary set in memory for correct counts and
  // task/worklist matching, but mount only one 100-item page at a time.
  const {
    pagedItems: pagedDrafts,
    hasMore,
    showMore,
    shown,
    total,
  } = useListPaging(drafts);

  const listFooter = hasMore ? (
    <Pressable onPress={showMore} style={styles.showMoreButton}>
      <Text style={styles.showMoreText}>{`Show more (${shown} of ${total})`}</Text>
    </Pressable>
  ) : null;

  const listEmpty = (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>No draft/pending forms</Text>
      <Text style={styles.emptyText}>
        Forms will appear here after Save Draft is tapped before final submission.
      </Text>
    </View>
  );

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
        <FlatList
          data={pagedDrafts}
          keyExtractor={(draft) => draft.id}
          renderItem={({ item }) => <DraftCard draft={item} />}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListHeaderComponent={
            <Text style={styles.countText}>
              {drafts.length === 1 ? "Showing 1 draft" : `Showing ${drafts.length} drafts`}
            </Text>
          }
          ListFooterComponent={listFooter}
          ListEmptyComponent={listEmpty}
          onEndReached={showMore}
          onEndReachedThreshold={0.5}
          initialNumToRender={20}
          windowSize={7}
          removeClippedSubviews
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    gap: 8,
    padding: 8,
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
    fontSize: 19,
    lineHeight: 23,
    fontWeight: "900",
  },
  subtitle: {
    marginTop: 2,
    color: "#667085",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
  },
  refreshButton: {
    minWidth: 64,
    minHeight: 32,
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
    gap: 8,
    paddingBottom: 18,
  },
  countText: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "800",
  },
  showMoreButton: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#c8d0d9",
    backgroundColor: "#ffffff",
    marginTop: 4,
  },
  showMoreText: {
    color: "#0369a1",
    fontSize: 13,
    fontWeight: "800",
  },
  card: {
    gap: 5,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#f59e0b",
    backgroundColor: "#fffbeb",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  formBadge: {
    minWidth: 40,
    overflow: "hidden",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 5,
    textAlign: "center",
    color: "#ffffff",
    backgroundColor: "#ef4444",
    fontSize: 11,
    fontWeight: "900",
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    color: "#17202a",
    fontSize: 16,
    fontWeight: "900",
  },
  cardSubtle: {
    marginTop: 0,
    color: "#92400e",
    fontSize: 11,
    fontWeight: "700",
  },
  compactDetails: {
    gap: 2,
    paddingTop: 2,
  },
  compactValue: {
    color: "#17202a",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
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
