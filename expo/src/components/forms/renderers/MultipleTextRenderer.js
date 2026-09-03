import { QuestionFrame, controlStyles } from "./QuestionFrame.js";
/** Renders a SurveyJS multiple-text question as individually labeled native inputs. */
import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import {
  getNativeQuestionErrors,
  getNativeQuestionValue,
  setNativeQuestionValue,
  WQ_PREGNANCY_DURATION_FIELD,
} from "../nativeSurveyModel.js";
import { normalizeMultipleTextInputValue } from "./multipleTextValue.js";

function localizedItemText(text, locale = "default") {
  if (typeof text === "string") return text;
  if (text && typeof text === "object") {
    return text[locale] || text.default || text.en || text.english || "";
  }
  return "";
}

export function MultipleTextRenderer({ answerData, locale, question, onChange }) {
  if (
    question.name === WQ_PREGNANCY_DURATION_FIELD ||
    (question.renderingHint || question.jsonObj?.renderingHint) === "pregnancy-duration"
  ) {
    return (
      <PregnancyDurationInput
        answerData={answerData}
        locale={locale}
        onChange={onChange}
        question={question}
      />
    );
  }
  const modelValue = getNativeQuestionValue(question, answerData);
  const answerValue = modelValue && typeof modelValue === "object"
    ? modelValue
    : answerData && Object.prototype.hasOwnProperty.call(answerData, question.name)
      ? answerData[question.name]
      : null;
  return (
    <QuestionFrame locale={locale} question={question}>
      <View style={styles.items}>
        {(question.items || []).map((item) => {
          const unknownChoice = item.unknownChoice || item.jsonObj?.unknownChoice;
          const unknownValue = unknownChoice?.value;
          const itemValue =
            answerValue && Object.prototype.hasOwnProperty.call(answerValue, item.name)
              ? answerValue[item.name]
              : item.value;
          const unknownSelected =
            unknownValue !== undefined && itemValue !== undefined && String(itemValue) === String(unknownValue);
          const commitItemValue = (nextItemValue) => {
            const nextAnswer =
              answerValue && typeof answerValue === "object" ? { ...answerValue } : {};
            if (nextItemValue === undefined) {
              delete nextAnswer[item.name];
            } else {
              nextAnswer[item.name] = nextItemValue;
            }
            item.value = nextItemValue;
            setNativeQuestionValue(
              question,
              Object.keys(nextAnswer).length > 0 ? nextAnswer : undefined
            );
            onChange?.();
          };

          return (
            <View key={item.name} style={styles.item}>
              <Text style={styles.label}>{item.title || item.name}</Text>
              <MultipleTextItemInput
                item={item}
                itemValue={itemValue}
                question={question}
                unknownSelected={unknownSelected}
                onCommit={commitItemValue}
                onChange={onChange}
              />
              {(() => {
                const itemErrors = getNativeQuestionErrors(item.editor ?? item);
                return itemErrors.length
                  ? itemErrors.map((error) => (
                      <Text key={error} style={styles.itemError}>
                        {error}
                      </Text>
                    ))
                  : null;
              })()}
              {unknownChoice ? (
                <TouchableOpacity
                  accessibilityRole="radio"
                  accessibilityState={{ selected: unknownSelected, disabled: question.isReadOnly }}
                  activeOpacity={0.82}
                  disabled={question.isReadOnly}
                  onPress={() => commitItemValue(unknownSelected ? undefined : unknownValue)}
                  style={[controlStyles.option, styles.unknownOption, unknownSelected && controlStyles.optionSelected]}
                >
                  <View style={[controlStyles.optionMark, unknownSelected && controlStyles.optionMarkSelected]} />
                  <Text style={controlStyles.optionText}>{localizedItemText(unknownChoice.text, locale)}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </View>
    </QuestionFrame>
  );
}

function getPregnancyDurationSelection(value) {
  const weeks = String(value?.weeks ?? "").trim();
  const months = String(value?.months ?? "").trim();
  if (weeks && weeks !== "00") return { unit: "weeks", value: weeks };
  if (months && months !== "00") return { unit: "months", value: months };
  if (weeks) return { unit: "weeks", value: weeks };
  if (months) return { unit: "months", value: months };
  return { unit: null, value: "" };
}

function PregnancyDurationInput({ answerData, locale, onChange, question }) {
  const modelValue = getNativeQuestionValue(question, answerData);
  const answerValue = modelValue && typeof modelValue === "object"
    ? modelValue
    : answerData && typeof answerData[question.name] === "object"
      ? answerData[question.name]
      : null;
  const externalSelection = getPregnancyDurationSelection(answerValue);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState(externalSelection.unit);
  const [textValue, setTextValue] = useState(externalSelection.value);
  const selectedItem = (question.items || []).find((item) => item.name === selectedUnit);

  useEffect(() => {
    setSelectedUnit(externalSelection.unit);
    setTextValue(externalSelection.value);
  }, [externalSelection.unit, externalSelection.value]);

  const commitDuration = (unit, nextValue) => {
    for (const item of question.items || []) {
      item.value = item.name === unit ? nextValue : undefined;
    }
    setNativeQuestionValue(
      question,
      unit && nextValue !== undefined && nextValue !== "" ? { [unit]: nextValue } : undefined
    );
    onChange?.();
  };

  const selectUnit = (unit) => {
    setMenuOpen(false);
    setSelectedUnit(unit);
    setTextValue("");
    commitDuration(unit, "");
  };

  return (
    <QuestionFrame locale={locale} question={question}>
      <View style={styles.durationWrap}>
        <Text style={styles.label}>Duration unit</Text>
        <Pressable
          accessibilityRole="button"
          disabled={question.isReadOnly}
          onPress={() => setMenuOpen(true)}
          style={[controlStyles.input, styles.unitSelector, question.isReadOnly && controlStyles.readOnly]}
        >
          <Text style={[styles.unitText, !selectedUnit && styles.placeholderText]}>
            {selectedUnit === "weeks" ? "Weeks" : selectedUnit === "months" ? "Months" : "Select weeks or months"}
          </Text>
          <Text style={styles.chevron}>v</Text>
        </Pressable>

        {selectedItem ? (
          <View style={styles.item}>
            <Text style={styles.label}>{selectedUnit === "weeks" ? "Weeks" : "Months"}</Text>
            <TextInput
              accessibilityLabel={`${question.name}.${selectedUnit}`}
              editable={!question.isReadOnly}
              keyboardType="number-pad"
              maxLength={2}
              onBlur={() => {
                question.validate?.();
                onChange?.();
              }}
              onChangeText={(value) => {
                const normalized = normalizeMultipleTextInputValue(selectedItem, value);
                setTextValue(normalized.sanitized);
                commitDuration(selectedUnit, normalized.value);
              }}
              placeholder="00"
              style={[controlStyles.input, question.isReadOnly && controlStyles.readOnly]}
              value={textValue}
            />
            {getNativeQuestionErrors(selectedItem.editor ?? selectedItem).map((error) => (
              <Text key={error} style={styles.itemError}>{error}</Text>
            ))}
          </View>
        ) : null}
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
        transparent
        visible={menuOpen}
      >
        <Pressable onPress={() => setMenuOpen(false)} style={styles.modalBackdrop}>
          <Pressable onPress={() => {}} style={styles.unitMenu}>
            <Text style={styles.menuTitle}>Pregnancy duration</Text>
            {[
              { label: "Weeks", value: "weeks" },
              { label: "Months", value: "months" },
            ].map((option) => (
              <Pressable
                key={option.value}
                onPress={() => selectUnit(option.value)}
                style={[styles.menuOption, selectedUnit === option.value && styles.menuOptionSelected]}
              >
                <Text style={styles.menuOptionText}>{option.label}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </QuestionFrame>
  );
}

function MultipleTextItemInput({ item, itemValue, question, unknownSelected, onCommit, onChange }) {
  const externalText =
    itemValue === undefined || itemValue === null || unknownSelected ? "" : String(itemValue);
  const [textValue, setTextValue] = useState(externalText);
  const { keyboardType } = normalizeMultipleTextInputValue(item, externalText);

  useEffect(() => {
    setTextValue(externalText);
  }, [externalText]);

  return (
    <TextInput
      accessibilityLabel={`${question.name}.${item.name}`}
      value={textValue}
      editable={!question.isReadOnly && !unknownSelected}
      keyboardType={keyboardType}
      maxLength={item.maxLength > 0 ? item.maxLength : item.jsonObj?.maxLength}
      placeholder={unknownSelected ? "" : item.placeholder}
      onChangeText={(value) => {
        const normalized = normalizeMultipleTextInputValue(item, value);
        const { sanitized } = normalized;
        setTextValue(sanitized);
        onCommit(normalized.value);
      }}
      onBlur={() => {
        question.validate?.();
        onChange?.();
      }}
      style={[
        controlStyles.input,
        (question.isReadOnly || unknownSelected) && controlStyles.readOnly,
        unknownSelected && styles.unknownSelectedInput,
      ]}
    />
  );
}
const styles = StyleSheet.create({
  items: { gap: 10 },
  item: { gap: 5 },
  label: { color: "#344054", fontSize: 13, fontWeight: "700" },
  itemError: { color: "#d92d20", fontSize: 13, fontWeight: "700" },
  unknownOption: { marginTop: 4 },
  unknownSelectedInput: { opacity: 0.5 },
  durationWrap: { gap: 8 },
  unitSelector: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  unitText: { color: "#18202a", fontSize: 16, fontWeight: "700" },
  placeholderText: { color: "#667085", fontWeight: "500" },
  chevron: { color: "#475467", fontSize: 18, fontWeight: "900" },
  modalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(16, 24, 40, 0.45)" },
  unitMenu: { width: "100%", maxWidth: 360, gap: 8, padding: 16, borderRadius: 8, backgroundColor: "#ffffff" },
  menuTitle: { color: "#18202a", fontSize: 18, fontWeight: "900" },
  menuOption: { minHeight: 50, justifyContent: "center", paddingHorizontal: 16, borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 7 },
  menuOptionSelected: { borderColor: "#1f6feb", backgroundColor: "#eaf3ff" },
  menuOptionText: { color: "#18202a", fontSize: 16, fontWeight: "700" },
});
