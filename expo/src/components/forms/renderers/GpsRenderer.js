/** Captures coordinates through native location APIs and records structured answer data. */
import React, { useState } from "react";
import { Pressable, Text } from "react-native";
import * as Location from "expo-location";

import { QuestionFrame, controlStyles } from "./QuestionFrame.js";

export function GpsRenderer({ question, onChange }) {
  const [status, setStatus] = useState("");
  const isCaptureControl = question.name === "hhq_gps_latitude";

  async function capture() {
    setStatus("Requesting location permission...");
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setStatus("Location permission was not granted.");
      return;
    }
    setStatus("Capturing GPS...");
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { latitude, longitude, altitude } = position.coords;
    const survey = question.survey;
    survey.setValue("hhq_gps_latitude", Number(latitude.toFixed(7)));
    survey.setValue("hhq_gps_longitude", Number(longitude.toFixed(7)));
    if (altitude !== null && altitude !== undefined) {
      survey.setValue("hhq_gps_altitude_m", Number(altitude.toFixed(1)));
    }
    setStatus("GPS captured from this device.");
    onChange?.();
  }

  return (
    <QuestionFrame question={question} tone="display">
      <Text>{question.value === undefined || question.value === null ? "Not captured" : String(question.value)}</Text>
      {isCaptureControl ? (
        <Pressable onPress={capture} style={controlStyles.button}>
          <Text style={controlStyles.buttonText}>Capture GPS</Text>
        </Pressable>
      ) : null}
      {status ? <Text style={controlStyles.status}>{status}</Text> : null}
    </QuestionFrame>
  );
}
