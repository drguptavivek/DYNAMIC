/**
 * Provides the Survey Core locale selector as a compact secondary dropdown on mobile.
 */
import React, { useMemo, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { LanguageToggle } from "../LanguageToggle.js";
import { QUESTIONNAIRE_LANGUAGES } from "./questionnaireLanguages.js";

export function RendererLanguageSwitcher({ iconOnly = false, locale, onChange }) {
  const { width } = useWindowDimensions();
  const compact = Platform.OS !== "web" || width < 700;
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 140 });
  const nativeMenuPosition = useMemo(() => ({
    top: iconOnly ? 76 : 60,
    left: Math.max(12, width - 172),
    width: 160,
  }), [iconOnly, width]);
  const activeLanguage = QUESTIONNAIRE_LANGUAGES.find((language) => language.code === locale) || QUESTIONNAIRE_LANGUAGES[0];
  const menu = (
    <View style={[styles.menu, Platform.OS === "web" ? menuPosition : nativeMenuPosition]}>
      <ScrollView keyboardShouldPersistTaps="handled" removeClippedSubviews>
        {QUESTIONNAIRE_LANGUAGES.map((language) => {
          const active = language.code === locale;
          return (
            <Pressable
              key={language.code}
              onPress={() => selectLanguage(language.code)}
              style={[styles.option, active && styles.optionActive]}
            >
              <Text style={[styles.optionText, active && styles.optionTextActive]}>
                {language.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  function openMenu() {
    if (Platform.OS !== "web") {
      setOpen(true);
      return;
    }
    triggerRef.current?.measureInWindow?.((x, y, measuredWidth, height) => {
      setMenuPosition({
        top: y + height + 4,
        left: Math.min(x, width - Math.max(measuredWidth, 140) - 12),
        width: Math.max(measuredWidth, 140),
      });
      setOpen(true);
    });
  }

  function selectLanguage(code) {
    setOpen(false);
    requestAnimationFrame(() => {
      onChange(code);
    });
  }

  if (!compact) {
    return <LanguageToggle locale={locale} onChange={onChange} />;
  }

  return (
    <>
      <Pressable
        accessibilityHint="Opens the questionnaire language menu"
        accessibilityLabel={`Language: ${activeLanguage.label}`}
        onPress={openMenu}
        ref={triggerRef}
        style={[styles.trigger, iconOnly && styles.iconTrigger]}
      >
        {iconOnly ? (
          <MaterialCommunityIcons color="#344054" name="translate" size={22} />
        ) : (
          <Text numberOfLines={1} style={styles.triggerText}>{activeLanguage.label}</Text>
        )}
      </Pressable>
      {Platform.OS === "web" ? (
        <Modal animationType="none" hardwareAccelerated onRequestClose={() => setOpen(false)} transparent visible={open}>
          <View style={styles.modalRoot}>
            <Pressable
              accessibilityLabel="Close language menu"
              onPress={() => setOpen(false)}
              style={StyleSheet.absoluteFill}
            />
            {menu}
          </View>
        </Modal>
      ) : open ? menu : null}
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { minHeight: 44, flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, borderWidth: 1, borderColor: "#98a2b3", borderRadius: 8, backgroundColor: "#ffffff" },
  iconTrigger: { width: 44, flex: 0, paddingHorizontal: 0, borderColor: "#d0d5dd" },
  triggerText: { color: "#344054", fontSize: 13, fontWeight: "800" },
  modalRoot: { flex: 1 },
  menu: { position: "absolute", maxHeight: 320, overflow: "hidden", borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, backgroundColor: "#ffffff", shadowColor: "#101828", shadowOpacity: 0.18, shadowRadius: 12, elevation: 6 },
  option: { minHeight: 46, justifyContent: "center", paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#eaecf0" },
  optionActive: { backgroundColor: "#eef6ff" },
  optionText: { color: "#344054", fontSize: 14, fontWeight: "700" },
  optionTextActive: { color: "#1f6feb" },
});
