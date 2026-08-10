import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { QUESTIONNAIRE_LANGUAGES } from "./forms/questionnaireLanguages.js";

export function LanguageToggle({ locale, onChange }) {
  return (
    <View style={styles.wrap}>
      {QUESTIONNAIRE_LANGUAGES.map((language) => {
        const active = language.code === locale;
        return (
          <Pressable
            key={language.code}
            onPress={() => onChange(language.code)}
            style={[styles.button, active && styles.active]}
          >
            <Text style={[styles.text, active && styles.activeText]}>
              {language.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    overflow: "hidden"
  },
  button: {
    flexGrow: 1,
    minWidth: 96,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
    backgroundColor: "#ffffff"
  },
  active: {
    backgroundColor: "#1f6feb"
  },
  text: {
    fontWeight: "700",
    color: "#334155"
  },
  activeText: {
    color: "#ffffff"
  }
});
