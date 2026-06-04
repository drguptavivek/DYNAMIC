import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import * as taskRepository from "../tasks/taskRepository.js";
import * as syncService from "../sync/syncService.js";

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

function TaskRow({ task, onPress, onLongPress }) {
  const isDisabled = task.form_availability === "disabled";
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

export function WorklistScreen({ onOpenTask, syncService: syncServiceProp }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncError, setSyncError] = useState(null);

  useEffect(() => {
    loadTasks();
  }, []);

  function loadTasks() {
    setLoading(true);
    try {
      const allTasks = taskRepository.listTasks({ status: "open" });
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
    if (task.form_availability === "disabled") {
      Alert.alert(
        "Form Not Available",
        `${task.disabled_reason || "This form is not yet available"}`,
      );
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

  const grouped = groupTasksByUrgency(tasks);
  const hasAnyTasks =
    grouped.overdue.length > 0 || grouped.today.length > 0 || grouped.upcoming.length > 0;

  if (!hasAnyTasks) {
    return (
      <FlatList
        data={[]}
        renderItem={() => null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>No open tasks</Text>
            {syncError && <Text style={styles.errorText}>{syncError}</Text>}
          </View>
        }
      />
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

  return (
    <FlatList
      data={sections}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      renderItem={({ item }) => {
        if (item.type === "header") {
          return (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{item.title}</Text>
            </View>
          );
        }
        return <TaskRow task={item.task} onPress={handleTaskPress} />;
      }}
      ListEmptyComponent={
        syncError ? (
          <View style={styles.centerContainer}>
            <Text style={styles.errorText}>{syncError}</Text>
          </View>
        ) : null
      }
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
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
