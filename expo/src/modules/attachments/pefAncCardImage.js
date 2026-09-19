/** Pure helpers for the single PEF Q47 ANC-card image attachment. */
export const PEF_ANC_CARD_VISIBLE_FIELD = "pef_may_see_anc_card";
export const PEF_ANC_CARD_IMAGE_FIELD = "pef_anc_card_image";

export function normalizePefAncCardImage(value) {
  if (!value || typeof value !== "object") return null;
  return {
    attachment_id: value.attachment_id || null,
    local_uri: value.local_uri || "",
    original_name: value.original_name || null,
    mime_type: value.mime_type || null,
    file_size: Number.isFinite(Number(value.file_size)) ? Number(value.file_size) : null,
  };
}

export function validatePefAncCardImage(value) {
  const image = normalizePefAncCardImage(value);
  if (!image?.attachment_id || !String(image.local_uri || "").trim()) {
    return "Upload one image of the ANC card.";
  }
  if (!String(image.mime_type || "").startsWith("image/")) {
    return "The ANC card must be uploaded from the camera or gallery.";
  }
  return null;
}

export function sanitizePefAncCardImage(value) {
  const image = normalizePefAncCardImage(value);
  if (!image) return null;
  return {
    attachment_id: image.attachment_id,
    original_name: image.original_name,
    mime_type: image.mime_type || "image/jpeg",
    file_size: image.file_size,
  };
}
