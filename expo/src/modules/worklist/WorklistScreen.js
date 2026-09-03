import { getFormDisplayCode } from "../../lib/formDisplayCodes.js";
import { describeNetworkError } from "../../lib/networkErrors.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as syncService from "../sync/syncService.js";
import { listTaskWorklistCandidates } from "./taskWorklistRepository.js";
import { buildTaskLocalityOptions, filterTaskWorklist, getTaskStage } from "./taskWorklist.js";
import { buildTaskTypeOptions, filterTasksByType } from "./taskTypeFilter.js";
import { getTaskOpenBlockReason } from "./taskOpenPolicy.js";
import {
  getHouseholdMemberCountSync,
  getHouseholdSync,
  getHouseholdsByIdsSync,
} from "../../lib/householdSync.js";
import { listActiveQuestionnaireDraftSummaries } from "../questionnaires/questionnaireDraftRepository.js";
import { draftMatchesTask } from "../questionnaires/draftPendingForms.js";
import { useListPaging } from "../../lib/useListPaging.js";

const BADGE_COLORS = {
  HHQ: "#e74c3c",
  WQ: "#3498db",
  HRF: "#2ecc71",
  PEF: "#f39c12",
  PFF: "#9b59b6",
  NFF: "#1abc9c",
  VA: "#e67e22",
  POF: "#34495e",
  BAF: "#95a5a6",
  SBF: "#c0392b",
  CDF: "#16a085",
  UF: "#d35400",
};

const STAGE_FILTER_OPTIONS = [
  { value: "", label: "All stages" },
  { value: "outdated", label: "Outdated" },
  { value: "current", label: "Current" },
  { value: "upcoming", label: "Upcoming" },
  { value: "future_planned", label: "Future planned" },
  { value: "draft", label: "Draft" },
];

function groupTasksByUrgency(tasks, options = {}) {
  const { stageFilter = "" } = options;
  const today = new Date().toISOString().split("T")[0];

  const groups = {
    draft: [],
    overdue: [],
    today: [],
    upcoming: [],
    futurePlanned: [],
  };

  for (const task of tasks) {
    if (task.status === "completed" || task.status === "missed") continue;

    const stage = getTaskStage(task, today);
    const protocolDate = task.target_date || task.window_start || "";
    if (stageFilter === "outdated" && protocolDate && protocolDate < today) {
      groups.overdue.push({ ...task, worklist_display_stage: "outdated" });
    } else if (stage === "draft") {
      groups.draft.push(task);
    } else if (stage === "future_planned") {
      groups.futurePlanned.push(task);
    } else if (task.target_date < today) {
      groups.overdue.push(task);
    } else if (task.target_date === today) {
      groups.today.push(task);
    } else {
      groups.upcoming.push(task);
    }
  }

  return groups;
}

function WorklistFilters({
  searchText,
  onSearchTextChange,
  localityFilter,
  onLocalityFilterChange,
  localityOptions,
  stageFilter,
  onStageFilterChange,
  taskTypeFilter,
  onTaskTypeFilterChange,
  taskTypeOptions,
  filteredCount,
  totalCount,
}) {
  const localityButtonRef = useRef(null);
  const stageButtonRef = useRef(null);
  const typeButtonRef = useRef(null);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [dropdownAnchor, setDropdownAnchor] = useState(null);
  const selectedLocality = localityOptions.find((option) => option.code === localityFilter);
  const selectedLocalityLabel = selectedLocality?.label || "All localities";
  const localityChoices = [{ code: "", label: "All localities" }, ...localityOptions];
  const selectedStage =
    STAGE_FILTER_OPTIONS.find((option) => option.value === stageFilter) || STAGE_FILTER_OPTIONS[0];
  const typeChoices = [{ value: "", label: "All forms" }, ...taskTypeOptions];
  const selectedType = typeChoices.find((option) => option.value === taskTypeFilter) || typeChoices[0];

  function toggleDropdown(type, buttonRef) {
    if (openDropdown === type) {
      setOpenDropdown(null);
      setDropdownAnchor(null);
      return;
    }

    buttonRef.current?.measureInWindow((x, y, width, height) => {
      setDropdownAnchor({ x, y: y + height + 4, width });
      setOpenDropdown(type);
    });
  }

  const dropdownChoices =
    openDropdown === "locality"
      ? localityChoices
      : openDropdown === "type"
      ? typeChoices
      : STAGE_FILTER_OPTIONS;

  return (
    <View style={styles.filterPanel}>
      <TextInput
        value={searchText}
        onChangeText={onSearchTextChange}
        placeholder="Search household, subject, or task"
        placeholderTextColor="#7a8699"
        style={styles.searchInput}
        autoCapitalize="none"
      />
      <View style={styles.filterDropdownRow}>
      <View style={styles.localityDropdownWrap}>
        <Pressable
          ref={localityButtonRef}
          onPress={() => toggleDropdown("locality", localityButtonRef)}
          style={styles.localityDropdownButton}
        >
          <Text style={styles.localityDropdownLabel} numberOfLines={1}>
            {selectedLocalityLabel}
          </Text>
          <Text style={styles.localityDropdownIcon}>v</Text>
        </Pressable>
      </View>
      <View style={styles.localityDropdownWrap}>
        <Pressable
          ref={stageButtonRef}
          onPress={() => toggleDropdown("stage", stageButtonRef)}
          style={styles.localityDropdownButton}
        >
          <Text style={styles.localityDropdownLabel} numberOfLines={1}>
            {selectedStage.label}
          </Text>
          <Text style={styles.localityDropdownIcon}>v</Text>
        </Pressable>
      </View>
      <View style={styles.localityDropdownWrap}>
        <Pressable
          ref={typeButtonRef}
          onPress={() => toggleDropdown("type", typeButtonRef)}
          style={styles.localityDropdownButton}
        >
          <Text style={styles.localityDropdownLabel} numberOfLines={1}>
            {selectedType.label}
          </Text>
          <Text style={styles.localityDropdownIcon}>v</Text>
        </Pressable>
      </View>
      </View>
      <Text style={styles.filterCount}>
        Showing {filteredCount} of {totalCount} tasks
      </Text>

      <Modal
        visible={Boolean(openDropdown && dropdownAnchor)}
        transparent
        animationType="none"
        onRequestClose={() => setOpenDropdown(null)}
      >
        <View style={styles.dropdownOverlay}>
          <Pressable
            accessibilityLabel="Close filter options"
            style={StyleSheet.absoluteFill}
            onPress={() => setOpenDropdown(null)}
          />
          {dropdownAnchor && (
            <View
              style={[
                styles.localityDropdownMenu,
                styles.floatingDropdownMenu,
                {
                  left: dropdownAnchor.x,
                  top: dropdownAnchor.y,
                  width: dropdownAnchor.width,
                },
              ]}
            >
              <ScrollView
                style={
                  openDropdown === "stage"
                    ? styles.stageDropdownList
                    : styles.localityDropdownList
                }
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {dropdownChoices.map((option) => {
                  const optionValue = openDropdown === "locality" ? option.code : option.value;
                  const selectedValue =
                    openDropdown === "locality"
                      ? localityFilter
                      : openDropdown === "type"
                      ? taskTypeFilter
                      : stageFilter;
                  const isActive = selectedValue === optionValue;
                  return (
                    <Pressable
                      key={optionValue || `all-${openDropdown}`}
                      onPress={() => {
                        if (openDropdown === "locality") {
                          onLocalityFilterChange(optionValue);
                        } else if (openDropdown === "type") {
                          onTaskTypeFilterChange(optionValue);
                        } else {
                          onStageFilterChange(optionValue);
                        }
                        setOpenDropdown(null);
                        setDropdownAnchor(null);
                      }}
                      style={[
                        styles.localityDropdownOption,
                        isActive && styles.localityDropdownOptionActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.localityDropdownOptionText,
                          isActive && styles.localityDropdownOptionTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

function findDraftForTask(task, drafts = []) {
  return drafts.find((draft) => draftMatchesTask(draft, task));
}

function enrichTaskForWorklist(task, drafts = [], householdsById = null) {
  const household = task.household_id
    ? householdsById
      ? householdsById.get(task.household_id) || null
      : getHouseholdSync(task.household_id)
    : null;
  const activeDraft = findDraftForTask(task, drafts);
  return {
    ...task,
    household_head_name: household?.household_head_name || task.household_head_name || "",
    household_address: household?.address || task.household_address || task.address || "",
    household_locality_name: household?.locality_name || "",
    household_site_id: household?.site_id ?? task.assigned_site_id ?? task.site_id ?? "",
    household_locality_code: household?.locality_code || task.assigned_locality_code || "",
    household_structure_number: household?.structure_number || "",
    household_number: household?.household_number || "",
    household_mobile_number: household?.mobile_number || "",
    household_consent_status: household?.consent_status || "",
    household_interview_date: household?.interview_date || "",
    household_sync_status: household?.sync_status || "",
    active_draft_id: activeDraft?.draft_id || null,
    has_active_draft: Boolean(activeDraft),
  };
}

function formatLocalityLabel(name, code) {
  const localityName = String(name || "").trim();
  const localityCode = String(code || "").trim();
  if (!localityName) return localityCode;
  if (!localityCode || localityName === localityCode) return localityName;
  return `${localityName} ${localityCode}`;
}

function getTaskVisitNo(task) {
  const labelMatch = String(task?.protocol_visit_label || "").match(/visit-(\d+)/i);
  if (labelMatch) return Math.min(3, Math.max(1, Number(labelMatch[1])));
  const failedAttempts = Number(task?.failed_attempt_count);
  if (Number.isFinite(failedAttempts)) {
    return Math.min(3, Math.max(1, Math.trunc(failedAttempts) + 1));
  }
  return 1;
}

function DetailRow({ label, value, fullWidth, blankWhenEmpty }) {
  const isBlank = value === undefined || value === null || value === "";
  return (
    <View style={[styles.detailRow, fullWidth && styles.detailRowFull]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>
        {isBlank ? (blankWhenEmpty ? "" : "-") : String(value)}
      </Text>
    </View>
  );
}

function HouseholdDetailsModal({ household, visible, onClose }) {
  if (!household) return null;
  const memberCount = getHouseholdMemberCountSync(household.household_id);
  const memberCountValue = Number(memberCount) > 0 ? memberCount : "";
  const rows = [
    ["Household ID", household.household_id],
    ["Head Name", household.household_head_name],
    ["Address", household.household_address, true],
    ["Site", household.household_site_id],
    ["Locality", formatLocalityLabel(household.household_locality_name, household.household_locality_code)],
    ["Structure No", household.household_structure_number],
    ["Household No", household.household_number],
    ["Members Count", memberCountValue, false, true],
    ["Mobile", household.household_mobile_number],
    ["Consent", household.household_consent_status],
    ["Interview Date", household.household_interview_date],
    ["Sync Status", household.household_sync_status],
    ["Task Type", household.task_type],
    ["Task Date", household.target_date],
  ];

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.detailsLayer}>
        <Pressable accessibilityLabel="Close household details" style={styles.detailsScrim} onPress={onClose} />
        <View style={styles.detailsPanel}>
          <View style={styles.detailsHeader}>
            <Text style={styles.detailsTitle}>Household Details</Text>
            <Pressable accessibilityLabel="Close household details" onPress={onClose} style={styles.iconButton}>
              <MaterialCommunityIcons color="#344054" name="close" size={22} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.detailsGrid}>
            {rows.map(([label, value, fullWidth, blankWhenEmpty]) => (
              <DetailRow
                key={label}
                label={label}
                value={value}
                fullWidth={fullWidth}
                blankWhenEmpty={blankWhenEmpty}
              />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function TaskRow({ task, onPress, onLongPress, onViewHousehold }) {
  const isDisabled = Boolean(getTaskOpenBlockReason(task));
  const badgeColor = BADGE_COLORS[task.task_type] || "#95a5a6";
  const detailLine = task.household_address || "";
  const visitNo = getTaskVisitNo(task);
  const showVisitBadge = String(task.task_type || "").toUpperCase() === "HHQ";
  const isOutdatedDisplay = task.worklist_display_stage === "outdated";

  return (
    <View
      style={[
        styles.taskRow,
        task.has_active_draft && styles.taskRowDraft,
        isOutdatedDisplay && styles.taskRowOutdated,
        isDisabled && styles.taskRowDisabled,
      ]}
    >
      <Pressable
        onPress={() => onPress(task)}
        onLongPress={() => onLongPress && onLongPress(task)}
        style={({ pressed }) => [styles.taskBodyPressable, pressed && styles.taskRowPressed]}
      >
        <View style={styles.taskContent}>
        <View style={styles.taskHeader}>
          <View style={styles.taskTitleLine}>
            <View style={[styles.taskTypeBadge, { backgroundColor: badgeColor }]}>
              <Text style={styles.taskTypeBadgeText}>{getFormDisplayCode(task.task_type)}</Text>
            </View>
            {task.household_head_name ? (
              <Text style={styles.taskHeaderHeadName}>
                {task.household_head_name}
              </Text>
            ) : null}
          </View>
          <View style={styles.taskStatusBadges}>
            {task.has_active_draft ? (
              <View style={styles.draftBadge}>
                <MaterialCommunityIcons color="#92400e" name="content-save-edit-outline" size={15} />
                <Text style={styles.draftBadgeText}>Draft</Text>
              </View>
            ) : null}
            {showVisitBadge ? (
              <View style={styles.visitBadge}>
                <Text style={styles.visitBadgeLabel}>Visit</Text>
                <Text style={styles.visitBadgeNumber}>{visitNo}</Text>
              </View>
            ) : null}
            {isDisabled && <Text style={styles.lockIcon}>🔒</Text>}
            </View>
        </View>
        <Text style={styles.taskSubjectName} numberOfLines={1}>
          {task.household_id || task.subject_name}
        </Text>
        {detailLine ? (
          <Text style={styles.taskHouseholdDetails}>
            {detailLine}
          </Text>
        ) : null}
        <Text style={styles.taskDate}>{`Target Date: ${task.target_date || "-"}`}</Text>
        {task.status === "completed" && (
          <View style={styles.completedBadge}>
            <Text style={styles.completedBadgeText}>Completed</Text>
          </View>
        )}
        </View>
      </Pressable>
      <Pressable
        accessibilityLabel={`View household ${task.household_id}`}
        onPress={() => onViewHousehold?.(task)}
        style={styles.eyeButton}
      >
        <MaterialCommunityIcons color="#344054" name="eye-outline" size={21} />
      </Pressable>
    </View>
  );
}

export function WorklistScreen({
  onOpenTask,
  localities = [],
  syncService: syncServiceProp,
  selectedLocalityCode,
  worklistRevision,
}) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [localityFilter, setLocalityFilter] = useState(selectedLocalityCode || "");
  const [stageFilter, setStageFilter] = useState("");
  const [taskTypeFilter, setTaskTypeFilter] = useState("");
  const [selectedHouseholdTask, setSelectedHouseholdTask] = useState(null);

  useEffect(() => {
    loadTasks();
  }, [selectedLocalityCode, worklistRevision]);

  useEffect(() => {
    setLocalityFilter(selectedLocalityCode || "");
  }, [selectedLocalityCode]);

  async function loadTasks() {
    setLoading(true);
    try {
      const activeDrafts = await listActiveQuestionnaireDraftSummaries();
      const candidateTasks = listTaskWorklistCandidates({
        locality_code: selectedLocalityCode || undefined,
      });
      const householdsById = getHouseholdsByIdsSync(
        candidateTasks.map((task) => task.household_id)
      );
      const allTasks = candidateTasks.map((task) =>
        enrichTaskForWorklist(task, activeDrafts, householdsById)
      );
      setTasks(allTasks);
      setSyncError(null);
    } catch (error) {
      console.error("Error loading tasks:", error);
      setSyncError(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const syncSvc = syncServiceProp || syncService;
      await syncSvc.syncAll();
      await loadTasks();
    } catch (error) {
      console.error("Sync error:", error);
      setSyncError(describeNetworkError(error, { action: "Sync" }));
    } finally {
      setRefreshing(false);
    }
  }

  function handleTaskPress(task) {
    const blockReason = getTaskOpenBlockReason(task);
    if (blockReason) {
      Alert.alert("Form Not Available", blockReason);
      return;
    }
    onOpenTask(task);
  }

  const localityOptions = useMemo(
    () => buildTaskLocalityOptions(tasks, localities),
    [tasks, localities],
  );
  const taskTypeOptions = useMemo(() => buildTaskTypeOptions(tasks), [tasks]);
  const filteredTasks = useMemo(
    () =>
      filterTasksByType(
        filterTaskWorklist(tasks, {
          search: searchText,
          locality_code: localityFilter,
          stage: stageFilter,
        }),
        taskTypeFilter,
      ),
    [tasks, searchText, localityFilter, stageFilter, taskTypeFilter],
  );
  const grouped = useMemo(
    () => groupTasksByUrgency(filteredTasks, { stageFilter }),
    [filteredTasks, stageFilter],
  );

  const sections = useMemo(() => {
    const built = [];

    if (grouped.draft.length > 0) {
      built.push({ id: "draft-header", type: "header", title: "Draft" });
      grouped.draft.forEach((task) => {
        built.push({ id: task.id, type: "task", task });
      });
    }

    if (grouped.overdue.length > 0) {
      built.push({ id: "overdue-header", type: "header", title: "Overdue" });
      grouped.overdue.forEach((task) => {
        built.push({ id: task.id, type: "task", task });
      });
    }

    if (grouped.today.length > 0) {
      built.push({ id: "today-header", type: "header", title: "Today" });
      grouped.today.forEach((task) => {
        built.push({ id: task.id, type: "task", task });
      });
    }

    if (grouped.upcoming.length > 0) {
      built.push({ id: "upcoming-header", type: "header", title: "Upcoming" });
      grouped.upcoming.forEach((task) => {
        built.push({ id: task.id, type: "task", task });
      });
    }

    if (grouped.futurePlanned.length > 0) {
      built.push({ id: "future-planned-header", type: "header", title: "Future Planned" });
      grouped.futurePlanned.forEach((task) => {
        built.push({ id: task.id, type: "task", task });
      });
    }

    return built;
  }, [grouped]);

  const { pagedItems: pagedSections, hasMore, showMore, shown, total } = useListPaging(sections);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.loadingText}>Loading tasks...</Text>
      </View>
    );
  }

  const hasAnyTasks =
    grouped.draft.length > 0 ||
    grouped.overdue.length > 0 ||
    grouped.today.length > 0 ||
    grouped.upcoming.length > 0 ||
    grouped.futurePlanned.length > 0;
  const filterPanel = (
    <WorklistFilters
      searchText={searchText}
      onSearchTextChange={setSearchText}
      localityFilter={localityFilter}
      onLocalityFilterChange={setLocalityFilter}
      localityOptions={localityOptions}
      stageFilter={stageFilter}
      onStageFilterChange={setStageFilter}
      taskTypeFilter={taskTypeFilter}
      onTaskTypeFilterChange={setTaskTypeFilter}
      taskTypeOptions={taskTypeOptions}
      filteredCount={filteredTasks.length}
      totalCount={tasks.length}
    />
  );

  if (!hasAnyTasks) {
    return (
      <View style={styles.screen}>
        <View style={styles.fixedFilterHeader}>{filterPanel}</View>
        <FlatList
          style={styles.taskList}
          data={[]}
          renderItem={() => null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>
                {tasks.length > 0 ? "No matching tasks" : "No open tasks"}
              </Text>
              {syncError && <Text style={styles.errorText}>{syncError}</Text>}
            </View>
          }
          contentContainerStyle={styles.taskListContent}
        />
      </View>
    );
  }

  function renderWorklistItem(item) {
    if (item.type === "header") {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{item.title}</Text>
        </View>
      );
    }
    return (
      <TaskRow
        task={item.task}
        onPress={handleTaskPress}
        onViewHousehold={setSelectedHouseholdTask}
      />
    );
  }

  const showMoreFooter = hasMore ? (
    <Pressable onPress={showMore} style={styles.showMoreButton}>
      <Text style={styles.showMoreText}>{`Show more (${shown} of ${total})`}</Text>
    </Pressable>
  ) : null;

  if (Platform.OS === "web") {
    return (
      <ScrollView
        style={styles.webTaskScroll}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {filterPanel}
        {pagedSections.map((item) => (
          <React.Fragment key={item.id}>{renderWorklistItem(item)}</React.Fragment>
        ))}
        {showMoreFooter}
        {syncError && (
          <View style={styles.centerContainer}>
            <Text style={styles.errorText}>{syncError}</Text>
          </View>
        )}
        <HouseholdDetailsModal
          visible={Boolean(selectedHouseholdTask)}
          household={selectedHouseholdTask}
          onClose={() => setSelectedHouseholdTask(null)}
        />
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.fixedFilterHeader}>{filterPanel}</View>
      <FlatList
        style={styles.taskList}
        data={pagedSections}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        renderItem={({ item }) => renderWorklistItem(item)}
        onEndReached={showMore}
        onEndReachedThreshold={0.5}
        initialNumToRender={20}
        windowSize={7}
        removeClippedSubviews
        ListFooterComponent={showMoreFooter}
        ListEmptyComponent={
          syncError ? (
            <View style={styles.centerContainer}>
              <Text style={styles.errorText}>{syncError}</Text>
            </View>
          ) : null
        }
        contentContainerStyle={styles.taskListContent}
      />
      <HouseholdDetailsModal
        visible={Boolean(selectedHouseholdTask)}
        household={selectedHouseholdTask}
        onClose={() => setSelectedHouseholdTask(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  webTaskScroll: {
    flex: 1,
  },
  fixedFilterHeader: {
    paddingHorizontal: 12,
    paddingTop: 8,
    zIndex: 20,
    elevation: 20,
  },
  taskList: {
    flex: 1,
  },
  taskListContent: {
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  filterPanel: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d8dee4",
    borderRadius: 8,
    padding: 7,
    marginBottom: 6,
    zIndex: 30,
    elevation: 20,
  },
  searchInput: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: "#cfd7e3",
    borderRadius: 6,
    paddingHorizontal: 9,
    fontSize: 13,
    color: "#18202a",
    backgroundColor: "#ffffff",
  },
  localityDropdownButton: {
    minHeight: 36,
    borderWidth: 1,
    borderColor: "#cfd7e3",
    borderRadius: 6,
    paddingHorizontal: 9,
    marginTop: 5,
    marginBottom: 4,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filterDropdownRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "flex-start",
  },
  localityDropdownWrap: {
    position: "relative",
    zIndex: 40,
    elevation: 24,
    flex: 1,
    minWidth: 110,
  },
  localityDropdownLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#344054",
  },
  localityDropdownIcon: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "700",
    color: "#344054",
  },
  localityDropdownMenu: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cfd7e3",
    overflow: "hidden",
  },
  dropdownOverlay: {
    flex: 1,
  },
  floatingDropdownMenu: {
    position: "absolute",
    zIndex: 1000,
    elevation: 30,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
  },
  localityDropdownList: {
    maxHeight: 220,
  },
  stageDropdownList: {
    maxHeight: 264,
  },
  localityDropdownOption: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f6",
  },
  localityDropdownOptionActive: {
    backgroundColor: "#e8f1ff",
  },
  localityDropdownOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#344054",
  },
  localityDropdownOptionTextActive: {
    color: "#0b5bd3",
  },
  filterCount: {
    fontSize: 12,
    fontWeight: "600",
    color: "#667085",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
  },
  emptyText: {
    fontSize: 18,
    color: "#999",
    fontWeight: "500",
  },
  errorText: {
    fontSize: 14,
    color: "#e74c3c",
    marginTop: 8,
    textAlign: "center",
  },
  sectionHeader: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  showMoreButton: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
    marginTop: 8,
    marginBottom: 8,
  },
  showMoreText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0b5bd3",
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#18202a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  taskRow: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    padding: 8,
    marginBottom: 5,
    flexDirection: "row",
    gap: 6,
  },
  taskRowDraft: {
    borderColor: "#f59e0b",
    backgroundColor: "#fffbeb",
  },
  taskRowOutdated: {
    borderColor: "#0284c7",
    backgroundColor: "#eff6ff",
  },
  taskBodyPressable: {
    flex: 1,
    minWidth: 0,
  },
  taskRowPressed: {
    backgroundColor: "#f5f5f5",
  },
  taskRowDisabled: {
    opacity: 0.7,
  },
  taskContent: {
    flex: 1,
    minWidth: 0,
  },
  taskHeader: {
    marginBottom: 3,
  },
  taskTitleLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    marginBottom: 4,
  },
  taskStatusBadges: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    alignSelf: "flex-end",
    flexWrap: "wrap",
  },
  taskTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  taskTypeBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
  },
  taskHeaderHeadName: {
    flex: 1,
    minWidth: 0,
    color: "#0b5bd3",
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "900",
  },
  draftBadge: {
    minHeight: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: "#fef3c7",
  },
  draftBadgeText: {
    color: "#92400e",
    fontSize: 10,
    fontWeight: "800",
  },
  visitBadge: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#0284c7",
    backgroundColor: "#e0f2fe",
  },
  visitBadgeLabel: {
    color: "#0369a1",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  visitBadgeNumber: {
    color: "#0c4a6e",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 22,
  },
  eyeButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderWidth: 1,
    borderColor: "#cfd7e3",
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  lockIcon: {
    fontSize: 14,
  },
  taskSubjectName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#18202a",
    marginBottom: 2,
  },
  taskHouseholdDetails: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475467",
    marginBottom: 2,
  },
  taskDate: {
    fontSize: 13,
    color: "#666",
    marginBottom: 2,
  },
  completedBadge: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#d4edda",
    borderRadius: 3,
    alignSelf: "flex-start",
  },
  completedBadgeText: {
    fontSize: 12,
    color: "#155724",
    fontWeight: "600",
  },
  detailsLayer: {
    flex: 1,
    justifyContent: "center",
    padding: 16,
  },
  detailsScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(16, 24, 40, 0.45)",
  },
  detailsPanel: {
    maxHeight: "82%",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  detailsHeader: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f5",
  },
  detailsTitle: {
    color: "#18202a",
    fontSize: 18,
    fontWeight: "800",
  },
  iconButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#f8fafc",
  },
  detailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    padding: 14,
  },
  detailRow: {
    width: "48%",
    gap: 3,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
  },
  detailRowFull: {
    width: "100%",
  },
  detailLabel: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  detailValue: {
    color: "#18202a",
    fontSize: 15,
    fontWeight: "600",
  },
});
