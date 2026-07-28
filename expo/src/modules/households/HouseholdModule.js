/**
 * Provides household list, detail, and baseline-household-form routes for the field app.
 */
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";

import { formsByCode } from "../../data/formCatalog";
import { ROUTES, navigateTo } from "../../navigation/routes";
import * as syncService from "../sync/syncService.js";
import { BaselineHouseholdForm } from "./BaselineHouseholdForm.js";
import {
  formatSite,
  getHouseholdCacheInfo,
  getHousehold,
  initializeHouseholdRepository,
  listHouseholdMembers,
  listHouseholds,
  searchHouseholdMembers,
} from "./householdRepository";

const HHQ_CODE = "HHQ";
const PAGE_SIZE = 50;
const MEMBER_SEARCH_PAGE_SIZE = 10;

export function HouseholdModule({
  locale,
  mode,
  onLocaleChange,
  user,
  localities = [],
  selectedLocalityCode,
  onDataSynced,
  onFormScrollOffsetChange,
}) {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [households, setHouseholds] = useState([]);
  const [search, setSearch] = useState("");
  const [householdPage, setHouseholdPage] = useState(0);
  const [householdHasNextPage, setHouseholdHasNextPage] = useState(false);
  const [memberName, setMemberName] = useState("");
  const [memberHouseholdNumber, setMemberHouseholdNumber] = useState("");
  const [memberSex, setMemberSex] = useState("");
  const [memberPage, setMemberPage] = useState(0);
  const [memberHasNextPage, setMemberHasNextPage] = useState(false);
  const [memberResults, setMemberResults] = useState([]);
  const [selectedHousehold, setSelectedHousehold] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedHouseholdMembers, setSelectedHouseholdMembers] = useState([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const hhqForm = formsByCode[HHQ_CODE];
  const showForm = mode === "new";

  const refreshHouseholds = async () => {
    await initializeHouseholdRepository();
    const rows = await listHouseholds({
      localityCode: selectedLocalityCode,
      search,
      limit: PAGE_SIZE + 1,
      offset: householdPage * PAGE_SIZE
    });
    setHouseholdHasNextPage(rows.length > PAGE_SIZE);
    setHouseholds(rows.slice(0, PAGE_SIZE));
  };

  useEffect(() => {
    refreshHouseholds();
  }, [selectedLocalityCode, search, householdPage]);

  useEffect(() => {
    setHouseholdPage(0);
  }, [selectedLocalityCode, search]);

  useEffect(() => {
    setMemberPage(0);
  }, [selectedLocalityCode, memberName, memberHouseholdNumber, memberSex]);

  useEffect(() => {
    let active = true;
    const hasMemberSearch =
      memberName.trim() || memberHouseholdNumber.trim() || memberSex;

    async function runMemberSearch() {
      if (!hasMemberSearch) {
        setMemberResults([]);
        setMemberHasNextPage(false);
        return;
      }
      const rows = await searchHouseholdMembers({
        localityCode: selectedLocalityCode,
        name: memberName,
        householdNumber: memberHouseholdNumber,
        sex: memberSex,
        limit: MEMBER_SEARCH_PAGE_SIZE + 1,
        offset: memberPage * MEMBER_SEARCH_PAGE_SIZE
      });
      if (active) {
        setMemberHasNextPage(rows.length > MEMBER_SEARCH_PAGE_SIZE);
        setMemberResults(rows.slice(0, MEMBER_SEARCH_PAGE_SIZE));
      }
    }

    runMemberSearch();
    return () => {
      active = false;
    };
  }, [selectedLocalityCode, memberName, memberHouseholdNumber, memberSex, memberPage]);

  async function openHouseholdPanel(memberOrHousehold) {
    const householdId = memberOrHousehold.household_id;
    const [household, members] = await Promise.all([
      getHousehold(householdId),
      listHouseholdMembers(householdId)
    ]);
    setSelectedHousehold(household || memberOrHousehold);
    setSelectedMember(memberOrHousehold.individual_id ? memberOrHousehold : null);
    setSelectedHouseholdMembers(members);
  }

  function closeHouseholdPanel() {
    setSelectedHousehold(null);
    setSelectedMember(null);
    setSelectedHouseholdMembers([]);
  }

  async function handleSyncHouseholds() {
    setSyncing(true);
    setSyncProgress({
      stage: "starting",
      message: "Starting sync",
      pulledHouseholds: 0,
      pulledMembers: 0,
      pulledTasks: 0,
      formsUpdated: 0
    });
    setSaveMessage("");
    try {
      const result = await syncService.syncAll({
        onProgress: (progress) => setSyncProgress(progress)
      });
      await refreshHouseholds();
      if (onDataSynced) {
        await onDataSynced();
      }
      const cacheInfo = getHouseholdCacheInfo();
      const pulledMessage = `Synced ${result.pulledHouseholds || 0} households and ${result.pulledMembers || 0} members`;
      setSaveMessage(
        cacheInfo.isWebStorage
          ? `${pulledMessage}. Browser cache keeps up to ${cacheInfo.householdLimit} households and ${cacheInfo.memberLimit} members; Android keeps the full sync in SQLite.`
          : pulledMessage
      );
    } catch (error) {
      setSaveMessage(`Sync failed: ${error.message}`);
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  }

  if (showForm) {
    return (
      <BaselineHouseholdForm
        form={hhqForm}
        locale={locale}
        onLocaleChange={onLocaleChange}
        user={user}
        localities={localities}
        selectedLocalityCode={selectedLocalityCode}
        onScrollOffsetChange={onFormScrollOffsetChange}
        onClose={() => navigateTo(ROUTES.households)}
        onSaved={async () => {
          await refreshHouseholds();
          navigateTo(ROUTES.households);
        }}
      />
    );
  }

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={[styles.toolbar, compact && styles.toolbarCompact]}>
        <View>
          <Text style={styles.title}>Households</Text>
        </View>
        <View style={[styles.toolbarActions, compact && styles.toolbarActionsCompact]}>
          <Pressable
            onPress={handleSyncHouseholds}
            disabled={syncing}
            style={[styles.secondaryButton, compact && styles.toolbarButtonCompact, syncing && styles.buttonDisabled]}
          >
            <Text style={styles.secondaryButtonText}>{syncing ? "Syncing..." : "Sync"}</Text>
          </Pressable>
          <Pressable
            onPress={() => navigateTo(ROUTES.householdNew)}
            style={[styles.primaryButton, compact && styles.toolbarButtonCompact]}
          >
            <Text style={styles.primaryButtonText}>Add Household</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.panel}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by HH ID, hamlet, structure, address, or head"
            style={styles.search}
          />
        <View style={styles.memberFilters}>
          <TextInput
            value={memberName}
            onChangeText={setMemberName}
            placeholder="Member name"
            style={[styles.search, styles.memberFilterInput]}
          />
          <TextInput
            value={memberHouseholdNumber}
            onChangeText={setMemberHouseholdNumber}
            placeholder="HH number"
            style={[styles.search, styles.hhNumberInput]}
          />
          <View style={styles.sexFilterGroup}>
            {[
              ["", "Any sex"],
              ["1", "Male"],
              ["2", "Female"],
              ["other", "Other"]
            ].map(([value, label]) => (
              <Pressable
                key={value || "any"}
                onPress={() => setMemberSex(value)}
                style={[
                  styles.sexFilterButton,
                  memberSex === value && styles.sexFilterButtonActive
                ]}
              >
                <Text
                  style={[
                    styles.sexFilterButtonText,
                    memberSex === value && styles.sexFilterButtonTextActive
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        {syncProgress ? <SyncProgressPanel progress={syncProgress} /> : null}
        {saveMessage ? <Text style={styles.saveMessage}>{saveMessage}</Text> : null}
      </View>

      {memberResults.length ? (
        <View style={styles.memberResults}>
          <PaginationBar
            label="Matching members"
            page={memberPage}
            hasNextPage={memberHasNextPage}
            onPrevious={() => setMemberPage((page) => Math.max(0, page - 1))}
            onNext={() => setMemberPage((page) => page + 1)}
          />
          <View style={[styles.row, styles.headerRow]}>
            <Text style={[styles.cell, styles.memberNameCell]}>Member</Text>
            <Text style={[styles.cell, styles.memberMetaCell]}>Age / sex</Text>
            <Text style={[styles.cell, styles.hhCell]}>Structure + HH</Text>
            <Text style={[styles.cell, styles.memberHeadCell]}>HOH name</Text>
            <Text style={[styles.cell, styles.localityCell]}>Locality</Text>
            <Text style={[styles.cell, styles.addressCell]}>Address</Text>
          </View>
          <ScrollView style={styles.memberResultRows}>
            {memberResults.map((member) => (
              <View key={member.individual_id} style={styles.row}>
                <Pressable
                  onPress={() => openHouseholdPanel(member)}
                  style={[styles.cellPressable, styles.memberNameCell]}
                >
                  <Text style={styles.linkText}>{member.member_name || member.individual_id}</Text>
                </Pressable>
                <Text style={[styles.cell, styles.memberMetaCell]}>
                  {`${member.age_years ?? "-"} / ${formatSex(member.sex)} / ${formatMaritalStatus(member.marital_status)}`}
                </Text>
                <Pressable
                  onPress={() => openHouseholdPanel(member)}
                  style={[styles.cellPressable, styles.hhCell]}
                >
                  <Text style={styles.linkText}>{member.structure_number}-{member.household_number}</Text>
                </Pressable>
                <Text style={[styles.cell, styles.memberHeadCell]}>
                  {member.household_head_name || "-"}
                </Text>
                <Text style={[styles.cell, styles.localityCell]}>
                  {member.locality_name || member.locality_code}
                </Text>
                <Text style={[styles.cell, styles.addressCell]}>{member.address}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.table}>
        <PaginationBar
          label="Households"
          page={householdPage}
          hasNextPage={householdHasNextPage}
          onPrevious={() => setHouseholdPage((page) => Math.max(0, page - 1))}
          onNext={() => setHouseholdPage((page) => page + 1)}
        />
        <View style={[styles.row, styles.headerRow]}>
          <Text style={[styles.cell, styles.hhCell]}>Structure + HH</Text>
          <Text style={[styles.cell, styles.localityCell]}>Hamlet / village / colony</Text>
          <Text style={[styles.cell, styles.addressCell]}>Address</Text>
          <Text style={[styles.cell, styles.headCell]}>Household head</Text>
        </View>
        <ScrollView style={styles.rows}>
          {households.map((household) => (
            <View key={household.household_id} style={styles.row}>
              <Pressable
                onPress={() => openHouseholdPanel(household)}
                style={[styles.cellPressable, styles.hhCell]}
              >
                <Text style={styles.linkText}>{household.structure_number}-{household.household_number}</Text>
              </Pressable>
              <Text style={[styles.cell, styles.localityCell]}>
                {`${formatSite(household.site_id)} · ${household.locality_name || household.locality_code}`}
              </Text>
              <Text style={[styles.cell, styles.addressCell]}>{household.address}</Text>
              <Text style={[styles.cell, styles.headCell]}>{household.household_head_name}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <HouseholdSlideout
        household={selectedHousehold}
        selectedMember={selectedMember}
        members={selectedHouseholdMembers}
        onClose={closeHouseholdPanel}
      />
    </View>
  );
}

function SyncProgressPanel({ progress }) {
  const batchLabel = progress.batch
    ? `Batch ${progress.batch}${progress.totalBatches ? ` of ${progress.totalBatches}` : ""}`
    : "Preparing";
  return (
    <View style={styles.syncProgressPanel}>
      <View style={styles.syncProgressHeader}>
        <Text style={styles.syncProgressTitle}>{progress.message || "Syncing"}</Text>
        <Text style={styles.syncProgressBadge}>{batchLabel}</Text>
      </View>
      <View style={styles.syncProgressStats}>
        <Text style={styles.syncProgressStat}>
          {`${progress.pulledHouseholds || 0}${progress.totalHouseholds ? ` / ${progress.totalHouseholds}` : ""} households`}
        </Text>
        <Text style={styles.syncProgressStat}>{`${progress.pulledMembers || 0} members`}</Text>
        <Text style={styles.syncProgressStat}>{`${progress.pulledTasks || 0} tasks`}</Text>
        <Text style={styles.syncProgressStat}>{`${progress.formsUpdated || 0} forms`}</Text>
      </View>
      {progress.hasNextBatch ? (
        <Text style={styles.syncProgressHint}>Next batch will start automatically.</Text>
      ) : null}
    </View>
  );
}

function PaginationBar({ label, page, hasNextPage, onPrevious, onNext }) {
  return (
    <View style={styles.paginationBar}>
      <Text style={styles.paginationTitle}>{label}</Text>
      <View style={styles.paginationActions}>
        <Text style={styles.paginationPage}>{`Page ${page + 1}`}</Text>
        <Pressable
          disabled={page === 0}
          onPress={onPrevious}
          style={[styles.pageButton, page === 0 && styles.pageButtonDisabled]}
        >
          <Text style={[styles.pageButtonText, page === 0 && styles.pageButtonTextDisabled]}>
            Previous
          </Text>
        </Pressable>
        <Pressable
          disabled={!hasNextPage}
          onPress={onNext}
          style={[styles.pageButton, !hasNextPage && styles.pageButtonDisabled]}
        >
          <Text style={[styles.pageButtonText, !hasNextPage && styles.pageButtonTextDisabled]}>
            Next
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function HouseholdSlideout({ household, selectedMember, members, onClose }) {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [copiedMemberId, setCopiedMemberId] = useState(null);
  if (!household) return null;

  async function handleCopyMemberId(memberId) {
    await copyText(memberId);
    setCopiedMemberId(memberId);
    setTimeout(() => setCopiedMemberId(null), 1200);
  }

  return (
    <View style={styles.slideoutLayer}>
      <Pressable accessibilityLabel="Close household panel" style={styles.slideoutScrim} onPress={onClose} />
      <View style={[styles.slideoutPanel, { width: compact ? width : Math.min(460, width * 0.92) }, compact && styles.slideoutPanelCompact]}>
        <View style={[styles.slideoutHeader, compact && styles.slideoutHeaderCompact]}>
          <View style={styles.slideoutTitleWrap}>
            <Text style={styles.slideoutTitle}>Household members</Text>
          </View>
          <Pressable onPress={onClose} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Close</Text>
          </Pressable>
        </View>

        <View style={styles.summaryPanel}>
          <Text style={styles.summaryLabel}>Household ID</Text>
          <Text selectable style={styles.summaryValue}>{household.household_id}</Text>
          <Text style={styles.summaryLabel}>Address</Text>
          <Text selectable style={styles.summaryValue}>{household.address || "-"}</Text>
          <Text style={styles.summaryLabel}>HOH mobile</Text>
          <Text selectable style={styles.summaryValue}>{household.mobile_number || "-"}</Text>
        </View>

        {selectedMember ? (
          <View style={styles.selectedPersonPanel}>
            <Text style={styles.summaryLabel}>Selected person</Text>
            <Text selectable style={styles.selectedPersonName}>
              {selectedMember.member_name || selectedMember.individual_id}
            </Text>
            <Text style={styles.summaryValue}>
              {`${selectedMember.age_years ?? "-"} years · ${formatSex(selectedMember.sex)} · ${formatMaritalStatus(selectedMember.marital_status)} · Member ${selectedMember.line_number ?? "-"}`}
            </Text>
          </View>
        ) : null}

        <ScrollView style={styles.slideoutList}>
          {members.map((member) => {
            const active = selectedMember?.individual_id === member.individual_id;
            return (
              <View key={member.individual_id} style={[styles.memberCard, active && styles.memberCardActive]}>
                <View style={styles.memberCardMain}>
                  <View style={styles.memberCardNameRow}>
                    <Text selectable style={styles.memberCardName}>
                      {`${member.member_name || member.individual_id} [${member.individual_id}]`}
                    </Text>
                    <Pressable
                      accessibilityLabel={`Copy member ID ${member.individual_id}`}
                      onPress={() => handleCopyMemberId(member.individual_id)}
                      style={[
                        styles.copyIconButton,
                        copiedMemberId === member.individual_id && styles.copyIconButtonActive
                      ]}
                    >
                      <View style={styles.copyIconBack} />
                      <View style={styles.copyIconFront} />
                    </Pressable>
                  </View>
                  <Text style={styles.memberCardMeta}>
                    {`${member.age_years ?? "-"} years · ${formatSex(member.sex)} · ${formatMaritalStatus(member.marital_status)}`}
                  </Text>
                </View>
                <Text style={styles.memberCardFlag}>
                  {formatMemberFlag(member)}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

function formatSex(sex) {
  if (Number(sex) === 1) return "Male";
  if (Number(sex) === 2) return "Female";
  return "Other";
}

function formatMaritalStatus(status) {
  if (Number(status) === 1) return "Married";
  if (Number(status) === 2) return "Unmarried";
  return "Marital status unknown";
}

function formatMemberFlag(member) {
  if (Number(member.relationship_to_head) === 1) return "Household head";
  if (member.woman_questionnaire_eligible) return "WQ eligible";
  return "Active member";
}

async function copyText(value) {
  if (!value) return;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    gap: 14,
    padding: 22,
    minHeight: "calc(100vh - 76px)"
  },
  wrapCompact: {
    padding: 12,
    minHeight: "100%"
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16
  },
  toolbarCompact: {
    alignItems: "stretch",
    flexWrap: "wrap",
    gap: 10
  },
  toolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  toolbarActionsCompact: {
    alignItems: "stretch",
    flexWrap: "wrap",
    gap: 8
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#18202a"
  },
  subtle: {
    fontSize: 13,
    color: "#667085"
  },
  panel: {
    gap: 8,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff"
  },
  search: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#d8dee4",
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: "#ffffff"
  },
  saveMessage: {
    color: "#047857",
    fontSize: 13,
    fontWeight: "700"
  },
  syncProgressPanel: {
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eef6ff"
  },
  syncProgressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  syncProgressTitle: {
    flex: 1,
    fontSize: 13,
    color: "#18202a",
    fontWeight: "800"
  },
  syncProgressBadge: {
    fontSize: 12,
    color: "#1f6feb",
    fontWeight: "800"
  },
  syncProgressStats: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8
  },
  syncProgressStat: {
    fontSize: 12,
    color: "#475467",
    fontWeight: "700"
  },
  syncProgressHint: {
    fontSize: 12,
    color: "#667085"
  },
  memberFilters: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8
  },
  memberFilterInput: {
    flex: 1,
    minWidth: 180
  },
  hhNumberInput: {
    width: 120
  },
  sexFilterGroup: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6
  },
  sexFilterButton: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff"
  },
  sexFilterButtonActive: {
    borderColor: "#1f6feb",
    backgroundColor: "#eef6ff"
  },
  sexFilterButtonText: {
    fontSize: 13,
    color: "#475467",
    fontWeight: "700"
  },
  sexFilterButtonTextActive: {
    color: "#1f6feb"
  },
  memberResults: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
    overflow: "hidden"
  },
  memberResultRows: {
    maxHeight: 360
  },
  paginationBar: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f5",
    backgroundColor: "#ffffff"
  },
  paginationTitle: {
    fontSize: 14,
    color: "#18202a",
    fontWeight: "800"
  },
  paginationActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  paginationPage: {
    fontSize: 13,
    color: "#667085",
    fontWeight: "800",
    fontVariant: ["tabular-nums"]
  },
  pageButton: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff"
  },
  pageButtonDisabled: {
    backgroundColor: "#f8fafc"
  },
  pageButtonText: {
    fontSize: 13,
    color: "#1f6feb",
    fontWeight: "800"
  },
  pageButtonTextDisabled: {
    color: "#98a2b3"
  },
  table: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
    overflow: "hidden"
  },
  rows: {
    maxHeight: 280
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderTopWidth: 1,
    borderTopColor: "#eef2f5"
  },
  headerRow: {
    minHeight: 42,
    borderTopWidth: 0,
    backgroundColor: "#f8fafc"
  },
  cell: {
    paddingHorizontal: 12,
    fontSize: 13,
    color: "#18202a"
  },
  cellPressable: {
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  linkText: {
    fontSize: 13,
    color: "#1f6feb",
    fontWeight: "800"
  },
  hhCell: {
    width: 150,
    fontWeight: "800"
  },
  localityCell: {
    width: 230
  },
  addressCell: {
    flex: 1
  },
  headCell: {
    width: 190
  },
  memberNameCell: {
    width: 180,
    fontWeight: "800"
  },
  memberMetaCell: {
    width: 170
  },
  memberHeadCell: {
    width: 180
  },
  consentCell: {
    width: 100,
    fontWeight: "700"
  },
  primaryButton: {
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: "#1f6feb"
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  toolbarButtonCompact: {
    flexGrow: 1,
    alignItems: "center"
  },
  secondaryButton: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff"
  },
  buttonDisabled: {
    opacity: 0.65
  },
  secondaryButtonText: {
    color: "#18202a",
    fontWeight: "700"
  },
  formWindow: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 20,
    backgroundColor: "#eef2f5"
  },
  formWindowHeader: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 22,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#d8dee4"
  },
  formActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  formWindowTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#18202a"
  },
  formWindowBody: {
    flex: 1,
    margin: 18,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    padding: 12,
    overflow: "auto"
  },
  slideoutLayer: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 30,
    flexDirection: "row",
    justifyContent: "flex-end"
  },
  slideoutScrim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(15, 23, 42, 0.28)"
  },
  slideoutPanel: {
    height: "100%",
    gap: 14,
    padding: 18,
    backgroundColor: "#ffffff",
    borderLeftWidth: 1,
    borderLeftColor: "#d8dee4"
  },
  slideoutPanelCompact: {
    padding: 14,
    borderLeftWidth: 0
  },
  slideoutHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  slideoutHeaderCompact: {
    alignItems: "flex-start"
  },
  slideoutTitleWrap: {
    flex: 1
  },
  slideoutTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#18202a"
  },
  summaryPanel: {
    gap: 4,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#f8fafc"
  },
  summaryLabel: {
    marginTop: 4,
    fontSize: 11,
    color: "#667085",
    fontWeight: "800",
    textTransform: "uppercase"
  },
  summaryValue: {
    fontSize: 14,
    color: "#18202a"
  },
  selectedPersonPanel: {
    gap: 3,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eef6ff"
  },
  selectedPersonName: {
    fontSize: 16,
    color: "#18202a",
    fontWeight: "800"
  },
  slideoutList: {
    flex: 1
  },
  memberCard: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f5"
  },
  memberCardMain: {
    flex: 1
  },
  memberCardActive: {
    backgroundColor: "#eef6ff"
  },
  memberCardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8
  },
  memberCardName: {
    flexShrink: 1,
    fontSize: 15,
    color: "#18202a",
    fontWeight: "800"
  },
  copyIconButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff"
  },
  copyIconButtonActive: {
    borderColor: "#1f6feb",
    backgroundColor: "#eef6ff"
  },
  copyIconBack: {
    position: "absolute",
    width: 12,
    height: 14,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: "#64748b",
    transform: [{ translateX: -3 }, { translateY: -3 }]
  },
  copyIconFront: {
    width: 12,
    height: 14,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: "#1f6feb",
    backgroundColor: "#ffffff",
    transform: [{ translateX: 3 }, { translateY: 3 }]
  },
  memberCardMeta: {
    marginTop: 3,
    fontSize: 13,
    color: "#667085"
  },
  memberCardFlag: {
    fontSize: 12,
    color: "#475467",
    fontWeight: "800"
  }
});
