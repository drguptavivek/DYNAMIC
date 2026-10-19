import React, { useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { buildHouseholdMapsUrl } from "../lib/householdGps.js";
import { getSavedHouseholdGps } from "../modules/households/householdGpsRepository.js";

export function SavedHouseholdLocation({ householdId, visible = true }) {
  const [result, setResult] = useState(null);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const request = ++generation.current;
    if (!visible || !householdId) return undefined;
    let active = true;
    setResult(null);
    Promise.resolve().then(() => active ? getSavedHouseholdGps(householdId) : null).then(
      (gps) => { if (active) setResult({ householdId, gps }); },
      () => { if (active) setResult({ householdId, error: "Could not load the saved location." }); },
    );
    return () => { active = false; if (generation.current === request) generation.current += 1; };
  }, [householdId, visible, retry]);

  if (!visible || !householdId || !result || result.householdId !== householdId || (!result.gps && !result.error)) return null;
  async function openMaps() {
    const request = generation.current;
    try {
      await Linking.openURL(buildHouseholdMapsUrl(result.gps));
      if (generation.current === request) setResult((current) => ({ ...current, error: undefined }));
    } catch {
      if (generation.current === request) {
        setResult((current) => ({ ...current, error: "Could not open Google Maps. Please try again." }));
      }
    }
  }
  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>Saved household location</Text>
      {result.gps ? (
        <>
          <Text selectable>Latitude: {result.gps.latitude}</Text>
          <Text selectable>Longitude: {result.gps.longitude}</Text>
          <Pressable accessibilityRole="button" onPress={openMaps} style={styles.button}>
            <Text style={styles.buttonText}>Open in Google Maps</Text>
          </Pressable>
        </>
      ) : null}
      {result.error ? <Text accessibilityRole="alert" style={styles.error}>{result.error}</Text> : null}
      {result.error && !result.gps ? (
        <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)} style={styles.button}>
          <Text style={styles.buttonText}>Retry location</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { width: "100%", padding: 12, gap: 5 },
  heading: { fontWeight: "700", color: "#344054" },
  button: { alignSelf: "flex-start", backgroundColor: "#1d6fe8", borderRadius: 8, padding: 10, marginTop: 5 },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: "#b42318" },
});
