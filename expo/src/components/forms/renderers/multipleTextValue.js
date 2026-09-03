function requiresExactDigits(item) {
  return (item?.validators || []).some((validator) => {
    const regex = String(validator?.regex || validator?.jsonObj?.regex || "");
    return /\^\[0-9\]\{\d+\}\$$/.test(regex) || /\^\\d\{\d+\}\$$/.test(regex);
  });
}

function metadataValue(question, key) {
  if (question?.[key] !== undefined && question?.[key] !== null) return question[key];
  if (question?.jsonObj?.[key] !== undefined && question?.jsonObj?.[key] !== null) {
    return question.jsonObj[key];
  }
  if (question?.metadata?.[key] !== undefined && question?.metadata?.[key] !== null) {
    return question.metadata[key];
  }
  if (question?.jsonObj?.metadata?.[key] !== undefined && question?.jsonObj?.metadata?.[key] !== null) {
    return question.jsonObj.metadata[key];
  }
  return undefined;
}

function renderAsValue(question) {
  return String(
    metadataValue(question, "renderAs") ||
      question?.renderingHint?.render_as ||
      question?.jsonObj?.renderingHint?.render_as ||
      ""
  ).toLowerCase();
}

function inputTypeValue(question) {
  return String(metadataValue(question, "inputType") || "").toLowerCase();
}

function sourceTypeValue(question) {
  return String(metadataValue(question, "sourceType") || "").toLowerCase();
}

function searchableQuestionText(question) {
  const title = question?.title;
  const localizedTitle = title && typeof title === "object" ? Object.values(title).join(" ") : title;
  return [question?.name, localizedTitle, question?.rawText, question?.jsonObj?.name,
    question?.jsonObj?.rawText]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function validatorRegexes(question) {
  return (question?.validators || []).map((validator) =>
    String(validator?.regex || validator?.jsonObj?.regex || "")
  );
}

function validatorTypes(question) {
  return (question?.validators || []).map((validator) =>
    String(validator?.getType?.() || validator?.type || validator?.jsonObj?.type || "").toLowerCase()
  );
}

function hasDecimalPattern(question) {
  return validatorRegexes(question).some((regex) =>
    /(?:\\d|\[0-9\]|\d)/.test(regex) && /\\\.|\[\.\]/.test(regex)
  );
}

function hasNumericPattern(question) {
  return validatorRegexes(question).some((regex) => /\\d|\[0-9\]/.test(regex));
}

/** Select the native keyboard without changing the question's value type. */
export function getNativeKeyboardType(question) {
  const inputType = inputTypeValue(question);
  const renderAs = renderAsValue(question);
  const sourceType = sourceTypeValue(question);
  const explicitKeyboard = String(metadataValue(question, "keyboardType") || "").toLowerCase();
  const questionText = searchableQuestionText(question);

  if (
    ["phone", "tel", "telephone"].includes(inputType) ||
    renderAs.includes("phone") ||
    /\b(phone|mobile|telephone)\b/.test(questionText.replace(/_/g, " "))
  ) {
    return "phone-pad";
  }
  if (["phone-pad", "number-pad", "decimal-pad", "numeric", "default"].includes(explicitKeyboard)) {
    return explicitKeyboard;
  }

  const decimal =
    ["decimal", "float", "double"].includes(sourceType) ||
    metadataValue(question, "decimalPlaces") !== undefined ||
    metadataValue(question, "isDecimal") === true ||
    hasDecimalPattern(question);
  const numericRender =
    renderAs === "numeric_textbox" ||
    renderAs === "numeric_textboxes" ||
    renderAs === "multiple_numeric_textbox" ||
    renderAs === "multiple_numeric_textboxes" ||
    renderAs.startsWith("numeric_");
  const numericValidator = validatorTypes(question).some((type) =>
    ["numeric", "numericvalidator", "number", "numeric_validator"].includes(type)
  );
  const numericPattern = hasNumericPattern(question);

  if (decimal) return "decimal-pad";
  if (inputType === "number" || numericRender || numericValidator || numericPattern) {
    return "number-pad";
  }
  return "default";
}

/** Keep numeric input valid for its selected keyboard while retaining text. */
export function sanitizeNativeInputValue(value, keyboardType) {
  const text = value === undefined || value === null ? "" : String(value);
  if (keyboardType === "phone-pad" || keyboardType === "number-pad") {
    return text.replace(/[^0-9]/g, "");
  }
  if (keyboardType === "decimal-pad") {
    const sign = text.trimStart().startsWith("-") ? "-" : "";
    const digitsAndDot = text.replace(/[^0-9.]/g, "");
    const [whole, ...fraction] = digitsAndDot.split(".");
    return `${sign}${whole}${fraction.length ? `.${fraction.join("")}` : ""}`;
  }
  return text;
}

export function normalizeMultipleTextInputValue(item, value) {
  const keyboardType = getNativeKeyboardType(item);
  const usesNumericKeyboard = keyboardType !== "default";
  const sanitized = sanitizeNativeInputValue(value, keyboardType);
  const preserveString =
    item?.preserveString === true ||
    item?.jsonObj?.preserveString === true ||
    requiresExactDigits(item);

  return {
    sanitized,
    keyboardType,
    usesNumericKeyboard,
    value:
      sanitized === ""
        ? undefined
        : item?.inputType === "number" && !preserveString
          ? Number(sanitized)
          : sanitized,
  };
}
