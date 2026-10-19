import { getNativeFormText } from "../../../lib/nativeFormText.js";
/** Captures coordinates through native location APIs and records structured answer data. */
import React, { useState } from "react";
import { Pressable, Text } from "react-native";
import * as Location from "expo-location";

import { QuestionFrame, controlStyles } from "./QuestionFrame.js";

export function GpsRenderer({ locale, question, onChange }) {
  const [status, setStatus] = useState("");
  const isCaptureControl = question.name === "hhq_gps_latitude";

  async function capture() {
    setStatus(getNativeFormText(question.survey, "requesting_location_permission", "Requesting location permission...", locale));
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setStatus(getNativeFormText(question.survey, "location_permission_was_not_granted", "Location permission was not granted.", locale));
      return;
    }
    setStatus(getNativeFormText(question.survey, "capturing_gps", "Capturing GPS...", locale));
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { latitude, longitude, altitude } = position.coords;
    const survey = question.survey;
    survey.setValue("hhq_gps_latitude", Number(latitude.toFixed(7)));
    survey.setValue("hhq_gps_longitude", Number(longitude.toFixed(7)));
    if (altitude !== null && altitude !== undefined) {
      survey.setValue("hhq_gps_altitude_m", Number(altitude.toFixed(1)));
    }
    setStatus(getNativeFormText(question.survey, "gps_captured_from_this_device", "GPS captured from this device.", locale));
    onChange?.();
  }

  return (
    <QuestionFrame locale={locale} question={question} tone="display">
      <Text>{question.value === undefined || question.value === null ? getNativeFormText(question.survey, "not_captured", "Not captured", locale) : String(question.value)}</Text>
      {isCaptureControl ? (
        <Pressable onPress={capture} style={controlStyles.button}>
          <Text style={controlStyles.buttonText}>{getNativeFormText(question.survey, "capture_gps", "Capture GPS", locale)}</Text>
        </Pressable>
      ) : null}
      {status ? <Text style={controlStyles.status}>{status}</Text> : null}
    </QuestionFrame>
  );
}
