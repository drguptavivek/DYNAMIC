import { formsByCode } from "./formCatalog";
import { getCachedProtocolForm } from "../modules/sync/syncService.js";

const CLIENT_RENDERER_FIELDS = ["renderAs"];

function visitElements(elements, callback) {
  for (const element of elements || []) {
    callback(element);
    visitElements(element?.elements, callback);
    visitElements(element?.templateElements, callback);
  }
}

export function preserveClientRendererMetadata(runtimeForm, bundledForm) {
  if (!runtimeForm || !bundledForm) return runtimeForm || bundledForm;

  const metadataByName = new Map();
  for (const page of bundledForm.pages || []) {
    visitElements(page.elements, (element) => {
      if (!element?.name) return;
      const metadata = {};
      for (const field of CLIENT_RENDERER_FIELDS) {
        if (element[field] !== undefined) metadata[field] = element[field];
      }
      if (Object.keys(metadata).length) metadataByName.set(element.name, metadata);
    });
  }

  const merged = JSON.parse(JSON.stringify(runtimeForm));
  for (const page of merged.pages || []) {
    visitElements(page.elements, (element) => {
      const metadata = metadataByName.get(element?.name);
      if (metadata) Object.assign(element, metadata);
    });
  }
  return merged;
}

export function getRuntimeFormByCode(formCode) {
  const normalizedCode = String(formCode || "").toUpperCase();
  try {
    const bundledForm = formsByCode[normalizedCode];
    const cachedForm = getCachedProtocolForm(normalizedCode);
    return cachedForm
      ? preserveClientRendererMetadata(cachedForm, bundledForm)
      : bundledForm;
  } catch (error) {
    return formsByCode[normalizedCode];
  }
}
