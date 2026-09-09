/**
 * Provides household list, detail, and baseline-household-form routes for the field app.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";

import { getRuntimeFormByCode } from "../../data/runtimeFormCatalog";
import { getAssignedLocalities, getAssignedSites } from "../../lib/householdMasterChoices.js";
import { ROUTES, navigateTo } from "../../navigation/routes";
import * as syncService from "../sync/syncService.js";
import { listOpenHhqHouseholdIds } from "../tasks/taskRepository.js";
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
const FREE_TEXT_SEARCH_MIN_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 300;

function isFieldWorker(user) {
  return String(user?.role || "").toLowerCase().replace(/[\s-]+/g, "_") === "field_worker";
}

export function HouseholdModule({
  locale,
  mode,
  onLocaleChange,
  user,
  localities = [],
  selectedLocalityCode,
  taskContext,
  draftId,
  onDataSynced,
  onDraftSaved,
}) {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [households, setHouseholds] = useState([]);
  const [selectedLocalityCodes, setSelectedLocalityCodes] = useState([]);
  const [householdNumber, setHouseholdNumber] = useState("");
  const [addressSearchInput, setAddressSearchInput] = useState("");
  const [addressSearch, setAddressSearch] = useState("");
  const [householdPage, setHouseholdPage] = useState(0);
  const [householdHasNextPage, setHouseholdHasNextPage] = useState(false);
  const [memberNameInput, setMemberNameInput] = useState("");
  const [memberName, setMemberName] = useState("");
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
  const [openHhqHouseholdIds, setOpenHhqHouseholdIds] = useState(null);
  const [openHhqIdsLoading, setOpenHhqIdsLoading] = useState(isFieldWorker(user));
  const [openHhqIdsReloadKey, setOpenHhqIdsReloadKey] = useState(0);
  const householdRequestRef = useRef(0);
  const userKey = `${user?.id || user?.user_id || user?.username || ""}:${String(user?.role || "")}`;
  const hhqForm = getRuntimeFormByCode(HHQ_CODE);
  const showForm = mode === "new";
  const assignedLocalities = useMemo(() => {
    const assignedSites = getAssignedSites(user);
    const selectedSiteId = assignedSites.length === 1 ? assignedSites[0].value : null;
    return getAssignedLocalities(user, localities, selectedSiteId).map((choice) => ({
      locality_code: choice.value,
      locality_name: choice.text?.default || choice.value
    }));
  }, [user, localities]);

  useEffect(() => {
    const trimmed = addressSearchInput.trim();
    if (trimmed.length < FREE_TEXT_SEARCH_MIN_LENGTH) {
      setAddressSearch("");
      return undefined;
    }
    const timeout = setTimeout(() => setAddressSearch(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [addressSearchInput]);

  useEffect(() => {
    const trimmed = memberNameInput.trim();
    if (trimmed.length < FREE_TEXT_SEARCH_MIN_LENGTH) {
      setMemberName("");
      return undefined;
    }
    const timeout = setTimeout(() => setMemberName(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [memberNameInput]);

  function handleAddressSearchChange(value) {
    setAddressSearchInput(value);
    if (value.trim().length < FREE_TEXT_SEARCH_MIN_LENGTH) setAddressSearch("");
  }

  function handleMemberNameChange(value) {
    setMemberNameInput(value);
    if (value.trim().length < FREE_TEXT_SEARCH_MIN_LENGTH) setMemberName("");
  }

  useEffect(() => {
    let active = true;
    if (!isFieldWorker(user)) {
      setOpenHhqHouseholdIds(null);
      setOpenHhqIdsLoading(false);
      return () => {
        active = false;
      };
    }

    setOpenHhqHouseholdIds(null);
    setOpenHhqIdsLoading(true);
    listOpenHhqHouseholdIds()
      .then((ids) => {
        if (active) setOpenHhqHouseholdIds(ids);
      })
      .catch((error) => {
        // A field worker must never see an unscoped fallback after a local
        // task query failure. An empty allow-list is fail-closed.
        console.error("Unable to load open HHQ household IDs:", error);
        if (active) setOpenHhqHouseholdIds([]);
      })
      .finally(() => {
        if (active) setOpenHhqIdsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userKey, openHhqIdsReloadKey]);

  const refreshHouseholds = async () => {
    const requestId = ++householdRequestRef.current;
    const fieldWorker = isFieldWorker(user);
    if (fieldWorker && (openHhqIdsLoading || openHhqHouseholdIds === null)) {
      setHouseholdHasNextPage(false);
      setHouseholds([]);
      return;
    }
    try {
      await initializeHouseholdRepository();
      const rows = await listHouseholds({
        localityCode: selectedLocalityCode,
        localityCodes: selectedLocalityCodes,
        householdIds: fieldWorker ? openHhqHouseholdIds : null,
        householdNumber,
        address: addressSearch,
        limit: PAGE_SIZE + 1,
        offset: householdPage * PAGE_SIZE
      });
      if (requestId !== householdRequestRef.current) return;
      setHouseholdHasNextPage(rows.length > PAGE_SIZE);
      setHouseholds(rows.slice(0, PAGE_SIZE));
    } catch (error) {
      console.error("Unable to load households:", error);
      if (requestId === householdRequestRef.current) {
        setHouseholdHasNextPage(false);
        setHouseholds([]);
      }
    }
  };

  useEffect(() => {
    refreshHouseholds();
  }, [userKey, selectedLocalityCode, selectedLocalityCodes, householdNumber, addressSearch, householdPage, openHhqHouseholdIds, openHhqIdsLoading]);

  useEffect(() => {
    setHouseholdPage(0);
  }, [selectedLocalityCode, selectedLocalityCodes, householdNumber, addressSearch]);

  useEffect(() => {
    setMemberPage(0);
  }, [selectedLocalityCode, memberName, memberSex]);

  useEffect(() => {
    const allowedCodes = new Set(assignedLocalities.map((locality) => String(locality.locality_code)));
    setSelectedLocalityCodes((current) => current.filter((code) => allowedCodes.has(String(code))));
  }, [assignedLocalities]);

  useEffect(() => {
    let active = true;
    const hasMemberSearch =
      memberName || memberSex;

    async function runMemberSearch() {
      if (!hasMemberSearch) {
        setMemberResults([]);
        setMemberHasNextPage(false);
        return;
      }
      if (isFieldWorker(user) && (openHhqIdsLoading || openHhqHouseholdIds === null)) {
        setMemberResults([]);
        setMemberHasNextPage(false);
        return;
      }
      const rows = await searchHouseholdMembers({
        localityCode: selectedLocalityCode,
        localityCodes: selectedLocalityCodes,
        householdIds: isFieldWorker(user) ? openHhqHouseholdIds : null,
        name: memberName,
        householdNumber,
        address: addressSearch,
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
  }, [userKey, selectedLocalityCode, selectedLocalityCodes, householdNumber, addressSearch, memberName, memberSex, memberPage, openHhqHouseholdIds, openHhqIdsLoading]);

  function toggleLocalityFilter(localityCode) {
    setSelectedLocalityCodes((current) => {
      const code = String(localityCode || "");
      if (!code) return [];
      return current.includes(code)
        ? current.filter((value) => value !== code)
        : [...current, code];
    });
  }

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
      if (isFieldWorker(user)) setOpenHhqIdsReloadKey((key) => key + 1);
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
        taskContext={taskContext}
        preferredDraftId={draftId}
        onClose={() => navigateTo(ROUTES.households)}
        onDraftSaved={onDraftSaved}
        onManualDraftSaved={() => navigateTo(ROUTES.worklist, { replace: true })}
        onSaved={() => {
          navigateTo(ROUTES.completedForms);
        }}
      />
    );
  }

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={[styles.toolbar, compact && styles.toolbarCompact]}>
        <View>
          <Text style={[styles.title, compact && styles.titleCompact]}>Households</Text>
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
        <View style={[styles.filterRow, compact && styles.filterRowCompact]}>
          <LocalityFilterDropdown
            localities={assignedLocalities}
            selectedCodes={selectedLocalityCodes}
            onToggle={toggleLocalityFilter}
            onClear={() => setSelectedLocalityCodes([])}
            compact={compact}
          />
          <TextInput
            value={householdNumber}
            onChangeText={setHouseholdNumber}
            placeholder="HH No"
            style={[styles.search, styles.householdNumberFilterInput]}
          />
          <TextInput
            value={addressSearchInput}
            onChangeText={handleAddressSearchChange}
            placeholder="Addr"
            style={[styles.search, styles.addressFilterInput]}
          />
          <TextInput
            value={memberNameInput}
            onChangeText={handleMemberNameChange}
            placeholder="Name"
            style={[styles.search, styles.memberNameFilterInput]}
          />
          <SexFilterDropdown value={memberSex} onChange={setMemberSex} compact={compact} />
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
        {compact ? (
          <ScrollView style={styles.compactHouseholdRows}>
            {households.map((household) => {
              const localityLabel = `${formatSite(household.site_id)} · ${household.locality_name || household.locality_code}`;
              const details = [household.household_head_name, household.address].filter(Boolean).join(" · ");
              return (
                <Pressable
                  key={household.household_id}
                  onPress={() => openHouseholdPanel(household)}
                  style={styles.compactHouseholdRow}
                >
                  <View style={styles.compactHouseholdMain}>
                    <Text style={styles.compactHouseholdId}>
                      {household.structure_number}-{household.household_number}
                    </Text>
                    <Text style={styles.compactHouseholdMeta} numberOfLines={1}>
                      {localityLabel}
                    </Text>
                    {details ? (
                      <Text style={styles.compactHouseholdDetails} numberOfLines={1}>
                        {details}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.compactHouseholdOpen}>View</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <>
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
          </>
        )}
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

function LocalityFilterDropdown({ localities = [], selectedCodes = [], onToggle, onClear, compact }) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(selectedCodes.map((code) => String(code)));
  const selectedLabel =
    selectedCodes.length === 0
      ? "Locality"
      : selectedCodes.length === 1
        ? localities.find((locality) => String(locality.locality_code) === selectedCodes[0])?.locality_name ||
          selectedCodes[0]
        : `${selectedCodes.length} localities`;

  return (
    <View style={[styles.localityDropdownWrap, compact && styles.localityDropdownWrapCompact]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Locality filter"
        onPress={() => setOpen((current) => !current)}
        style={[styles.dropdownButton, open && styles.dropdownButtonActive]}
      >
        <Text
          style={[styles.dropdownButtonText, selectedCodes.length === 0 && styles.dropdownPlaceholderText]}
          numberOfLines={1}
        >
          {selectedLabel}
        </Text>
        <View style={[styles.dropdownChevronIcon, open && styles.dropdownChevronIconOpen]} />
      </Pressable>
      {open ? (
        <>
          <Pressable
            accessibilityLabel="Close locality filter"
            onPress={() => setOpen(false)}
            style={styles.dropdownDismissLayer}
          />
          <View style={styles.localityDropdownMenu}>
            <Pressable
              accessibilityRole="button"
              onPress={onClear}
              style={[styles.dropdownOption, selectedCodes.length === 0 && styles.dropdownOptionActive]}
            >
              <Text
                style={[
                  styles.dropdownOptionText,
                  selectedCodes.length === 0 && styles.dropdownOptionTextActive
                ]}
              >
                All localities
              </Text>
            </Pressable>
            <ScrollView style={styles.localityDropdownList}>
              {localities.length ? (
                localities.map((locality) => {
                  const code = String(locality.locality_code || "");
                  const selected = selectedSet.has(code);
                  return (
                    <Pressable
                      key={code}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      onPress={() => onToggle(code)}
                      style={[styles.localityDropdownOption, selected && styles.dropdownOptionActive]}
                    >
                      <Text style={[styles.checkboxMark, selected && styles.checkboxMarkActive]}>
                        {selected ? "[x]" : "[ ]"}
                      </Text>
                      <Text
                        style={[styles.dropdownOptionText, selected && styles.dropdownOptionTextActive]}
                        numberOfLines={1}
                      >
                        {locality.locality_name || code}
                      </Text>
                    </Pressable>
                  );
                })
              ) : (
                <Text style={styles.emptyDropdownText}>No localities synced</Text>
              )}
            </ScrollView>
          </View>
        </>
      ) : null}
    </View>
  );
}

function SexFilterDropdown({ value, onChange, compact }) {
  const [open, setOpen] = useState(false);
  const options = [
    ["", "Sex"],
    ["1", "Male"],
    ["2", "Female"],
    ["other", "Other"]
  ];
  const selectedLabel = options.find(([optionValue]) => optionValue === value)?.[1] || "Sex";

  function selectSex(optionValue) {
    onChange(optionValue);
    setOpen(false);
  }

  return (
    <View style={[styles.dropdownWrap, compact && styles.compactFilterInput]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sex filter"
        onPress={() => setOpen((current) => !current)}
        style={[styles.dropdownButton, open && styles.dropdownButtonActive]}
      >
        <Text style={[styles.dropdownButtonText, !value && styles.dropdownPlaceholderText]}>
          {selectedLabel}
        </Text>
        <View style={[styles.dropdownChevronIcon, open && styles.dropdownChevronIconOpen]} />
      </Pressable>
      {open ? (
        <>
          <Pressable
            accessibilityLabel="Close sex filter"
            onPress={() => setOpen(false)}
            style={styles.dropdownDismissLayer}
          />
          <View style={styles.dropdownMenu}>
            {options.map(([optionValue, label]) => {
              const selected = optionValue === value;
              return (
                <Pressable
                  key={optionValue || "any"}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => selectSex(optionValue)}
                  style={[styles.dropdownOption, selected && styles.dropdownOptionActive]}
                >
                  <Text style={[styles.dropdownOptionText, selected && styles.dropdownOptionTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
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

  const summaryRows = [
    ["Household ID", household.household_id],
    ["Head Name", household.household_head_name],
    ["Site", household.site_id],
    ["Locality", formatLocalityLabel(household.locality_name, household.locality_code)],
    ["Structure Serial No", household.structure_number],
    ["Household Number", household.household_number],
    ["Address", household.address, true],
    ["HOH mobile", household.mobile_number],
    ["Consent", household.consent_status],
    ["Interview Date", household.interview_date],
    ["Sync Status", household.sync_status],
  ];

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
          <View style={styles.summaryGrid}>
            {summaryRows.map(([label, value, fullWidth]) => (
              <View
                key={label}
                style={[styles.summaryItem, fullWidth && styles.summaryItemFull]}
              >
                <Text style={styles.summaryLabel}>{label}</Text>
                <Text selectable style={styles.summaryValue}>
                  {value === undefined || value === null || value === "" ? "-" : String(value)}
                </Text>
              </View>
            ))}
          </View>
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

function formatLocalityLabel(name, code) {
  const localityName = String(name || "").trim();
  const localityCode = String(code || "").trim();
  if (!localityName) return localityCode;
  if (!localityCode || localityName === localityCode) return localityName;
  return `${localityName} ${localityCode}`;
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
  if (Number(member.woman_questionnaire_eligible) === 1) return "BWQ eligible";
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
    gap: 12,
    padding: 22,
    minHeight: "calc(100vh - 76px)"
  },
  wrapCompact: {
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 8,
    minHeight: "100%"
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16
  },
  toolbarCompact: {
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6
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
  titleCompact: {
    fontSize: 22
  },
  subtle: {
    fontSize: 13,
    color: "#667085"
  },
  panel: {
    gap: 6,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
    position: "relative",
    zIndex: 50
  },
  search: {
    minHeight: 34,
    borderWidth: 1,
    borderColor: "#d8dee4",
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 12,
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
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6
  },
  filterRowCompact: {
    alignItems: "center"
  },
  localityDropdownWrap: {
    width: 84,
    maxWidth: "100%",
    minHeight: 34,
    position: "relative",
    zIndex: 40
  },
  localityDropdownWrapCompact: {
    width: 84
  },
  householdNumberFilterInput: {
    width: 62,
    maxWidth: "100%"
  },
  addressFilterInput: {
    width: 60,
    maxWidth: "100%"
  },
  memberNameFilterInput: {
    width: 72,
    maxWidth: "100%"
  },
  dropdownWrap: {
    width: 62,
    maxWidth: "100%",
    minHeight: 34,
    position: "relative",
    zIndex: 20
  },
  compactFilterInput: {
    width: 62
  },
  dropdownButton: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff"
  },
  dropdownButtonActive: {
    borderColor: "#1f6feb",
    backgroundColor: "#f8fafc"
  },
  dropdownButtonText: {
    flex: 1,
    fontSize: 12,
    color: "#18202a",
    fontWeight: "800"
  },
  dropdownPlaceholderText: {
    color: "#475467",
    fontWeight: "700"
  },
  dropdownChevronIcon: {
    width: 9,
    height: 9,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: "#667085",
    transform: [{ rotate: "45deg" }],
    marginBottom: 4
  },
  dropdownChevronIconOpen: {
    transform: [{ rotate: "225deg" }],
    marginTop: 4,
    marginBottom: 0
  },
  dropdownMenu: {
    position: "absolute",
    top: 38,
    left: 0,
    right: 0,
    zIndex: 30,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
    overflow: "hidden"
  },
  localityDropdownMenu: {
    position: "absolute",
    top: 38,
    left: 0,
    width: 260,
    zIndex: 60,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
    overflow: "hidden"
  },
  dropdownDismissLayer: {
    ...(Platform.OS === "web"
      ? {
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0
        }
      : {
          position: "absolute",
          top: -1000,
          right: -1000,
          bottom: -1000,
          left: -1000
        }),
    zIndex: 55
  },
  localityDropdownList: {
    maxHeight: 190
  },
  dropdownOption: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: "#eef2f5"
  },
  dropdownOptionActive: {
    backgroundColor: "#eef6ff"
  },
  dropdownOptionText: {
    fontSize: 13,
    color: "#475467",
    fontWeight: "700"
  },
  dropdownOptionTextActive: {
    color: "#1f6feb"
  },
  localityDropdownOption: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: "#eef2f5"
  },
  checkboxMark: {
    width: 28,
    fontSize: 12,
    color: "#667085",
    fontWeight: "800",
    fontVariant: ["tabular-nums"]
  },
  checkboxMarkActive: {
    color: "#1f6feb"
  },
  emptyDropdownText: {
    padding: 12,
    fontSize: 13,
    color: "#667085",
    fontWeight: "700"
  },
  memberResults: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
    overflow: "hidden",
    zIndex: 1
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
    overflow: "hidden",
    zIndex: 1
  },
  rows: {
    maxHeight: 280
  },
  compactHouseholdRows: {
    maxHeight: 360
  },
  compactHouseholdRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#eef2f5",
    backgroundColor: "#ffffff"
  },
  compactHouseholdMain: {
    flex: 1,
    minWidth: 0
  },
  compactHouseholdId: {
    fontSize: 14,
    color: "#1f6feb",
    fontWeight: "800"
  },
  compactHouseholdMeta: {
    marginTop: 2,
    fontSize: 12,
    color: "#475467",
    fontWeight: "700"
  },
  compactHouseholdDetails: {
    marginTop: 2,
    fontSize: 12,
    color: "#667085"
  },
  compactHouseholdOpen: {
    fontSize: 12,
    color: "#1f6feb",
    fontWeight: "800"
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
    position: Platform.OS === "web" ? "fixed" : "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
    elevation: 24,
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
    padding: 10,
    borderLeftWidth: 0,
    height: "100%"
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
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#f8fafc"
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  summaryItem: {
    flexGrow: 1,
    flexBasis: "46%",
    minWidth: 130
  },
  summaryItemFull: {
    flexBasis: "100%"
  },
  summaryLabel: {
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
