import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { buildFieldWorkerProfile } from "./profileData.js";

function formatRole(role) {
  return String(role || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Field Worker";
}

export function FieldWorkerProfileScreen({ user, localities }) {
  const profile = buildFieldWorkerProfile(user, localities);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Field Worker Profile</Text>
        <Text style={styles.subtitle}>{profile.display_name}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Worker</Text>
        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Text style={styles.label}>Username</Text>
            <Text style={styles.value}>{profile.username || "-"}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.label}>Role</Text>
            <Text style={styles.value}>{formatRole(profile.role)}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.label}>Site</Text>
            <Text style={styles.value}>{profile.site_name || profile.site_id || "-"}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Assigned Localities</Text>
        {profile.active_assignments.length > 0 ? (
          <View style={styles.assignmentList}>
            {profile.active_assignments.map((assignment) => (
              <View
                key={`${assignment.site_id}-${assignment.locality_code}`}
                style={styles.assignmentRow}
              >
                <View style={styles.assignmentMain}>
                  <Text style={styles.assignmentName}>{assignment.locality_name}</Text>
                  <Text style={styles.assignmentMeta}>
                    {`${assignment.site_name || "Site"} · ${assignment.locality_code}`}
                  </Text>
                </View>
                <View style={styles.assignmentDates}>
                  <Text style={styles.dateLabel}>Active</Text>
                  <Text style={styles.dateValue}>
                    {assignment.active_to ? `until ${assignment.active_to}` : "current"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No active locality assignments found.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#eef2f5"
  },
  content: {
    paddingHorizontal: 24,
    paddingVertical: 22,
    gap: 18
  },
  header: {
    marginBottom: 4
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#18202a"
  },
  subtitle: {
    marginTop: 4,
    fontSize: 16,
    color: "#667085",
    fontWeight: "600"
  },
  section: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d8dee4",
    borderRadius: 8,
    padding: 18
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#475467",
    textTransform: "uppercase",
    marginBottom: 14
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  infoItem: {
    minWidth: 180,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#edf0f3",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#f8fafc"
  },
  label: {
    fontSize: 12,
    color: "#667085",
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 4
  },
  value: {
    fontSize: 16,
    color: "#18202a",
    fontWeight: "700"
  },
  assignmentList: {
    gap: 10
  },
  assignmentRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    borderWidth: 1,
    borderColor: "#edf0f3",
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#ffffff"
  },
  assignmentMain: {
    flexShrink: 1
  },
  assignmentName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#18202a"
  },
  assignmentMeta: {
    marginTop: 4,
    fontSize: 14,
    color: "#667085",
    fontWeight: "600"
  },
  assignmentDates: {
    alignItems: "flex-end",
    minWidth: 90
  },
  dateLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    color: "#667085",
    fontWeight: "800"
  },
  dateValue: {
    marginTop: 4,
    fontSize: 14,
    color: "#116329",
    fontWeight: "800"
  },
  emptyBox: {
    borderWidth: 1,
    borderColor: "#d8dee4",
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: "#f8fafc"
  },
  emptyText: {
    color: "#667085",
    fontWeight: "600"
  }
});
