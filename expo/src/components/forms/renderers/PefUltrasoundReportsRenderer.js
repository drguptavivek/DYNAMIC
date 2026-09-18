/** Collects up to five named ultrasound-report images for offline PEF Q11 use. */
import React, { useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";

import {
  PEF_ULTRASOUND_REPORTS_MAX,
  normalizePefUltrasoundReports,
} from "../../../modules/attachments/pefUltrasoundReports.js";
import {
  persistPefUltrasoundImage,
  removePersistedPefUltrasoundImage,
} from "../../../modules/attachments/pefUltrasoundAttachmentStorage.js";
import { setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";

function createAttachmentId() {
  return `pef-usg-${Crypto.randomUUID()}`;
}

export function PefUltrasoundReportsRenderer({ locale, question, onChange }) {
  const value = normalizePefUltrasoundReports(question.value);
  const [error, setError] = useState("");

  function commit(next) {
    setNativeQuestionValue(question, next);
    onChange?.();
  }

  async function setReportCount(raw) {
    const digits = String(raw || "").replace(/\D/g, "").slice(0, 1);
    const count = digits ? Math.min(Number(digits), PEF_ULTRASOUND_REPORTS_MAX) : 0;
    const removed = value.reports.slice(count);
    await Promise.all(removed.map((report) => removePersistedPefUltrasoundImage(report.local_uri)));
    const reports = Array.from({ length: count }, (_, index) => value.reports[index] || {
      attachment_id: createAttachmentId(),
      report_name: "",
      local_uri: "",
      original_name: null,
      mime_type: null,
      file_size: null,
    });
    commit({ report_count: count, reports });
    setError("");
  }

  function updateReport(index, patch) {
    const reports = value.reports.map((report, reportIndex) =>
      reportIndex === index ? { ...report, ...patch } : report,
    );
    commit({ report_count: value.report_count, reports });
  }

  async function chooseImage(index, source) {
    setError("");
    const permission = source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(`${source === "camera" ? "Camera" : "Gallery"} permission is required.`);
      return;
    }
    const options = {
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.8,
      exif: false,
      selectionLimit: 1,
    };
    const result = source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets?.[0]) return;
    const current = value.reports[index];
    try {
      const stored = await persistPefUltrasoundImage(result.assets[0], current.attachment_id);
      if (current.local_uri && current.local_uri !== stored.local_uri) {
        await removePersistedPefUltrasoundImage(current.local_uri);
      }
      updateReport(index, stored);
    } catch (storageError) {
      setError(storageError?.message || "Could not save the image on this device.");
    }
  }

  async function removeImage(index) {
    const report = value.reports[index];
    await removePersistedPefUltrasoundImage(report?.local_uri);
    updateReport(index, {
      local_uri: "",
      original_name: null,
      mime_type: null,
      file_size: null,
    });
  }

  return (
    <QuestionFrame locale={locale} question={question}>
      <Text style={styles.label}>How many reports do you have?</Text>
      <TextInput
        accessibilityLabel="Number of ultrasound reports"
        keyboardType="number-pad"
        maxLength={1}
        onChangeText={setReportCount}
        placeholder={`1-${PEF_ULTRASOUND_REPORTS_MAX}`}
        style={styles.countInput}
        value={value.report_count ? String(value.report_count) : ""}
      />
      {value.reports.map((report, index) => (
        <View key={report.attachment_id} style={styles.reportCard}>
          <Text style={styles.reportTitle}>{`Report ${index + 1}`}</Text>
          <TextInput
            accessibilityLabel={`File name for report ${index + 1}`}
            onChangeText={(reportName) => updateReport(index, { report_name: reportName })}
            placeholder="Enter file name"
            style={styles.nameInput}
            value={report.report_name || ""}
          />
          {report.local_uri ? (
            <Image source={{ uri: report.local_uri }} style={styles.preview} />
          ) : null}
          <View style={styles.actions}>
            <Pressable onPress={() => chooseImage(index, "camera")} style={controlStyles.button}>
              <Text style={controlStyles.buttonText}>{report.local_uri ? "Retake" : "Camera"}</Text>
            </Pressable>
            <Pressable onPress={() => chooseImage(index, "gallery")} style={controlStyles.button}>
              <Text style={controlStyles.buttonText}>{report.local_uri ? "Replace" : "Gallery"}</Text>
            </Pressable>
            {report.local_uri ? (
              <Pressable onPress={() => removeImage(index)} style={styles.removeButton}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </QuestionFrame>
  );
}

const styles = StyleSheet.create({
  label: { color: "#344054", fontSize: 15, fontWeight: "700", marginBottom: 8 },
  countInput: { width: 110, minHeight: 52, borderWidth: 1, borderColor: "#aab6c5", borderRadius: 9, paddingHorizontal: 14, fontSize: 18, backgroundColor: "#fff" },
  reportCard: { gap: 10, marginTop: 14, padding: 12, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, backgroundColor: "#f8fafc" },
  reportTitle: { color: "#1f2937", fontSize: 16, fontWeight: "800" },
  nameInput: { minHeight: 50, borderWidth: 1, borderColor: "#aab6c5", borderRadius: 9, paddingHorizontal: 12, fontSize: 16, backgroundColor: "#fff" },
  preview: { width: "100%", height: 190, resizeMode: "contain", borderRadius: 8, backgroundColor: "#e5e7eb" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  removeButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderWidth: 1, borderColor: "#b42318", borderRadius: 8, backgroundColor: "#fff" },
  removeText: { color: "#b42318", fontWeight: "800" },
  error: { color: "#b42318", fontSize: 14, fontWeight: "700", marginTop: 10 },
});
