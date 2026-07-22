import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { getTaskOpenBlockReason } from "./taskOpenPolicy.js";
import { listTaskFinalCloseReasons } from "./taskWorklist.js";
import {
  closeTaskWithFinalReason,
  listTaskAttempts,
  recordFailedTaskAttempt,
} from "./taskWorklistRepository.js";

const STATUS_COLORS = {
  open: "#3498db",
  completed: "#2ecc71",
  missed: "#e74c3c",
  closed: "#95a5a6",
};

const ATTEMPT_OUTCOMES = ["not_found", "refused", "unavailable", "other"];

export function TaskDetailModal({ visible, task, onClose, onOpenForm, onTaskChanged }) {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAttemptForm, setShowAttemptForm] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState("not_found");
  const [attemptNotes, setAttemptNotes] = useState("");
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [selectedCloseReason, setSelectedCloseReason] = useState("");

  const finalCloseReasons = task ? listTaskFinalCloseReasons(task) : [];
  const canRecordFinalClose = Boolean(
    task?.requires_final_close_reason &&
      Number(task.failed_attempt_count || 0) >= Number(task.max_failed_attempts) &&
      finalCloseReasons.length > 0,
  );

  useEffect(() => {
    if (visible && task) {
      setShowCloseForm(false);
      setSelectedCloseReason(finalCloseReasons[0] || "");
      loadAttempts();
    }
  }, [visible, task]);

  function loadAttempts() {
    setLoading(true);
    try {
      const taskAttempts = listTaskAttempts(task.id);
      setAttempts(taskAttempts);
    } catch (error) {
      console.error("Error loading attempts:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleRecordAttempt() {
    if (!selectedOutcome) {
      Alert.alert("Error", "Please select an outcome");
      return;
    }

    try {
      setLoading(true);
      const attemptId = `${task.id}-attempt-${Date.now()}`;
      const attempt = {
        id: attemptId,
        task_id: task.id,
        outcome: selectedOutcome,
        notes: attemptNotes,
      };

      const result = recordFailedTaskAttempt({ task, attempt });
      setAttemptNotes("");
      setShowAttemptForm(false);
      setSelectedOutcome("not_found");
      loadAttempts();
      if (result.decision.should_prompt_final_close_reason) {
        setShowCloseForm(true);
        Alert.alert(
          "Final close reason required",
          "The failed-attempt limit has been reached. Record a final close reason before closing this task.",
        );
      } else {
        Alert.alert("Success", "Attempt recorded");
      }
    } catch (error) {
      console.error("Error recording attempt:", error);
      Alert.alert("Error", `Failed to record attempt: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  function handleFinalClose() {
    if (!selectedCloseReason) {
      Alert.alert("Error", "Please select a final close reason");
      return;
    }

    try {
      setLoading(true);
      closeTaskWithFinalReason({ taskId: task.id, closeReason: selectedCloseReason });
      setShowCloseForm(false);
      onTaskChanged?.();
      Alert.alert("Task closed", "The final close reason was recorded.", [
        { text: "OK", onPress: onClose },
      ]);
    } catch (error) {
      console.error("Error closing task:", error);
      Alert.alert("Error", `Failed to close task: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  if (!task) return null;

  const openBlockReason = getTaskOpenBlockReason(task);
  const isDisabled = Boolean(openBlockReason);
  const canOpenForm = openBlockReason === null;

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{task.task_type}</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Subject:</Text>
                <Text style={styles.value}>{task.subject_name || task.subject_id}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.label}>Household ID:</Text>
                <Text style={styles.value}>{task.household_id}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.label}>Target Date:</Text>
                <Text style={styles.value}>{task.target_date}</Text>
              </View>

              {task.window_start && task.window_end && (
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Window:</Text>
                  <Text style={styles.value}>
                    {task.window_start} to {task.window_end}
                  </Text>
                </View>
              )}

              <View style={styles.infoRow}>
                <Text style={styles.label}>Status:</Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: STATUS_COLORS[task.status] || "#95a5a6" },
                  ]}
                >
                  <Text style={styles.statusBadgeText}>{task.status}</Text>
                </View>
              </View>

              {openBlockReason && (
                <View style={styles.disabledWarning}>
                  <Text style={styles.warningText}>🔒 {openBlockReason}</Text>
                </View>
              )}
            </View>

            {canOpenForm && (
              <Pressable
                onPress={() => {
                  onOpenForm(task);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.button,
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.buttonText}>Open Form</Text>
              </Pressable>
            )}

            {task.status === "open" && (
              <Pressable
                onPress={() => setShowAttemptForm(!showAttemptForm)}
                style={({ pressed }) => [
                  styles.button,
                  styles.secondaryButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Record Failed Attempt</Text>
              </Pressable>
            )}

            {task.status === "open" && canRecordFinalClose && !showCloseForm && (
              <Pressable
                onPress={() => setShowCloseForm(true)}
                style={({ pressed }) => [
                  styles.button,
                  styles.secondaryButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Enter Final Close Reason</Text>
              </Pressable>
            )}

            {showAttemptForm && task.status === "open" && (
              <View style={styles.attemptForm}>
                <Text style={styles.formLabel}>Outcome</Text>
                <View style={styles.pickerContainer}>
                  {/* Fallback UI for non-mobile */}
                  <View style={styles.outcomePicker}>
                    {ATTEMPT_OUTCOMES.map((outcome) => (
                      <Pressable
                        key={outcome}
                        onPress={() => setSelectedOutcome(outcome)}
                        style={[
                          styles.outcomeOption,
                          selectedOutcome === outcome && styles.outcomeOptionSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.outcomeOptionText,
                            selectedOutcome === outcome && styles.outcomeOptionTextSelected,
                          ]}
                        >
                          {outcome}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <Text style={styles.formLabel}>Notes (optional)</Text>
                <TextInput
                  style={styles.notesInput}
                  placeholder="Add notes about this attempt..."
                  value={attemptNotes}
                  onChangeText={setAttemptNotes}
                  multiline={true}
                  numberOfLines={4}
                />

                <View style={styles.formButtons}>
                  <Pressable
                    onPress={handleRecordAttempt}
                    disabled={loading}
                    style={({ pressed }) => [
                      styles.button,
                      styles.primaryButton,
                      (pressed || loading) && styles.buttonPressed,
                    ]}
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.buttonText}>Save Attempt</Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setShowAttemptForm(false);
                      setAttemptNotes("");
                    }}
                    style={({ pressed }) => [
                      styles.button,
                      styles.secondaryButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {showCloseForm && finalCloseReasons.length > 0 && (
              <View style={styles.attemptForm}>
                <Text style={styles.sectionTitle}>Final Close Reason</Text>
                <View style={styles.outcomePicker}>
                  {finalCloseReasons.map((reason) => (
                    <Pressable
                      key={reason}
                      onPress={() => setSelectedCloseReason(reason)}
                      style={[
                        styles.outcomeOption,
                        selectedCloseReason === reason && styles.outcomeOptionSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.outcomeOptionText,
                          selectedCloseReason === reason && styles.outcomeOptionTextSelected,
                        ]}
                      >
                        {reason.replaceAll("_", " ")}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.formButtons}>
                  <Pressable
                    onPress={handleFinalClose}
                    disabled={loading}
                    style={({ pressed }) => [
                      styles.button,
                      styles.primaryButton,
                      (pressed || loading) && styles.buttonPressed,
                    ]}
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.buttonText}>Close Task</Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => setShowCloseForm(false)}
                    style={({ pressed }) => [
                      styles.button,
                      styles.secondaryButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {attempts.length > 0 && (
              <View style={styles.attemptsSection}>
                <Text style={styles.sectionTitle}>Previous Attempts</Text>
                {attempts.map((attempt, idx) => (
                  <View key={attempt.id} style={styles.attemptItem}>
                    <View style={styles.attemptHeader}>
                      <Text style={styles.attemptNumber}>Attempt {idx + 1}</Text>
                      <Text style={styles.attemptOutcome}>{attempt.outcome}</Text>
                    </View>
                    {attempt.notes && <Text style={styles.attemptNotes}>{attempt.notes}</Text>}
                    <Text style={styles.attemptTime}>
                      {new Date(attempt.attempted_at).toLocaleString()}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "90%",
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#d8dee4",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#18202a",
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 24,
    color: "#666",
  },
  scrollContent: {
    paddingVertical: 12,
  },
  section: {
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    flex: 0.3,
  },
  value: {
    fontSize: 14,
    color: "#18202a",
    flex: 0.7,
    textAlign: "right",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff",
    textTransform: "uppercase",
  },
  disabledWarning: {
    backgroundColor: "#fff3cd",
    borderLeftWidth: 4,
    borderLeftColor: "#ff9800",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 4,
    marginTop: 12,
  },
  warningText: {
    fontSize: 14,
    color: "#856404",
    lineHeight: 20,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginVertical: 8,
  },
  primaryButton: {
    backgroundColor: "#3498db",
  },
  secondaryButton: {
    backgroundColor: "#f0f0f0",
    borderWidth: 1,
    borderColor: "#d8dee4",
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#18202a",
  },
  attemptForm: {
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    padding: 12,
    marginVertical: 12,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#18202a",
    marginBottom: 8,
    marginTop: 12,
  },
  pickerContainer: {
    marginBottom: 12,
  },
  outcomePicker: {
    flexDirection: "column",
    gap: 8,
  },
  outcomeOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#d8dee4",
    borderRadius: 6,
    backgroundColor: "#ffffff",
  },
  outcomeOptionSelected: {
    backgroundColor: "#e3f2fd",
    borderColor: "#3498db",
  },
  outcomeOptionText: {
    fontSize: 14,
    color: "#666",
    textTransform: "capitalize",
  },
  outcomeOptionTextSelected: {
    color: "#3498db",
    fontWeight: "600",
  },
  notesInput: {
    borderWidth: 1,
    borderColor: "#d8dee4",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#ffffff",
    minHeight: 100,
    textAlignVertical: "top",
  },
  formButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  attemptsSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#d8dee4",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#18202a",
    marginBottom: 12,
  },
  attemptItem: {
    backgroundColor: "#f9f9f9",
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  attemptHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  attemptNumber: {
    fontSize: 13,
    fontWeight: "600",
    color: "#18202a",
  },
  attemptOutcome: {
    fontSize: 13,
    fontWeight: "600",
    color: "#e74c3c",
    textTransform: "uppercase",
  },
  attemptNotes: {
    fontSize: 13,
    color: "#666",
    marginVertical: 4,
    fontStyle: "italic",
  },
  attemptTime: {
    fontSize: 12,
    color: "#999",
  },
});
