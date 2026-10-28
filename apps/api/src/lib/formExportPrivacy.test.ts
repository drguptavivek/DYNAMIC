import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getPreparedSurveyJson } from "../../../../expo/src/modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import { FORM_EXPORT_MASK, maskFormExportValue } from "./formExportPrivacy";

test("Non-PIS masks identifying questions in every current raw and prepared questionnaire", () => {
  const catalog = JSON.parse(readFileSync(new URL("../../../../expo/src/data/forms/index.json", import.meta.url), "utf8"));
  assert.equal(catalog.length, 12);
  for (const form of catalog) {
    const raw = JSON.parse(readFileSync(new URL(`../../../../expo/src/data/forms/${form.file_name}`, import.meta.url), "utf8"));
    const identifying = new Set<string>();
    function walk(node: any) {
      if (!node || typeof node !== "object") return;
      const title = String(typeof node.title === "object" ? node.title.default ?? "" : node.title ?? "");
      const input = ["text", "multipletext", "file"].includes(node.type);
      if (node.name && input && (
        /^(?:\d+\.\s*)?(?:Name of|Address of|Woman's current address|Current address|What is your new address|Please give address|What name was given to the baby|In what month and year were you born|Date of birth|Date of delivery|Time of birth|Time of delivery)/i.test(title)
        || /^Please enter the mobile number/i.test(title)
        || /(?:^|_)name$/.test(node.name)
        || node.inputType === "tel" || node.type === "file"
        || /(?:other_specify|free_answer)/.test(node.name)
        || /(?:image|ultrasound_reports)/.test(node.renderAs || "")
      )) identifying.add(node.name);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(walk);
        else walk(value);
      }
    }
    walk(raw);
    walk(getPreparedSurveyJson(raw));
    assert.ok(identifying.size > 0, `${form.form_code}: real identifying fields inventoried`);
    for (const key of identifying) {
      assert.equal(maskFormExportValue(key, "PRIVATE_PERSON_9876543210"), FORM_EXPORT_MASK,
        `${form.form_code}: ${key} must not expose identifying data`);
    }
  }
});

test("Non-PIS preserves roster rows and clinical codes while masking nested identifiers", () => {
  const householdId = "4-90-0001-01";
  const personId = `${householdId}-02`;
  const answers = {
    hhq_household_id: householdId,
    hhq_household_number: "01",
    hhq_household_head_name: "PRIVATE_HEAD",
    hhq_household_address: "PRIVATE_ADDRESS",
    hhq_contact_mobile_2: 3,
    hhq_gps_latitude: 0,
    hhq_gps_longitude: 77.12345,
    hhq_household_landline_telephone: 2,
    hhq_any_member_household_own_mobile_telephone_tablet: 1,
    hhq_contact_mobile_numbers: [{ mobile_number: "9876543210", mobile_holder_name: "PRIVATE_HOLDER" }, { number: "9123456789" }],
    hhq_household_members: [{
      member_individual_id: personId, member_line_number: "02", member_name: "PRIVATE_MEMBER",
      member_registry_name: "PRIVATE_REGISTRY_NAME", member_registry_uid: "PRIVATE_REGISTRY_UID",
      member_registry_individual_id: "PRIVATE_EXTERNAL_ID", member_sex: 2,
      member_age_years: 28, member_birth_registration_status: 1,
      member_residence_duration: { years: 4, months: 0 },
    }],
    wq_pregnancy_history: [{
      pregnancy_02_reproduction_what_name_was_given_to_the_baby: "PRIVATE_CHILD",
      pregnancy_02_reproduction_is_name_a_boy_or_a_girl: 2,
      pregnancy_02_reproduction_is_name_still_alive: 1,
      pregnancy_02_reproduction_if_born_alive_and_still_living_is_name_liv: 2,
      pregnancy_02_reproduction_check_16_and_17_type_of_pregnancy_outcome: { day: "01", month: "02", year: "2020" },
    }],
    psf_same_address_status: 1, wq_age_last_birthday: 28,
    wq_01_respondent_s_backgr_in_what_month_and_year_were_you_born: { month: "02", year: "1998" },
    pef_blood_pressure: { systolic: 120, diastolic: 80 },
    pef_anc_card_image: { attachment_id: "private-image-id", local_uri: "file:///PRIVATE_CARD.jpg" },
    pff_additional_ultrasound_reports: [{ images: [{ relative_path: "imageuploads/PRIVATE.jpg" }] }],
    narrative: { comments: "PRIVATE_NOTE", otherSpecify: "PRIVATE_OTHER" },
    national_id: "PRIVATE_GOVERNMENT_ID", pof_delivery_date: "2026-10-01", baf_birth_date: "2026-10-01",
    wq_interview_date: "2026-10-28", uf_ultrasound_date: "2026-09-01",
    ordinary_code: 0, ordinary_false: false, unknown_clinical_code: 999,
  };
  const before = JSON.stringify(answers);
  const masked = maskFormExportValue("", answers) as typeof answers;
  assert.equal(JSON.stringify(answers), before, "Export masking must never mutate stored answers");
  assert.equal(masked.hhq_household_id, householdId);
  assert.equal(masked.hhq_household_number, "01");
  assert.equal(masked.hhq_household_members.length, 1, "Member export retains one row per original member");
  assert.equal(masked.hhq_household_members[0].member_individual_id, personId);
  assert.equal(masked.hhq_household_members[0].member_line_number, "02");
  assert.equal(masked.hhq_household_members[0].member_name, FORM_EXPORT_MASK);
  assert.equal(masked.hhq_household_members[0].member_registry_uid, FORM_EXPORT_MASK);
  assert.equal(masked.hhq_household_members[0].member_registry_individual_id, FORM_EXPORT_MASK);
  assert.equal(masked.hhq_household_members[0].member_sex, 2);
  assert.deepEqual(masked.hhq_household_members[0].member_residence_duration, { years: 4, months: 0 });
  assert.equal(masked.hhq_contact_mobile_2, 3, "Legacy room-count field is not a mobile number");
  assert.equal(masked.hhq_household_landline_telephone, 2);
  assert.equal(masked.hhq_any_member_household_own_mobile_telephone_tablet, 1);
  assert.equal(masked.hhq_contact_mobile_numbers.length, 2);
  assert.equal(masked.hhq_contact_mobile_numbers[0].mobile_number, FORM_EXPORT_MASK);
  assert.equal(masked.hhq_contact_mobile_numbers[1].number, FORM_EXPORT_MASK);
  assert.equal(masked.hhq_gps_latitude, FORM_EXPORT_MASK, "A valid zero coordinate still identifies a location");
  assert.equal(masked.psf_same_address_status, 1);
  assert.equal(masked.wq_age_last_birthday, 28);
  assert.equal(masked.wq_pregnancy_history[0].pregnancy_02_reproduction_is_name_a_boy_or_a_girl, 2);
  assert.equal(masked.wq_pregnancy_history[0].pregnancy_02_reproduction_is_name_still_alive, 1);
  assert.equal(masked.wq_pregnancy_history[0].pregnancy_02_reproduction_if_born_alive_and_still_living_is_name_liv, 2);
  assert.deepEqual(masked.pef_blood_pressure, { systolic: 120, diastolic: 80 });
  assert.equal(masked.wq_interview_date, "2026-10-28");
  assert.equal(masked.uf_ultrasound_date, "2026-09-01");
  assert.equal(masked.ordinary_code, 0);
  assert.equal(masked.ordinary_false, false);
  assert.equal(masked.unknown_clinical_code, 999);
  assert.ok(!JSON.stringify(masked).includes("PRIVATE"));
  assert.ok(!JSON.stringify(masked).includes("9876543210"));
  assert.ok(!JSON.stringify(masked).includes("9123456789"));
});

test("Non-PIS handles export metadata, empty values and legacy identifier spelling", () => {
  const submittedAt = new Date("2026-10-28T12:00:00Z");
  assert.equal(maskFormExportValue("submitted_at", submittedAt), submittedAt);
  assert.equal(maskFormExportValue("date_of_birth", submittedAt), FORM_EXPORT_MASK);
  for (const value of [undefined, null, ""]) assert.equal(maskFormExportValue("member_name", value), value);
  for (const key of ["submitted_by_name", "submitted_by_username", "device_id", "member_name_2", "phone_number_resp", "mobile_number_2", "fullName", "hdss_unique_id", "member_registry_uid"]) {
    assert.equal(maskFormExportValue(key, "PRIVATE"), FORM_EXPORT_MASK, key);
  }
  for (const key of ["form_response_id", "household_id", "subject_id", "woman_id", "member_individual_id", "submitted_by_user_id"]) {
    assert.equal(maskFormExportValue(key, "opaque-linkage-id"), "opaque-linkage-id", key);
  }
});
