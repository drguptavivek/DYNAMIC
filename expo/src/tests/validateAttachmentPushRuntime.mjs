import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { uploadAttachment, resolveAttachmentWomanId } from "../modules/attachments/attachmentUploadClient.js";
import * as workflow from "../modules/sync/syncWorkflow.js";

const root = await mkdtemp(path.join(os.tmpdir(), "dynamic-sync-images-"));
try {
  const localFile = path.join(root, "preserved-camera.png");
  const imageBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  await writeFile(localFile, imageBytes);
  const responses = ["HHQ", "PEF", "PFF", "BHQ"].map((form_code) => ({
    id: form_code, form_code, household_id: "2-02-0001-01", subject_id: "pregnancy-1",
    answers_json: { pef_woman_hh_member_id: "2-02-0001-01-02" }, sync_status: "pending",
  }));
  const events = responses.map((response) => ({ id: `event-${response.id}`, payload: { form_response_id: response.id }, sync_status: "pending" }));
  const images = ["PEF", "PFF"].map((form) => ({ attachment_id: `image-${form}`, form_response_id: form,
    form_code: form, question_name: form === "PEF" ? "pef_anc_card_image" : "pff_anc_card_image",
    household_id: "2-02-0001-01", woman_id: "2-02-0001-01-02", report_sequence: 1,
    display_name: `${form}.png`, mime_type: "image/png", local_uri: localFile, sync_status: "pending" }));
  const timeline = [];
  const requests = [];
  let failing = true;
  let retries = 0;
  const taskRepository = {
    retryAttachmentUploadErrors() {
      retries += 1;
      for (const row of responses) if (row.sync_status === "upload_error" && row.sync_error.startsWith("Could not upload ")) row.sync_status = "pending";
    },
    retryHhqTaskPlanErrors() {}, retryMissingHhqResponses() {},
    countPendingResponses: async () => responses.filter((row) => row.sync_status === "pending").length,
    getPendingResponseBatch: async () => responses.filter((row) => row.sync_status === "pending"),
    getLocalPregnancyWomanId: () => "2-02-0001-01-02",
    recoverFormResponseTaskKey: () => null, getGeneratedTaskKeys: () => [],
    markResponsesUploadErrorBatch(items) {
      for (const item of items) Object.assign(responses.find((row) => row.id === item.id), { sync_status: "upload_error", sync_error: item.message });
    },
    markResponsesSyncedBatch(ids) { for (const id of ids) responses.find((row) => row.id === id).sync_status = "synced"; },
  };
  const modules = {
    "../questionnaires/questionnaireSubmissionRepository.js": { markQuestionnaireSubmissionUploadError() {}, markQuestionnaireSubmissionSynced() {} },
    "../events/eventOutbox.js": {
      getPendingEvents: () => events.filter((row) => row.sync_status === "pending"),
      markEventsUploadErrorForResponses(ids) { for (const event of events) if (ids.includes(event.payload.form_response_id)) event.sync_status = "upload_error"; },
      markEventSynced(id) { events.find((row) => row.id === id).sync_status = "synced"; },
    },
    "../questionnaires/questionnaireDraftRepository.js": { listQuestionnaireDraftsForSync: async () => [] },
  };
  const context = vm.createContext({
    console, taskRepository, ...workflow, resolveAttachmentWomanId,
    API_BASE_URL: "https://fixture.invalid/api/v1", getMeta: () => "device-1", getHhqGeneratedTaskKeys: () => [], setClockMetadata() {},
    authStore: { getToken: () => "fixture", getUser: () => ({ id: "worker-1" }) },
    unwrapApiData: (payload) => payload.data || payload,
    loadFixture: async (name) => { assert.ok(modules[name], name); return modules[name]; },
    listPendingAttachmentsForResponses: async (ids) => images.filter((row) => ids.includes(row.form_response_id) && row.sync_status !== "synced"),
    markAttachmentSynced: async (id, relative_path) => Object.assign(images.find((row) => row.attachment_id === id), { sync_status: "synced", relative_path }),
    markAttachmentUploadError: async (id, error) => Object.assign(images.find((row) => row.attachment_id === id), { sync_status: "upload_error", error }),
    uploadAttachment: (parameters) => uploadAttachment({ ...parameters, uploadFile: async ({ attachment }) => {
      timeline.push(`image:${attachment.form_response_id}`);
      assert.equal(responses.find((row) => row.id === "HHQ").sync_status, "synced", "HHQ must reach the server before image ownership checks");
      assert.deepEqual(await readFile(attachment.local_uri), imageBytes);
      if (failing && attachment.form_code === "PEF") throw new Error("Attachment upload network request failed");
      return { status: 201, body: JSON.stringify({ data: failing ? {} : { relative_path: `imageuploads/${attachment.attachment_id}.png` } }) };
    } }),
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      timeline.push(`forms:${body.records.filter((row) => row.type === "form_response").map((row) => row.data.id).join(",")}`);
      return { ok: true, json: async () => ({ data: { accepted_records: body.records.map((row) => row.data.id) } }) };
    },
  });
  const source = await readFile(fileURLToPath(new URL("../modules/sync/syncService.js", import.meta.url)), "utf8");
  // Run production push functions unchanged except native-only dynamic imports use fixture modules.
  const pushSource = source.slice(source.indexOf("const PUSH_FORM_RESPONSE_BATCH_SIZE"), source.indexOf("export async function syncAll"))
    .replace("export async function pushSync", "async function pushSync").replace(/\bimport\(/g, "loadFixture(");
  vm.runInContext(`${pushSource}\nthis.runPush = pushSync;`, context);
  const first = await context.runPush();
  assert.equal(first.uploadErrors, 2);
  assert.equal(first.pushed, 2);
  assert.equal(requests.length, 2);
  assert.equal(timeline[0], "forms:HHQ");
  assert.deepEqual(requests.flatMap((request) => request.records.map((row) => row.data.id)).sort(), ["BHQ", "HHQ", "event-BHQ", "event-HHQ"]);
  for (const row of images) {
    assert.equal(row.sync_status, "upload_error");
    assert.equal(row.local_uri, localFile);
    assert.deepEqual(await readFile(row.local_uri), imageBytes);
  }
  assert.match(responses.find((row) => row.id === "PFF").sync_error, /not confirmed by the server/);
  failing = false;
  const second = await context.runPush();
  assert.equal(second.pushed, 2);
  assert.equal(second.attachments, 2);
  assert.equal(second.uploadErrors, 0);
  assert.equal(retries, 2);
  assert.deepEqual(requests.at(-1).records.map((row) => row.data.id).sort(), ["PEF", "PFF"]);
  assert.ok(responses.every((row) => row.sync_status === "synced"));
  assert.ok(images.every((row) => row.sync_status === "synced" && row.relative_path));
  assert.deepEqual(await readFile(localFile), imageBytes);
  console.log("Validated actual sync push runtime: HHQ first, image failures block owning forms/events, preserve local bytes, and successful retry permits forms.");
} finally {
  await rm(root, { recursive: true, force: true });
}
