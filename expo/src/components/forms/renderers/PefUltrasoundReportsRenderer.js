/** Collects up to five dated ultrasound reports with one or two images each. */
import React, { useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";

import {
  beginAppLockMediaActivity,
  endAppLockMediaActivity,
} from "../../../modules/auth/appLockMediaActivity.js";
import {
  PEF_ULTRASOUND_IMAGES_PER_REPORT_MAX,
  PEF_ULTRASOUND_REPORTS_MAX,
  normalizePefUltrasoundReports,
  validatePefUltrasoundReports,
} from "../../../modules/attachments/pefUltrasoundReports.js";
import {
  persistPefUltrasoundImage,
  removePersistedPefUltrasoundImage,
} from "../../../modules/attachments/pefUltrasoundAttachmentStorage.js";
import {
  formatSurveyDate,
  formatSurveyDateDisplay,
  parseSurveyDate,
} from "../dateValue.js";
import { setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";

function createAttachmentId() {
  return `pef-usg-${Crypto.randomUUID()}`;
}

function createEmptyImage() {
  return {
    attachment_id: createAttachmentId(),
    local_uri: "",
    original_name: null,
    mime_type: null,
    file_size: null,
  };
}

function UltrasoundDateInput({ index, value, onChange }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const webInputRef = useRef(null);
  const displayValue = formatSurveyDateDisplay(value);
  const selectedDate = parseSurveyDate(value) || new Date();
  const today = new Date();
  const maximumDate = formatSurveyDate(today);

  function setDate(date) {
    const nextValue = formatSurveyDate(date);
    if (nextValue) onChange(nextValue);
  }

  function openPicker() {
    if (Platform.OS === "web") {
      const input = webInputRef.current;
      if (input?.showPicker) input.showPicker();
      else input?.focus?.();
      return;
    }
    setPickerOpen(true);
  }

  return (
    <View style={styles.datePickerWrap}>
      <Pressable
        accessibilityLabel={`Ultrasound date for report ${index + 1}`}
        accessibilityRole="button"
        onPress={openPicker}
        style={styles.dateButton}
      >
        <Text style={[styles.dateText, !displayValue && styles.datePlaceholder]}>
          {displayValue || "DD-MMM-YYYY"}
        </Text>
        <MaterialCommunityIcons color="#475467" name="calendar-month-outline" size={22} />
      </Pressable>
      {Platform.OS === "web"
        ? React.createElement("input", {
            "aria-label": `Ultrasound date for report ${index + 1}`,
            max: maximumDate,
            onChange: (event) => {
              const nextDate = parseSurveyDate(event.target.value);
              if (nextDate) setDate(nextDate);
            },
            ref: webInputRef,
            style: styles.webDateInput,
            type: "date",
            value: value || "",
          })
        : null}
      {pickerOpen && Platform.OS !== "web" ? (
        <DateTimePicker
          maximumDate={today}
          mode="date"
          onDismiss={() => setPickerOpen(false)}
          onValueChange={(_event, date) => {
            setPickerOpen(false);
            if (date) setDate(date);
          }}
          presentation="dialog"
          value={selectedDate}
        />
      ) : null}
    </View>
  );
}

export function PefUltrasoundReportsRenderer({
  locale,
  question,
  onChange,
  onRequestTopLevelFocus,
}) {
  const value = normalizePefUltrasoundReports(question.value);
  const [error, setError] = useState("");

  function commit(next) {
    const hadValidationError = Array.isArray(question.errors) && question.errors.length > 0;
    setNativeQuestionValue(question, next);
    // Clear any earlier attachment error as soon as the corrected object is
    // complete, rather than making the interviewer press Next a second time.
    // Do not introduce validation errors while the report is still being entered.
    if (hadValidationError || validatePefUltrasoundReports(next) === null) {
      question.validate?.();
    }
    onChange?.();
  }

  async function setReportCount(raw) {
    const digits = String(raw || "").replace(/\D/g, "").slice(0, 1);
    const count = digits ? Math.min(Number(digits), PEF_ULTRASOUND_REPORTS_MAX) : 0;
    const currentValue = normalizePefUltrasoundReports(question.value);
    const removed = currentValue.reports.slice(count);
    await Promise.all(removed.flatMap((report) => report.images.map(
      (image) => removePersistedPefUltrasoundImage(image.local_uri),
    )));
    const latestValue = normalizePefUltrasoundReports(question.value);
    const reports = Array.from({ length: count }, (_, index) => latestValue.reports[index] || {
      report_id: createAttachmentId(),
      ultrasound_date: "",
      images: [createEmptyImage()],
    });
    commit({ report_count: count, reports });
    setError("");
  }

  function updateReport(index, patch) {
    const currentValue = normalizePefUltrasoundReports(question.value);
    const reports = currentValue.reports.map((report, reportIndex) =>
      reportIndex === index ? { ...report, ...patch } : report,
    );
    commit({ report_count: currentValue.report_count, reports });
  }

  function updateImage(reportIndex, imageIndex, patch) {
    const currentValue = normalizePefUltrasoundReports(question.value);
    const reports = currentValue.reports.map((report, currentReportIndex) => {
      if (currentReportIndex !== reportIndex) return report;
      return {
        ...report,
        images: report.images.map((image, currentImageIndex) =>
          currentImageIndex === imageIndex ? { ...image, ...patch } : image,
        ),
      };
    });
    commit({ report_count: currentValue.report_count, reports });
  }

  function addImage(reportIndex) {
    const currentValue = normalizePefUltrasoundReports(question.value);
    const report = currentValue.reports[reportIndex];
    if (!report || report.images.length >= PEF_ULTRASOUND_IMAGES_PER_REPORT_MAX) return;
    updateReport(reportIndex, { images: [...report.images, createEmptyImage()] });
  }

  function restoreUploadFocus() {
    // Wait for the saved-image preview to render, then return to this upload
    // control instead of leaving the interviewer at the top of the form.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => onRequestTopLevelFocus?.(question.name));
    });
  }

  async function chooseImage(reportIndex, imageIndex, source) {
    setError("");
    beginAppLockMediaActivity();
    try {
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
      const current = normalizePefUltrasoundReports(question.value)
        .reports[reportIndex]?.images[imageIndex];
      if (!current) {
        setError("Select the number of reports before adding an image.");
        restoreUploadFocus();
        return;
      }
      const stored = await persistPefUltrasoundImage(result.assets[0], current.attachment_id);
      if (current.local_uri && current.local_uri !== stored.local_uri) {
        await removePersistedPefUltrasoundImage(current.local_uri);
      }
      updateImage(reportIndex, imageIndex, stored);
      restoreUploadFocus();
    } catch (storageError) {
      setError(storageError?.message || "Could not save the image on this device.");
      restoreUploadFocus();
    } finally {
      endAppLockMediaActivity();
    }
  }

  async function removeImage(reportIndex, imageIndex) {
    const report = normalizePefUltrasoundReports(question.value).reports[reportIndex];
    const image = report?.images[imageIndex];
    await removePersistedPefUltrasoundImage(image?.local_uri);
    if (report.images.length > 1) {
      updateReport(reportIndex, {
        images: report.images.filter((_item, currentIndex) => currentIndex !== imageIndex),
      });
      return;
    }
    updateImage(reportIndex, imageIndex, {
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
        <View key={report.report_id || `report-${index + 1}`} style={styles.reportCard}>
          <Text style={styles.reportTitle}>{`Report ${index + 1}`}</Text>
          <Text style={styles.fieldLabel}>Date of ultrasound</Text>
          <UltrasoundDateInput
            index={index}
            onChange={(ultrasoundDate) => updateReport(index, { ultrasound_date: ultrasoundDate })}
            value={report.ultrasound_date || ""}
          />
          {report.images.map((image, imageIndex) => (
            <View key={image.attachment_id} style={styles.imageCard}>
              <Text style={styles.imageTitle}>{`Image ${imageIndex + 1}`}</Text>
              {image.local_uri ? (
                <Image source={{ uri: image.local_uri }} style={styles.preview} />
              ) : null}
              {image.original_name ? (
                <Text style={styles.fileName}>{`File: ${image.original_name}`}</Text>
              ) : null}
              <View style={styles.actions}>
                <Pressable
                  onPress={() => chooseImage(index, imageIndex, "camera")}
                  style={controlStyles.button}
                >
                  <Text style={controlStyles.buttonText}>{image.local_uri ? "Retake" : "Camera"}</Text>
                </Pressable>
                <Pressable
                  onPress={() => chooseImage(index, imageIndex, "gallery")}
                  style={controlStyles.button}
                >
                  <Text style={controlStyles.buttonText}>{image.local_uri ? "Replace" : "Gallery"}</Text>
                </Pressable>
                {image.local_uri ? (
                  <Pressable
                    onPress={() => removeImage(index, imageIndex)}
                    style={styles.removeButton}
                  >
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
          {report.images.length < PEF_ULTRASOUND_IMAGES_PER_REPORT_MAX && report.images[0]?.local_uri ? (
            <Pressable onPress={() => addImage(index)} style={styles.addImageButton}>
              <MaterialCommunityIcons color="#1769aa" name="plus" size={20} />
              <Text style={styles.addImageText}>Add image</Text>
            </Pressable>
          ) : null}
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
  imageCard: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#e2e8f0" },
  imageTitle: { color: "#344054", fontSize: 14, fontWeight: "800" },
  fieldLabel: { color: "#344054", fontSize: 14, fontWeight: "700" },
  datePickerWrap: { minHeight: 50, position: "relative" },
  dateButton: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: "#aab6c5", borderRadius: 9, backgroundColor: "#fff" },
  dateText: { flex: 1, color: "#18202a", fontSize: 16 },
  datePlaceholder: { color: "#667085" },
  webDateInput: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 2, width: "100%", height: "100%", cursor: "pointer", opacity: 0.01 },
  preview: { width: "100%", height: 190, resizeMode: "contain", borderRadius: 8, backgroundColor: "#e5e7eb" },
  fileName: { color: "#475467", fontSize: 13 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  addImageButton: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: "#1769aa", borderRadius: 8, backgroundColor: "#eff6ff" },
  addImageText: { color: "#1769aa", fontSize: 15, fontWeight: "800" },
  removeButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderWidth: 1, borderColor: "#b42318", borderRadius: 8, backgroundColor: "#fff" },
  removeText: { color: "#b42318", fontWeight: "800" },
  error: { color: "#b42318", fontSize: 14, fontWeight: "700", marginTop: 10 },
});
