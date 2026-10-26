import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, Text } from "react-native";
import * as Location from "expo-location";

import { getNativeFormText, NATIVE_FORM_TEXT } from "../../../lib/nativeFormText.js";
import { buildHouseholdMapsUrl, readHouseholdGps } from "../../../lib/householdGps.js";
import { startHouseholdGpsCapture } from "../../../lib/gpsCapture.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";

export function GpsRenderer({ locale, question, onChange }) {
  const [status, setStatus] = useState("");
  const [capturing, setCapturing] = useState(false);
  const activeCapture = useRef(null);
  const mounted = useRef(true);
  const isCaptureControl = question.name === "hhq_gps_latitude";
  const readOnly = Boolean(question.isReadOnly || question.readOnly);
  const gps = readHouseholdGps(question.survey?.data);
  const text = (key) => getNativeFormText(question.survey, key, NATIVE_FORM_TEXT.HHQ[key], locale);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; activeCapture.current?.cancel(); };
  }, []);

  async function capture() {
    if (readOnly || activeCapture.current) return;
    setCapturing(true);
    setStatus("gps_checking_services");
    const operation = startHouseholdGpsCapture(Location, {
      onRequestingPermission: () => { if (mounted.current) setStatus("requesting_location_permission"); },
      onWaiting: () => { if (mounted.current) setStatus("gps_waiting_for_accuracy"); },
    });
    activeCapture.current = operation;
    try {
      const result = await operation.promise;
      if (!mounted.current || question.isReadOnly || question.readOnly || question.isVisible === false) return;
      // Update only GPS answers in one synchronous turn; bulk merges reload every question and bypass draft events.
      question.survey.setValue("hhq_gps_longitude", result.longitude);
      question.survey.setValue("hhq_gps_latitude", result.latitude);
      setStatus("gps_captured_from_this_device");
      onChange?.();
    } catch (error) {
      if (mounted.current) {
        setStatus(NATIVE_FORM_TEXT.HHQ[error.message] ? error.message : "gps_capture_failed");
        if (["gps_services_disabled", "gps_precise_location_required"].includes(error.message)) {
          Alert.alert(text("capture_gps"), text(error.message), [
            { text: getNativeFormText(question.survey, "popup_ok", "OK", locale) },
          ]);
        }
      }
    } finally {
      activeCapture.current = null;
      if (mounted.current) setCapturing(false);
    }
  }

  async function openMap() {
    const url = buildHouseholdMapsUrl(readHouseholdGps(question.survey?.data));
    if (!url) return;
    try { await Linking.openURL(url); }
    catch { if (mounted.current) setStatus("gps_maps_unavailable"); }
  }

  return (
    <QuestionFrame locale={locale} question={question} tone="display">
      {isCaptureControl && gps ? <>
        <Text>{text("gps_latitude")}: {gps.latitude}</Text>
        <Text>{text("gps_longitude")}: {gps.longitude}</Text>
      </> : <Text>{question.value === undefined || question.value === null ? text("not_captured") : String(question.value)}</Text>}
      {isCaptureControl && !readOnly ? (
        <Pressable onPress={capture} disabled={capturing} accessibilityRole="button"
          accessibilityState={{ disabled: capturing, busy: capturing }} style={[controlStyles.button, { flexDirection: "row", gap: 8 }]}>
          {capturing ? <ActivityIndicator color="#ffffff" /> : null}
          <Text style={controlStyles.buttonText}>{text(capturing ? "gps_capturing" : "capture_gps")}</Text>
        </Pressable>
      ) : null}
      {capturing ? <Pressable accessibilityRole="button" onPress={() => activeCapture.current?.cancel()} style={controlStyles.button}>
        <Text style={controlStyles.buttonText}>{text("gps_cancel_capture")}</Text>
      </Pressable> : null}
      {isCaptureControl && gps ? <Pressable accessibilityRole="button" onPress={openMap} style={controlStyles.button}>
        <Text style={controlStyles.buttonText}>{text("gps_open_google_maps")}</Text>
      </Pressable> : null}
      {status ? <Text accessibilityLiveRegion="polite" style={controlStyles.status}>{text(status)}</Text> : null}
    </QuestionFrame>
  );
}
