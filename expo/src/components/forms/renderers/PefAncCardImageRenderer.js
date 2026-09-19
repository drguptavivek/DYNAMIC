/** Collects exactly one durable camera/gallery image for PEF Q47. */
import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";

import {
  beginAppLockMediaActivity,
  endAppLockMediaActivity,
} from "../../../modules/auth/appLockMediaActivity.js";
import {
  normalizePefAncCardImage,
  validatePefAncCardImage,
} from "../../../modules/attachments/pefAncCardImage.js";
import {
  persistPefAncCardImage,
  removePersistedPefAncCardImage,
} from "../../../modules/attachments/pefUltrasoundAttachmentStorage.js";
import { setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";

export function PefAncCardImageRenderer({
  locale,
  question,
  onChange,
  onRequestTopLevelFocus,
}) {
  const image = normalizePefAncCardImage(question.value);
  const [error, setError] = useState("");

  function commit(next) {
    const hadValidationError = Array.isArray(question.errors) && question.errors.length > 0;
    setNativeQuestionValue(question, next);
    if (hadValidationError || validatePefAncCardImage(next) === null) question.validate?.();
    onChange?.();
  }

  function restoreUploadFocus() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => onRequestTopLevelFocus?.(question.name));
    });
  }

  async function chooseImage(source) {
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
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            allowsEditing: false,
            quality: 0.8,
            exif: false,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: false,
            quality: 0.8,
            exif: false,
            selectionLimit: 1,
          });
      if (result.canceled || !result.assets?.[0]) return;

      const attachmentId = image?.attachment_id || `pef-anc-${Crypto.randomUUID()}`;
      const stored = await persistPefAncCardImage(result.assets[0], attachmentId);
      if (image?.local_uri && image.local_uri !== stored.local_uri) {
        await removePersistedPefAncCardImage(image.local_uri);
      }
      commit({ attachment_id: attachmentId, ...stored });
      restoreUploadFocus();
    } catch (storageError) {
      setError(storageError?.message || "Could not save the ANC card image on this device.");
      restoreUploadFocus();
    } finally {
      endAppLockMediaActivity();
    }
  }

  async function removeImage() {
    await removePersistedPefAncCardImage(image?.local_uri);
    commit(undefined);
    setError("");
  }

  return (
    <QuestionFrame locale={locale} question={question}>
      {image?.local_uri ? <Image source={{ uri: image.local_uri }} style={styles.preview} /> : null}
      {image?.original_name ? <Text style={styles.fileName}>{`File: ${image.original_name}`}</Text> : null}
      <View style={styles.actions}>
        <Pressable onPress={() => chooseImage("camera")} style={controlStyles.button}>
          <Text style={controlStyles.buttonText}>{image?.local_uri ? "Retake" : "Camera"}</Text>
        </Pressable>
        <Pressable onPress={() => chooseImage("gallery")} style={controlStyles.button}>
          <Text style={controlStyles.buttonText}>{image?.local_uri ? "Replace" : "Gallery"}</Text>
        </Pressable>
        {image?.local_uri ? (
          <Pressable onPress={removeImage} style={styles.removeButton}>
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </QuestionFrame>
  );
}

const styles = StyleSheet.create({
  preview: {
    width: "100%",
    height: 220,
    resizeMode: "contain",
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
  },
  fileName: { color: "#475467", fontSize: 13, marginTop: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  removeButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#b42318",
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  removeText: { color: "#b42318", fontWeight: "800" },
  error: { color: "#b42318", fontSize: 14, fontWeight: "700", marginTop: 10 },
});
