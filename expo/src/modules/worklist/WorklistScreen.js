import React, { useEffect, useState } from "react";
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
} from "react-native";
import * as syncService from "../sync/syncService.js";
import { listTaskWorklist } from "./taskWorklistRepository.js";
import { buildTaskLocalityOptions, filterTaskWorklist } from "./taskWorklist.js";
import { getTaskOpenBlockReason } from "./taskOpenPolicy.js";

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

function groupTasksByUrgency(tasks) {
  const today = new Date().toISOString().split("T")[0];

  const groups = {
    overdue: [],
    today: [],
    upcoming: [],
  };

  for (const task of tasks) {
    if (task.status === "completed" || task.status === "missed") continue;

    if (task.target_date < today) {
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
  filteredCount,
  totalCount,
}) {
  const [localityDropdownOpen, setLocalityDropdownOpen] = useState(false);
  const selectedLocality = localityOptions.find((option) => option.code === localityFilter);
  const selectedLocalityLabel = selectedLocality?.label || "All localities";
  const localityChoices = [{ code: "", label: "All localities" }, ...localityOptions];

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
      <View style={styles.localityDropdownWrap}>
        <Pressable
          onPress={() => setLocalityDropdownOpen((isOpen) => !isOpen)}
          style={styles.localityDropdownButton}
        >
          <Text style={styles.localityDropdownLabel} numberOfLines={1}>
            {selectedLocalityLabel}
          </Text>
          <Text style={styles.localityDropdownIcon}>v</Text>
        </Pressable>
        {localityDropdownOpen && (
          <View style={styles.localityDropdownMenu}>
            <ScrollView
              style={styles.localityDropdownList}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {localityChoices.map((option) => {
                const isActive = localityFilter === option.code;
                return (
                  <Pressable
                    key={option.code || "all-localities"}
                    onPress={() => {
                      onLocalityFilterChange(option.code);
                      setLocalityDropdownOpen(false);
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
      <Text style={styles.filterCount}>
        Showing {filteredCount} of {totalCount} tasks
      </Text>
    </View>
  );
}

function TaskRow({ task, onPress, onLongPress }) {
  const isDisabled = Boolean(getTaskOpenBlockReason(task));
  const badgeColor = BADGE_COLORS[task.task_type] || "#95a5a6";

  return (
    <Pressable
      onPress={() => onPress(task)}
      onLongPress={() => onLongPress && onLongPress(task)}
      style={({ pressed }) => [
        styles.taskRow,
        pressed && styles.taskRowPressed,
        isDisabled && styles.taskRowDisabled,
      ]}
    >
      <View style={styles.taskContent}>
        <View style={styles.taskHeader}>
          <View style={[styles.taskTypeBadge, { backgroundColor: badgeColor }]}>
            <Text style={styles.taskTypeBadgeText}>{task.task_type}</Text>
          </View>
          {isDisabled && <Text style={styles.lockIcon}>🔒</Text>}
        </View>
        <Text style={styles.taskSubjectName} numberOfLines={1}>
          {task.subject_name || task.household_id}
        </Text>
        <Text style={styles.taskDate}>{task.target_date}</Text>
        {task.status === "completed" && (
          <View style={styles.completedBadge}>
            <Text style={styles.completedBadgeText}>Completed</Text>
          </View>
        )}
      </View>
    </Pressable>
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

  useEffect(() => {
    loadTasks();
  }, [selectedLocalityCode, worklistRevision]);

  useEffect(() => {
    setLocalityFilter(selectedLocalityCode || "");
  }, [selectedLocalityCode]);

  function loadTasks() {
    setLoading(true);
    try {
      const allTasks = listTaskWorklist({
        locality_code: selectedLocalityCode || undefined,
      });
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
      loadTasks();
    } catch (error) {
      console.error("Sync error:", error);
      setSyncError(`Sync failed: ${error.message}`);
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

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.loadingText}>Loading tasks...</Text>
      </View>
    );
  }

  const localityOptions = buildTaskLocalityOptions(tasks, localities);
  const filteredTasks = filterTaskWorklist(tasks, {
    search: searchText,
    locality_code: localityFilter,
  });
  const grouped = groupTasksByUrgency(filteredTasks);
  const hasAnyTasks =
    grouped.overdue.length > 0 || grouped.today.length > 0 || grouped.upcoming.length > 0;
  const filterPanel = (
    <WorklistFilters
      searchText={searchText}
      onSearchTextChange={setSearchText}
      localityFilter={localityFilter}
      onLocalityFilterChange={setLocalityFilter}
      localityOptions={localityOptions}
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

  const sections = [];

  if (grouped.overdue.length > 0) {
    sections.push({
      id: "overdue-header",
      type: "header",
      title: "Overdue",
    });
    grouped.overdue.forEach((task) => {
      sections.push({
        id: task.id,
        type: "task",
        task,
      });
    });
  }

  if (grouped.today.length > 0) {
    sections.push({
      id: "today-header",
      type: "header",
      title: "Today",
    });
    grouped.today.forEach((task) => {
      sections.push({
        id: task.id,
        type: "task",
        task,
      });
    });
  }

  if (grouped.upcoming.length > 0) {
    sections.push({
      id: "upcoming-header",
      type: "header",
      title: "Upcoming",
    });
    grouped.upcoming.forEach((task) => {
      sections.push({
        id: task.id,
        type: "task",
        task,
      });
    });
  }

  function renderWorklistItem(item) {
    if (item.type === "header") {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{item.title}</Text>
        </View>
      );
    }
    return <TaskRow task={item.task} onPress={handleTaskPress} />;
  }

  if (Platform.OS === "web") {
    return (
      <ScrollView
        style={styles.webTaskScroll}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {filterPanel}
        {sections.map((item) => (
          <React.Fragment key={item.id}>{renderWorklistItem(item)}</React.Fragment>
        ))}
        {syncError && (
          <View style={styles.centerContainer}>
            <Text style={styles.errorText}>{syncError}</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.fixedFilterHeader}>{filterPanel}</View>
      <FlatList
        style={styles.taskList}
        data={sections}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        renderItem={({ item }) => renderWorklistItem(item)}
        ListEmptyComponent={
          syncError ? (
            <View style={styles.centerContainer}>
              <Text style={styles.errorText}>{syncError}</Text>
            </View>
          ) : null
        }
        contentContainerStyle={styles.taskListContent}
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
    padding: 10,
    marginBottom: 8,
    zIndex: 30,
    elevation: 20,
  },
  searchInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#cfd7e3",
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 15,
    color: "#18202a",
    backgroundColor: "#ffffff",
  },
  localityDropdownButton: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#cfd7e3",
    borderRadius: 6,
    paddingHorizontal: 12,
    marginTop: 8,
    marginBottom: 6,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  localityDropdownWrap: {
    position: "relative",
    zIndex: 40,
    elevation: 24,
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
    marginBottom: 8,
    overflow: "hidden",
  },
  localityDropdownList: {
    maxHeight: 220,
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
    paddingVertical: 12,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 16,
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
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
  },
  taskRowPressed: {
    backgroundColor: "#f5f5f5",
    borderColor: "#3498db",
  },
  taskRowDisabled: {
    opacity: 0.7,
  },
  taskContent: {
    flex: 1,
  },
  taskHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  taskTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  taskTypeBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
  },
  lockIcon: {
    fontSize: 14,
    marginLeft: "auto",
  },
  taskSubjectName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#18202a",
    marginBottom: 4,
  },
  taskDate: {
    fontSize: 13,
    color: "#666",
    marginBottom: 4,
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
});
