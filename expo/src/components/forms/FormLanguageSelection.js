/** Requires a declared questionnaire language before exposing interview inputs. */
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { QUESTIONNAIRE_LANGUAGES } from "./questionnaireLanguages.js";

export function FormLanguageSelection({ initialLocale, onStart, onClose }) {
  const [selected, setSelected] = useState(initialLocale || "default");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    setSaving(true);
    setError("");
    try {
      await onStart(selected);
    } catch (cause) {
      setError(cause?.message || "Could not start the questionnaire. Please try again.");
      setSaving(false);
    }
  }
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.panel}>
        <Text style={styles.title}>Select questionnaire language</Text>
        <Text>Choose the language before starting. It cannot be changed during this questionnaire.</Text>
        {QUESTIONNAIRE_LANGUAGES.map((language) => (
          <Pressable
            key={language.code}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected === language.code, disabled: saving }}
            disabled={saving}
            onPress={() => setSelected(language.code)}
            style={[styles.option, selected === language.code && styles.selected]}
          >
            <Text>{language.label}</Text>
          </Pressable>
        ))}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={saving} onPress={start} style={styles.start}>
          <Text style={styles.startText}>{saving ? "Starting..." : "Start questionnaire"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={saving} onPress={onClose} style={styles.option}>
          <Text>Close</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, padding: 22, justifyContent: "center" },
  panel: { gap: 12, padding: 20, borderRadius: 8, backgroundColor: "white", maxWidth: 560, width: "100%", alignSelf: "center" },
  title: { fontSize: 22, fontWeight: "700" },
  option: { padding: 14, borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8 },
  selected: { borderColor: "#175cd3", backgroundColor: "#eff8ff" },
  start: { padding: 16, borderRadius: 8, backgroundColor: "#175cd3", alignItems: "center" },
  startText: { color: "white", fontWeight: "700" },
  error: { color: "#b42318" },
});
