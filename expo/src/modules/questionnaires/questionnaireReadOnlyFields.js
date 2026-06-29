export function applyReadOnlyFields(model, readOnlyFields) {
  if (!model || !Array.isArray(readOnlyFields) || readOnlyFields.length === 0) {
    return;
  }

  for (const fieldName of readOnlyFields) {
    const question =
      typeof model.getQuestionByName === "function" ? model.getQuestionByName(fieldName) : null;
    if (question) {
      question.readOnly = true;
      continue;
    }

    for (const page of model.pages || []) {
      applyReadOnlyToElementTree(page.elements, fieldName);
    }
  }
}

function applyReadOnlyToElementTree(elements, fieldName) {
  if (!Array.isArray(elements)) {
    return false;
  }

  for (const element of elements) {
    if (element?.name === fieldName) {
      element.readOnly = true;
      return true;
    }

    if (
      applyReadOnlyToElementTree(element?.elements, fieldName) ||
      applyReadOnlyToElementTree(element?.templateElements, fieldName)
    ) {
      return true;
    }
  }

  return false;
}
