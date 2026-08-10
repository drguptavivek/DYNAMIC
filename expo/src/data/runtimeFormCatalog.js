import { formsByCode } from "./formCatalog";
import { getCachedProtocolForm } from "../modules/sync/syncService.js";

export function getRuntimeFormByCode(formCode) {
  const normalizedCode = String(formCode || "").toUpperCase();
  try {
    return getCachedProtocolForm(normalizedCode) || formsByCode[normalizedCode];
  } catch (error) {
    return formsByCode[normalizedCode];
  }
}
