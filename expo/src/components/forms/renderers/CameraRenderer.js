/** Captures an image with native camera APIs without assuming attachment persistence policy. */
import React from "react";
import { Image, Pressable, StyleSheet, Text } from "react-native";
import * as ImagePicker from "expo-image-picker";

import { setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";

export function CameraRenderer({ locale, question, onChange }) {
  const images = Array.isArray(question.value) ? question.value : [];
  async function captureImage() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, exif: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    setNativeQuestionValue(question, [{ name: asset.fileName || "camera.jpg", type: asset.mimeType || "image/jpeg", uri: asset.uri }]);
    onChange?.();
  }
  return (
    <QuestionFrame locale={locale} question={question}>
      {images[0]?.uri ? <Image source={{ uri: images[0].uri }} style={styles.preview} /> : null}
      <Pressable onPress={captureImage} style={controlStyles.button}>
        <Text style={controlStyles.buttonText}>Take photo</Text>
      </Pressable>
    </QuestionFrame>
  );
}

const styles = StyleSheet.create({ preview: { width: "100%", height: 220, resizeMode: "contain", borderRadius: 8, backgroundColor: "#f3f4f6" } });
