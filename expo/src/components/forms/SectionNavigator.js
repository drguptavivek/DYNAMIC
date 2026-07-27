/** Renders section applicability and completion state and allows permitted section jumps. */
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const STATUS_LABELS = {
  not_applicable: "Not applicable",
  pending: "Pending",
  in_progress: "In progress",
  needs_attention: "Needs attention",
  complete: "Complete",
};

export function SectionNavigator({ sections, onSelect }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Sections</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.items}>
        {sections.map((section) => (
          <Pressable
            key={section.name}
            disabled={!section.applicable}
            onPress={() => onSelect?.(section)}
            style={[
              styles.item,
              section.isCurrent && styles.itemCurrent,
              !section.applicable && styles.itemDisabled,
            ]}
          >
            <Text style={[styles.title, section.isCurrent && styles.titleCurrent]} numberOfLines={2}>
              {section.title}
            </Text>
            <Text style={[styles.status, styles[`status_${section.status}`]]}>
              {STATUS_LABELS[section.status] || section.status}
              {section.total ? ` · ${section.answered}/${section.total}` : ""}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 7 },
  heading: { color: "#344054", fontSize: 13, fontWeight: "800" },
  items: { gap: 8, paddingBottom: 2 },
  item: { width: 190, minHeight: 70, gap: 6, padding: 10, borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, backgroundColor: "#ffffff" },
  itemCurrent: { borderColor: "#1f6feb", backgroundColor: "#eef6ff" },
  itemDisabled: { opacity: 0.45 },
  title: { color: "#344054", fontSize: 13, fontWeight: "800" },
  titleCurrent: { color: "#1f6feb" },
  status: { fontSize: 12, fontWeight: "700" },
  status_not_applicable: { color: "#667085" },
  status_pending: { color: "#667085" },
  status_in_progress: { color: "#b54708" },
  status_needs_attention: { color: "#d92d20" },
  status_complete: { color: "#027a48" },
});
