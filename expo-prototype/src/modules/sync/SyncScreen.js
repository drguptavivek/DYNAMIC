import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import * as syncService from "../sync/syncService.js";
import * as eventOutbox from "../events/eventOutbox.js";
import * as taskRepository from "../tasks/taskRepository.js";
import { formatSyncCompletionMessage, summarizePendingSyncData } from "./syncWorkflow.js";

export function SyncScreen() {
  const [lastSync, setLastSync] = useState(null);
  const [pendingSummary, setPendingSummary] = useState({
    responses: 0,
    events: 0,
    total: 0,
  });
  const [localities, setLocalities] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);
  const [syncError, setSyncError] = useState(null);

  useEffect(() => {
    loadSyncInfo();
  }, []);

  function loadSyncInfo() {
    try {
      const lastSyncAt = syncService.getLastSyncAt();
      setLastSync(lastSyncAt);

      const assigned = syncService.getAssignedLocalities();
      setLocalities(assigned);

      const pendingResponses = taskRepository.getPendingResponses();
      const pendingEvents = eventOutbox.getPendingEvents();
      setPendingSummary(
        summarizePendingSyncData({
          formResponses: pendingResponses,
          domainEvents: pendingEvents,
        }),
      );
    } catch (error) {
      console.error("Error loading sync info:", error);
      setSyncError(`Failed to load sync info: ${error.message}`);
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    setSyncMessage(null);
    setSyncError(null);

    try {
      const result = await syncService.syncAll();
      setSyncMessage(formatSyncCompletionMessage(result));
      loadSyncInfo();
    } catch (error) {
      console.error("Sync error:", error);
      setSyncError(`Sync failed: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  }

  const lastSyncDisplay = lastSync ? new Date(lastSync).toLocaleString() : "Never";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Last Sync</Text>
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>Last synced at:</Text>
          <Text style={styles.infoValue}>{lastSyncDisplay}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pending Data</Text>
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>Responses waiting to sync:</Text>
          <Text
            style={[
              styles.infoValue,
              { color: pendingSummary.responses > 0 ? "#e74c3c" : "#2ecc71" },
            ]}
          >
            {pendingSummary.responses}
          </Text>
          <Text style={[styles.infoLabel, { marginTop: 10 }]}>Events waiting to sync:</Text>
          <Text
            style={[styles.infoValue, { color: pendingSummary.events > 0 ? "#e74c3c" : "#2ecc71" }]}
          >
            {pendingSummary.events}
          </Text>
          <Text style={[styles.infoLabel, { marginTop: 10 }]}>Total pending records:</Text>
          <Text
            style={[styles.infoValue, { color: pendingSummary.total > 0 ? "#e74c3c" : "#2ecc71" }]}
          >
            {pendingSummary.total}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Assigned Areas</Text>
        <View style={styles.infoBox}>
          {localities.length > 0 ? (
            <View>
              <Text style={styles.infoLabel}>Localities:</Text>
              {localities.map((code, idx) => (
                <Text key={idx} style={styles.localityBadge}>
                  {code}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={styles.infoLabel}>No assigned localities</Text>
          )}
        </View>
      </View>

      {syncError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {syncError}</Text>
        </View>
      )}

      {syncMessage && (
        <View style={styles.successBox}>
          <Text style={styles.successText}>✓ {syncMessage}</Text>
        </View>
      )}

      <Pressable
        onPress={handleSyncNow}
        disabled={syncing}
        style={({ pressed }) => [
          styles.syncButton,
          (pressed || syncing) && styles.syncButtonPressed,
        ]}
      >
        {syncing ? (
          <>
            <ActivityIndicator color="#ffffff" size="small" />
            <Text style={styles.syncButtonText}>Syncing...</Text>
          </>
        ) : (
          <Text style={styles.syncButtonText}>Sync Now</Text>
        )}
      </Pressable>

      <View style={styles.infoSection}>
        <Text style={styles.infoSectionText}>
          Sync checks for new tasks and sends pending form responses to the server.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#eef2f5",
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#18202a",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoBox: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#18202a",
    marginTop: 2,
  },
  localityBadge: {
    fontSize: 14,
    color: "#18202a",
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#f0f0f0",
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  errorBox: {
    backgroundColor: "#fdd",
    borderLeftWidth: 4,
    borderLeftColor: "#e74c3c",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: "#c0392b",
    fontWeight: "500",
  },
  successBox: {
    backgroundColor: "#dfd",
    borderLeftWidth: 4,
    borderLeftColor: "#2ecc71",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  successText: {
    fontSize: 14,
    color: "#27ae60",
    fontWeight: "500",
  },
  syncButton: {
    backgroundColor: "#3498db",
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    marginVertical: 24,
  },
  syncButtonPressed: {
    opacity: 0.7,
  },
  syncButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  infoSection: {
    backgroundColor: "#f0f8ff",
    borderLeftWidth: 3,
    borderLeftColor: "#3498db",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 20,
    marginBottom: 24,
  },
  infoSectionText: {
    fontSize: 13,
    color: "#18202a",
    lineHeight: 18,
  },
});
