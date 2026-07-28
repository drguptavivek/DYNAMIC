/**
 * Renders compact section-state dots on mobile and a detailed navigable section drawer.
 */
import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

const STATUS_LABELS = {
  not_applicable: "Not applicable",
  pending: "Not started",
  in_progress: "In progress",
  needs_attention: "Needs attention",
  complete: "Complete",
};

const STATUS_COLORS = {
  not_applicable: "#98a2b3",
  pending: "#ffffff",
  in_progress: "#fdb022",
  needs_attention: "#d92d20",
  complete: "#12b76a",
};

export function SectionNavigator({
  drawerOpen: controlledDrawerOpen,
  onDrawerOpenChange,
  onSelect,
  sections,
  showCompactTrigger = true,
}) {
  const { width } = useWindowDimensions();
  const compact = width < 700;
  const [internalDrawerOpen, setInternalDrawerOpen] = useState(false);
  const drawerOpen = controlledDrawerOpen ?? internalDrawerOpen;
  const progressSections = sections.filter(
    (section) => section.showInCompactProgress !== false && section.applicable !== false
  );

  function setDrawerOpen(nextOpen) {
    if (controlledDrawerOpen === undefined) setInternalDrawerOpen(nextOpen);
    onDrawerOpenChange?.(nextOpen);
  }

  function selectSection(section) {
    setDrawerOpen(false);
    onSelect?.(section);
  }

  if (!compact) {
    return <WideSectionNavigator sections={sections} onSelect={onSelect} />;
  }

  return (
    <View style={styles.compactWrap}>
      {showCompactTrigger ? (
        <Pressable
          accessibilityLabel="Open section navigator"
          onPress={() => setDrawerOpen(true)}
          style={styles.sectionButton}
        >
          <Text style={styles.sectionButtonText}>Sections</Text>
        </Pressable>
      ) : null}
      <View
        accessibilityLabel="Section progress"
        style={[styles.dots, !showCompactTrigger && styles.dotsOnly]}
      >
        {progressSections.map((section, index) => (
          <Pressable
            key={section.name}
            accessibilityLabel={`${index + 1}. ${section.title}. ${STATUS_LABELS[section.status] || section.status}`}
            hitSlop={8}
            onPress={() => setDrawerOpen(true)}
            style={styles.dotTarget}
          >
            <View
              style={[
                styles.dot,
                { backgroundColor: STATUS_COLORS[section.status] || STATUS_COLORS.pending },
                section.status === "pending" && styles.dotPending,
                section.isCurrent && styles.dotCurrent,
              ]}
            />
          </Pressable>
        ))}
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setDrawerOpen(false)}
        transparent
        visible={drawerOpen}
      >
        <View style={styles.modalRoot}>
          <View style={[styles.drawer, { width: Math.min(width * 0.86, 360) }]}>
            <View style={styles.drawerHeader}>
              <View>
                <Text style={styles.drawerTitle}>Questionnaire sections</Text>
                <Text style={styles.drawerSubtitle}>Select a section to continue</Text>
              </View>
              <Pressable
                accessibilityLabel="Close section navigator"
                onPress={() => setDrawerOpen(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.drawerRows}>
              {sections.map((section, index) => (
                <Pressable
                  key={section.name}
                  disabled={!section.applicable}
                  onPress={() => selectSection(section)}
                  style={[
                    styles.drawerRow,
                    section.isCurrent && styles.drawerRowCurrent,
                    !section.applicable && styles.itemDisabled,
                  ]}
                >
                  <View
                    style={[
                      styles.drawerDot,
                      { backgroundColor: STATUS_COLORS[section.status] || STATUS_COLORS.pending },
                      section.status === "pending" && styles.dotPending,
                    ]}
                  />
                  <View style={styles.drawerRowText}>
                    <Text style={[styles.drawerRowTitle, section.isCurrent && styles.titleCurrent]}>
                      {`${index + 1}. ${section.title}`}
                    </Text>
                    <Text style={[styles.status, styles[`status_${section.status}`]]}>
                      {STATUS_LABELS[section.status] || section.status}
                      {section.total ? ` · ${section.answered}/${section.total}` : ""}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <Pressable
            accessibilityLabel="Close section navigator"
            onPress={() => setDrawerOpen(false)}
            style={styles.scrim}
          />
        </View>
      </Modal>
    </View>
  );
}

function WideSectionNavigator({ sections, onSelect }) {
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
  compactWrap: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 10 },
  sectionButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, borderWidth: 1, borderColor: "#98a2b3", borderRadius: 8, backgroundColor: "#ffffff" },
  sectionButtonText: { color: "#344054", fontSize: 13, fontWeight: "800" },
  dots: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 3 },
  dotsOnly: { justifyContent: "center", paddingHorizontal: 48 },
  dotTarget: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: "transparent" },
  dotPending: { borderColor: "#98a2b3" },
  dotCurrent: { borderWidth: 3, borderColor: "#1f6feb" },
  modalRoot: { flex: 1, flexDirection: "row" },
  drawer: { height: "100%", gap: 12, paddingHorizontal: 16, paddingTop: 28, paddingBottom: 20, backgroundColor: "#ffffff", zIndex: 2 },
  scrim: { flex: 1, height: "100%", backgroundColor: "rgba(15, 23, 42, 0.46)" },
  drawerHeader: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#e4e7ec" },
  drawerTitle: { color: "#18202a", fontSize: 18, fontWeight: "800" },
  drawerSubtitle: { color: "#667085", fontSize: 12 },
  closeButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 10, borderRadius: 8, backgroundColor: "#eef2f5" },
  closeButtonText: { color: "#344054", fontSize: 12, fontWeight: "800" },
  drawerRows: { gap: 8, paddingBottom: 24 },
  drawerRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, padding: 11, borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, backgroundColor: "#ffffff" },
  drawerRowCurrent: { borderColor: "#1f6feb", backgroundColor: "#eef6ff" },
  drawerDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: "transparent" },
  drawerRowText: { flex: 1, gap: 3 },
  drawerRowTitle: { color: "#344054", fontSize: 14, fontWeight: "800" },
});
