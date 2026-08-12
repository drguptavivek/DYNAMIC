/** Selects a device file with native APIs while leaving attachment storage to the caller. */
import React from "react";
import { Pressable, Text } from "react-native";
import * as DocumentPicker from "expo-document-picker";

import { setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";

export function FilePickerRenderer({ locale, question, onChange }) {
  const files = Array.isArray(question.value) ? question.value : [];
  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    setNativeQuestionValue(question, [{ name: asset.name, size: asset.size, type: asset.mimeType, uri: asset.uri }]);
    onChange?.();
  }
  return (
    <QuestionFrame locale={locale} question={question}>
      <Text style={controlStyles.status}>{files[0]?.name || "No file selected"}</Text>
      <Pressable onPress={pickFile} style={controlStyles.button}>
        <Text style={controlStyles.buttonText}>Choose file</Text>
      </Pressable>
    </QuestionFrame>
  );
}
