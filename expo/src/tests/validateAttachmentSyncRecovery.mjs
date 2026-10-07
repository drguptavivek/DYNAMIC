import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createFakeSqliteDb } from "./helpers/createFakeSqliteDb.mjs";
import { stubOfflineDatabase } from "./helpers/stubOfflineDatabase.mjs";

const fakeDb = createFakeSqliteDb();
const require = stubOfflineDatabase(fakeDb, import.meta.url);
const { retryAttachmentUploadErrors } = require("../modules/tasks/taskRepository.js");
retryAttachmentUploadErrors();
const retrySql = fakeDb.calls.find((call) => call.sql.includes("Could not upload %")).sql;

const rows = [
  { id: "pef", form_code: "PEF", sync_status: "upload_error", sync_error: "Could not upload report.jpg: Network error", answers_json: '{"pef_pregnant":1}' },
  { id: "pff", form_code: "PFF", sync_status: "upload_error", sync_error: "Could not upload card.jpg: Invalid subject", answers_json: '{"pff_pregnancy_status":1}' },
  { id: "duplicate", sync_status: "upload_error", sync_error: "Record already exists on the server", answers_json: "{}" },
  { id: "held", sync_status: "upload_error", sync_error: "Server classified this form as held_for_review", answers_json: "{}" },
  { id: "synced", sync_status: "synced", sync_error: null, answers_json: "{}" },
];
function verify(result) {
  assert.deepEqual(result.filter((row) => row.sync_status === "pending").map((row) => row.id).sort(), ["pef", "pff"]);
  for (const row of result) {
    assert.equal(row.answers_json, rows.find((original) => original.id === row.id).answers_json);
    if (["pef", "pff"].includes(row.id)) assert.equal(row.sync_error, null);
  }
  assert.equal(result.find((row) => row.id === "duplicate").sync_status, "upload_error");
  assert.equal(result.find((row) => row.id === "held").sync_status, "upload_error");
}

// Exercise real SQLite semantics without a shared/runtime database.
const nativeDb = new DatabaseSync(":memory:");
nativeDb.exec("CREATE TABLE form_responses (id TEXT, form_code TEXT, sync_status TEXT, sync_error TEXT, sync_error_at TEXT, answers_json TEXT)");
for (const row of rows) nativeDb.prepare("INSERT INTO form_responses VALUES (?, ?, ?, ?, ?, ?)").run(row.id, row.form_code || null, row.sync_status, row.sync_error, null, row.answers_json);
assert.equal(nativeDb.prepare(retrySql).run().changes, 2);
verify(nativeDb.prepare("SELECT * FROM form_responses").all());
assert.equal(nativeDb.prepare(retrySql).run().changes, 0);
nativeDb.close();

const storage = new Map([["dynamic_web_sqlite_v2", JSON.stringify({ form_responses: rows })]]);
globalThis.window = { localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } };
const { openDatabaseSync } = await import("../shims/expo-sqlite.web.js");
const webDb = openDatabaseSync();
assert.equal(webDb.runSync(retrySql).changes, 2);
verify(JSON.parse(storage.get("dynamic_web_sqlite_v2")).form_responses);
assert.equal(webDb.runSync(retrySql).changes, 0);

// All five supported image questions use the same durable attachment outbox.
const { saveFinalizedAttachments, listPendingAttachmentsForResponses, markAttachmentSynced } =
  await import("../modules/attachments/attachmentRepository.js");
const imageQuestions = {
  PEF: ["pef_ultrasound_reports", "pef_anc_card_image"],
  PFF: ["pff_first_ultrasound_report_image", "pff_additional_ultrasound_reports", "pff_anc_card_image"],
};
for (const [formCode, questions] of Object.entries(imageQuestions)) {
  for (const questionName of questions) {
    const response = { id: `${formCode}-${questionName}`, form_code: formCode, household_id: "2-02-0001-01", subject_id: "pregnancy-1",
      answers_json: formCode === "PEF" ? { pef_woman_hh_member_id: "2-02-0001-01-02" } : { pff_pregnancy_id: "pregnancy-1" } };
    const taskContext = formCode === "PFF" ? { subject_type: "pregnancy", subject_id: "pregnancy-1", pff_pef_snapshot_json: JSON.stringify({ pef_woman_hh_member_id: "2-02-0001-01-02" }) } : null;
    await saveFinalizedAttachments({ response, questionName, taskContext, value: { reports: [{ images: [{ attachment_id: questionName, local_uri: "file:///documents/image.jpg" }] }] } });
    const [image] = await listPendingAttachmentsForResponses([response.id]);
    assert.equal(image.woman_id, "2-02-0001-01-02");
    assert.equal(image.local_uri, "file:///documents/image.jpg");
    await markAttachmentSynced(image.attachment_id, "imageuploads/server-image.jpg");
    assert.deepEqual(await listPendingAttachmentsForResponses([response.id]), []);
  }
}
delete globalThis.window;
console.log("Validated retry of image-blocked PEF/PFF without changing finalized evidence or server classifications.");
