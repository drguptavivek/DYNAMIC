import { formCatalog } from "./formMetadata.js";
import FORM_LOADERS from "./bundledFormLoaders.cjs";

export { formCatalog };

// Metro includes these static targets in the bundle but evaluates each JSON
// module only when that questionnaire is first opened.
const bundledFormCache = new Map();

export function getBundledFormByCode(formCode) {
  const code = String(formCode || "").trim().toUpperCase();
  const load = FORM_LOADERS[code];
  if (!load) return undefined;
  if (!bundledFormCache.has(code)) {
    const loaded = load();
    bundledFormCache.set(code, loaded?.default || loaded);
  }
  return bundledFormCache.get(code);
}

// Compatibility for validators and non-startup consumers. Access stays lazy.
export const formsByCode = {};
for (const code of Object.keys(FORM_LOADERS)) {
  Object.defineProperty(formsByCode, code, {
    enumerable: true,
    get: () => getBundledFormByCode(code),
  });
}
