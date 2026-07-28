import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { buildFieldWorkerProfile } from "./profileData.js";
import { useFieldApp } from "../../shell/FieldAppProvider.js";

function formatRole(role) {
  return String(role || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Field Worker";
}

export function FieldWorkerProfileScreen({ user, localities }) {
  const app = useFieldApp();
  const profile = buildFieldWorkerProfile(user, localities);
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
});
