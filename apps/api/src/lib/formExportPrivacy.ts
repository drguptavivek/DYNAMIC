export const FORM_EXPORT_MASK = "***";

const identifyingFields = new Set([
  "wq_name_woman",
  "wq_01_respondent_s_backgr_record_the_husband_partner_s_name_and_line",
  "pregnancy_02_reproduction_what_name_was_given_to_the_baby",
  "wq_01_respondent_s_backgr_in_what_month_and_year_were_you_born",
  "pregnancy_02_reproduction_check_16_and_17_type_of_pregnancy_outcome",
  "submitted_by_username", "device_id",
  "uf_upload_photo_pdf_usg_report_ancy",
  "pef_ultrasound_reports", "pff_additional_ultrasound_reports",
]);

const nonIdentifyingFields = new Set([
  // This legacy variable is the number of sleeping rooms, not a phone number.
  "hhq_contact_mobile_2",
  "hhq_household_landline_telephone",
  "hhq_any_member_household_own_mobile_telephone_tablet",
  "psf_same_address_status",
]);

function normalizedKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function isIdentifyingField(key: string): boolean {
  const name = normalizedKey(key);
  if (nonIdentifyingFields.has(name)) return false;
  if (identifyingFields.has(name)) return true;
  return /(?:^|_)(?:name|names|username|email)(?:_?\d+)?$/.test(name)
    || /(?:^|_)(?:name|names)_(?:of_)?(?:woman|husband|wife|child|children|baby|infant|mother|father|respondent|member|household_head)(?:_|$)/.test(name)
    || /(?:^|_)(?:mobile|phone|telephone|landline)(?:_number|_no)?(?:_(?:resp|respondent|woman|husband|partner|mother|father|\d+))?$/.test(name)
    || /(?:^|_)(?:address|address_line_?\d*|gps|latitude|longitude|altitude|coordinates|landmark|postal_code|postcode|pincode)(?:_|$)/.test(name)
    || /(?:^|_)(?:dob|date_of_birth|birth_date|birth_time|delivery_date|delivery_time)(?:_|$)/.test(name)
    || /(?:^|_)(?:other_specify|free_answer|comment|comments|remark|remarks|note|notes|narrative)(?:_|$)/.test(name)
    || /(?:^|_)(?:aadhaar|aadhar|passport|voter_id|national_id|pan_number)(?:_|$)/.test(name)
    || /(?:^|_)(?:registry|hdss)_(?:uid|id|unique_id|individual_id)(?:_|$)/.test(name)
    || /(?:^|_)(?:image|photo|signature|file_path|original_file_name|relative_path|local_uri)(?:_|$)/.test(name)
    || name === "uri" || name === "url";
}

/** Copy export values while suppressing identifying fields, before decoding or serialization. */
export function maskFormExportValue(key: string, value: unknown): unknown {
  return maskValue(key, value, false);
}

function maskValue(key: string, value: unknown, contactContent: boolean): unknown {
  if (value === undefined || value === null || value === "") return value;
  if (isIdentifyingField(key)) return FORM_EXPORT_MASK;
  if (value instanceof Date) return value;
  const maskContactContent = contactContent || /(?:^|_)(?:mobile_numbers|phone_numbers|contact_numbers|contacts)$/.test(normalizedKey(key));
  if (Array.isArray(value)) return value.map((entry) => maskValue("", entry, maskContactContent));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([childKey, child]) => [childKey, maskValue(childKey, child, maskContactContent)]));
  }
  return maskContactContent ? FORM_EXPORT_MASK : value;
}
