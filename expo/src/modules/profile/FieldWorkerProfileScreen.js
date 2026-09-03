import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";

import { buildFieldWorkerProfile } from "./profileData.js";
import { listTasks } from "../tasks/taskRepository.js";
import { useFieldApp } from "../../shell/FieldAppProvider.js";
import { buildTimingExport, clearTimings, listTimings, summarizeTimings } from "../../lib/perfLog.js";

function formatRole(role) {
  return String(role || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Field Worker";
}

export function FieldWorkerProfileScreen({ user, localities }) {
  const app = useFieldApp();
  const assignedLocalityCodes = useMemo(() => {
    try {
      return [
        ...new Set(
          listTasks({})
            .map((task) => String(task.assigned_locality_code || "").trim())
            .filter(Boolean),
        ),
      ].sort();
    } catch {
      return [];
    }
  }, [app.taskWorklistRevision]);
  const profile = buildFieldWorkerProfile(
    { ...user, assigned_locality_codes: assignedLocalityCodes },
    localities,
  );
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleChangePin() {
    if (pin !== confirmPin) {
      setError("PIN entries do not match");
      setMessage("");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    try {
      const result = await app.changeAppPinWithPassword(password, pin);
      if (!result.ok) {
        setError(result.error || "Could not change PIN");
        return;
      }
      setPassword("");
      setPin("");
      setConfirmPin("");
      setMessage("App PIN changed.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleBiometric() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const result = await app.setAppLockBiometricPreference(!app.appLockBiometricEnabled);
      if (!result.ok) {
        setError(result.error || "Could not update biometric unlock");
        return;
      }
      setMessage(result.enabled ? "Biometric unlock enabled." : "Biometric unlock disabled.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

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
        <Text style={styles.sectionTitle}>App PIN</Text>
        <TextInput
          style={styles.input}
          placeholder="Login password"
          value={password}
          onChangeText={setPassword}
          editable={!loading}
          secureTextEntry={true}
          placeholderTextColor="#999"
        />
        <TextInput
          style={styles.input}
          placeholder="New 4-8 digit PIN"
          value={pin}
          onChangeText={setPin}
          editable={!loading}
          keyboardType="number-pad"
          secureTextEntry={true}
          maxLength={8}
          placeholderTextColor="#999"
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm new PIN"
          value={confirmPin}
          onChangeText={setConfirmPin}
          editable={!loading}
          keyboardType="number-pad"
          secureTextEntry={true}
          maxLength={8}
          placeholderTextColor="#999"
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {message ? <Text style={styles.successText}>{message}</Text> : null}
        <Pressable
          onPress={handleChangePin}
          disabled={loading}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || loading) && styles.primaryButtonPressed,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>Change PIN</Text>
          )}
        </Pressable>
        {app.appLockBiometricAvailable ? (
          <View style={styles.biometricPanel}>
            <View style={styles.biometricTextGroup}>
              <Text style={styles.biometricTitle}>Biometric unlock</Text>
              <Text style={styles.biometricDescription}>
                {app.appLockBiometricEnabled
                  ? "Enabled for this app PIN."
                  : "Use your enrolled phone biometric to unlock after login."}
              </Text>
            </View>
            <Pressable
              onPress={handleToggleBiometric}
              disabled={loading || !app.appLockConfigured}
              style={[
                styles.biometricButton,
                app.appLockBiometricEnabled && styles.biometricButtonActive,
                (loading || !app.appLockConfigured) && styles.buttonDisabled,
              ]}
            >
              <Text
                style={[
                  styles.biometricButtonText,
                  app.appLockBiometricEnabled && styles.biometricButtonTextActive,
                ]}
              >
                {app.appLockBiometricEnabled ? "Disable" : "Enable"}
              </Text>
            </Pressable>
          </View>
        ) : null}
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

      <AppTimingSection />
    </ScrollView>
  );
}

function formatMs(value) {
  const ms = Number(value) || 0;
  return ms >= 10000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

/**
 * Release-build performance log: per-operation summary, JSON export via the
 * share sheet (email, Drive, WhatsApp...), and a clear button.
 */
function AppTimingSection() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const summary = useMemo(() => summarizeTimings(rows), [rows]);

  const reload = useCallback(async () => {
    try {
      setRows(await listTimings());
    } catch (error) {
      console.warn("Could not load app timings:", error);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function shareLogs() {
    setBusy(true);
    try {
      const latest = await listTimings();
      setRows(latest);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await Share.share(
        {
          title: `DYNAMIC app timings ${stamp}`,
          message: buildTimingExport(latest),
        },
        { dialogTitle: "Export app timing logs" }
      );
    } catch (error) {
      Alert.alert("Could not export timing logs", String(error?.message || error));
    } finally {
      setBusy(false);
    }
  }

  function confirmClear() {
    Alert.alert("Clear timing logs?", "This removes the logs from this device only.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          await clearTimings();
          await reload();
        },
      },
    ]);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>App Timing Logs</Text>
      <Text style={styles.perfHint}>
        {`${rows.length} recorded operations on this device. Export as JSON to analyse form open, draft save, sync and worklist timings.`}
      </Text>
      {summary.length ? (
        <View style={styles.perfTable}>
          <View style={[styles.perfRow, styles.perfHeaderRow]}>
            <Text style={[styles.perfCell, styles.perfNameCell, styles.perfHeaderText]}>Operation</Text>
            <Text style={[styles.perfCell, styles.perfHeaderText]}>Count</Text>
            <Text style={[styles.perfCell, styles.perfHeaderText]}>Avg</Text>
            <Text style={[styles.perfCell, styles.perfHeaderText]}>p95</Text>
            <Text style={[styles.perfCell, styles.perfHeaderText]}>Max</Text>
          </View>
          {summary.map((item) => (
            <View key={item.name} style={styles.perfRow}>
              <Text style={[styles.perfCell, styles.perfNameCell]} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.perfCell}>{item.count}</Text>
              <Text style={styles.perfCell}>{formatMs(item.avgMs)}</Text>
              <Text style={styles.perfCell}>{formatMs(item.p95Ms)}</Text>
              <Text style={styles.perfCell}>{formatMs(item.maxMs)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No timings recorded yet.</Text>
        </View>
      )}
      <View style={styles.perfActions}>
        <Pressable disabled={busy || !rows.length} onPress={shareLogs} style={[styles.perfButton, styles.perfButtonPrimary, (busy || !rows.length) && styles.perfButtonDisabled]}>
          <Text style={styles.perfButtonPrimaryText}>{busy ? "Preparing..." : "Share logs (JSON)"}</Text>
        </Pressable>
        <Pressable disabled={busy || !rows.length} onPress={confirmClear} style={[styles.perfButton, (busy || !rows.length) && styles.perfButtonDisabled]}>
          <Text style={styles.perfButtonText}>Clear</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={reload} style={styles.perfButton}>
          <Text style={styles.perfButtonText}>Refresh</Text>
        </Pressable>
      </View>
    </View>
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
    padding: 18,
    gap: 10
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#475467",
    textTransform: "uppercase",
    marginBottom: 4
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#d8dee4",
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 15,
    backgroundColor: "#ffffff"
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#17202a"
  },
  primaryButtonPressed: {
    opacity: 0.8
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800"
  },
  buttonDisabled: {
    opacity: 0.6
  },
  biometricPanel: {
    marginTop: 4,
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d8dee4",
    borderRadius: 8,
    backgroundColor: "#f8fafc"
  },
  biometricTextGroup: {
    gap: 3
  },
  biometricTitle: {
    fontSize: 14,
    color: "#18202a",
    fontWeight: "800"
  },
  biometricDescription: {
    fontSize: 13,
    color: "#667085",
    fontWeight: "600"
  },
  biometricButton: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#17202a",
    borderRadius: 6,
    backgroundColor: "#ffffff"
  },
  biometricButtonActive: {
    borderColor: "#0369a1",
    backgroundColor: "#e0f2fe"
  },
  biometricButtonText: {
    color: "#17202a",
    fontSize: 14,
    fontWeight: "800"
  },
  biometricButtonTextActive: {
    color: "#0369a1"
  },
  errorText: {
    color: "#b42318",
    fontSize: 13,
    fontWeight: "700"
  },
  successText: {
    color: "#116329",
    fontSize: 13,
    fontWeight: "800"
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
  perfHint: { color: "#667085", fontSize: 13, lineHeight: 18, marginBottom: 10 },
  perfTable: { borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, overflow: "hidden" },
  perfRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "#eef2f6" },
  perfHeaderRow: { backgroundColor: "#f8fafc" },
  perfHeaderText: { fontWeight: "800", color: "#475467" },
  perfCell: { flex: 1, fontSize: 13, color: "#18202a", textAlign: "right" },
  perfNameCell: { flex: 2.2, textAlign: "left", fontWeight: "700" },
  perfActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  perfButton: { minHeight: 42, justifyContent: "center", paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: "#98a2b3", backgroundColor: "#ffffff" },
  perfButtonPrimary: { borderColor: "#1f6feb", backgroundColor: "#1f6feb" },
  perfButtonPrimaryText: { color: "#ffffff", fontWeight: "800" },
  perfButtonText: { color: "#18202a", fontWeight: "700" },
  perfButtonDisabled: { opacity: 0.45 },
});
