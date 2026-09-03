import { getFormDisplayCode } from "../lib/formDisplayCodes.js";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export function FormSelector({ forms, selectedCode, onSelect }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Questionnaires</Text>
      <ScrollView style={styles.list}>
        {forms.map((form) => {
          const active = form.form_code === selectedCode;
          return (
            <Pressable
              key={form.form_code}
              onPress={() => onSelect(form.form_code)}
              style={[styles.item, active && styles.activeItem]}
            >
              <Text style={[styles.code, active && styles.activeText]}>{getFormDisplayCode(form.form_code)}</Text>
              <View style={styles.itemText}>
                <Text style={[styles.title, active && styles.activeText]} numberOfLines={2}>
                  {form.title}
                </Text>
                <Text style={[styles.meta, active && styles.activeMeta]}>
                  {`${form.version} · ${form.question_count} fields`}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    gap: 8
  },
  label: {
    fontSize: 12,
    textTransform: "uppercase",
    fontWeight: "700",
    color: "#667085"
  },
  list: {
    flex: 1
  },
  item: {
    flexDirection: "row",
    gap: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 8,
    backgroundColor: "#ffffff"
  },
  activeItem: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a"
  },
  code: {
    width: 44,
    fontSize: 13,
    fontWeight: "800",
    color: "#1f6feb"
  },
  itemText: {
    flex: 1,
    gap: 3
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#18202a"
  },
  meta: {
    fontSize: 12,
    color: "#667085"
  },
  activeText: {
    color: "#ffffff"
  },
  activeMeta: {
    color: "#cbd5e1"
  }
});
