import { QuestionFrame, controlStyles } from "./QuestionFrame.js";
/** Renders a SurveyJS multiple-text question as individually labeled native inputs. */
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { getNativeQuestionErrors, getNativeQuestionValue, setNativeQuestionValue } from "../nativeSurveyModel.js";

function localizedItemText(text, locale = "default") {
  if (typeof text === "string") return text;
  if (text && typeof text === "object") {
    return text[locale] || text.default || text.en || text.english || "";
  }
  return "";
}

export function MultipleTextRenderer({ answerData, locale, question, onChange }) {
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

function MultipleTextItemInput({ item, itemValue, question, unknownSelected, onCommit, onChange }) {
  const externalText =
    itemValue === undefined || itemValue === null || unknownSelected ? "" : String(itemValue);
  const [textValue, setTextValue] = useState(externalText);

  useEffect(() => {
    setTextValue(externalText);
  }, [externalText]);

  return (
    <TextInput
      accessibilityLabel={`${question.name}.${item.name}`}
      value={textValue}
      editable={!question.isReadOnly}
      keyboardType={item.inputType === "number" ? "numeric" : "default"}
      maxLength={item.maxLength > 0 ? item.maxLength : item.jsonObj?.maxLength}
      placeholder={item.placeholder}
      onChangeText={(value) => {
        const sanitized = item.inputType === "number" ? value.replace(/[^0-9.-]/g, "") : value;
        setTextValue(sanitized);
        const preserveString = item.preserveString === true || item.jsonObj?.preserveString === true;
        const nextItemValue =
          sanitized === ""
            ? undefined
            : item.inputType === "number" && !preserveString
              ? Number(sanitized)
              : sanitized;
        onCommit(nextItemValue);
      }}
      onBlur={() => {
        question.validate?.();
        onChange?.();
      }}
      style={[controlStyles.input, question.isReadOnly && controlStyles.readOnly]}
    />
  );
}

const styles = StyleSheet.create({
  items: { gap: 10 },
  item: { gap: 5 },
  label: { color: "#344054", fontSize: 13, fontWeight: "700" },
  itemError: { color: "#d92d20", fontSize: 13, fontWeight: "700" },
  unknownOption: { marginTop: 4 },
});
