function requiresExactDigits(item) {
  return (item?.validators || []).some((validator) => {
    const regex = String(validator?.regex || validator?.jsonObj?.regex || "");
    return /\^\[0-9\]\{\d+\}\$$/.test(regex) || /\^\\d\{\d+\}\$$/.test(regex);
  });
}

export function normalizeMultipleTextInputValue(item, value) {
  const usesNumericKeyboard =
    item?.inputType === "number" ||
    (item?.validators || []).some((validator) => {
      const regex = String(validator?.regex || validator?.jsonObj?.regex || "");
      return validator?.getType?.() === "numeric" || validator?.type === "numeric" || /\\d|\[0-9\]/.test(regex);
    });
  const sanitized = usesNumericKeyboard ? value.replace(/[^0-9.-]/g, "") : value;
  const preserveString =
    item?.preserveString === true ||
    item?.jsonObj?.preserveString === true ||
    requiresExactDigits(item);

  return {
    sanitized,
    usesNumericKeyboard,
    value:
      sanitized === ""
        ? undefined
        : item?.inputType === "number" && !preserveString
          ? Number(sanitized)
          : sanitized,
  };
}
