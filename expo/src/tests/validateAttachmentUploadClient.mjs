import assert from "node:assert/strict";

const {
  buildAttachmentUploadParameters,
  nativeUploadAttachmentFile,
  uploadAttachment,
} = await import("../modules/attachments/attachmentUploadClient.js");

const attachment = {
  attachment_id: "attachment-1",
  form_response_id: "response-1",
  form_code: "PEF",
  question_name: "pef_ultrasound_reports",
  household_id: "1-01-0001-01",
  woman_id: "1-01-0001-01-02",
  report_sequence: 2,
  image_sequence: 1,
  ultrasound_date: "2026-09-18",
  display_name: "scan.jpg",
  local_uri: "file:///documents/scan.jpg",
  mime_type: "image/jpeg",
};

assert.deepEqual(buildAttachmentUploadParameters({ attachment, deviceId: "device-1" }), {
  attachment_id: "attachment-1",
  form_response_id: "response-1",
  form_code: "PEF",
  question_name: "pef_ultrasound_reports",
  household_id: "1-01-0001-01",
  woman_id: "1-01-0001-01-02",
  report_sequence: "2",
  image_sequence: "1",
  display_name: "scan.jpg",
  device_id: "device-1",
  ultrasound_date: "2026-09-18",
});

let received;
const payload = await uploadAttachment({
  apiBaseUrl: "https://example.test/api/v1",
  token: "token-1",
  deviceId: "device-1",
  attachment,
  uploadFile: async (request) => {
    received = request;
    return {
      status: 200,
      body: JSON.stringify({ data: { relative_path: "household/woman/image.jpg" } }),
    };
  },
});

assert.equal(received.url, "https://example.test/api/v1/sync/attachments");
assert.equal(received.token, "token-1");
assert.equal(received.attachment.local_uri, attachment.local_uri);
assert.deepEqual(received.parameters, buildAttachmentUploadParameters({ attachment, deviceId: "device-1" }));
assert.equal(payload.data.relative_path, "household/woman/image.jpg");

const originalFormData = globalThis.FormData;
const originalXmlHttpRequest = globalThis.XMLHttpRequest;
let sentRequest;
class FakeFormData {
  parts = [];
  append(name, value) {
    this.parts.push([name, value]);
  }
}
class FakeXmlHttpRequest {
  headers = {};
  open(method, url) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name, value) {
    this.headers[name] = value;
  }
  send(body) {
    sentRequest = { method: this.method, url: this.url, headers: this.headers, body };
    this.status = 200;
    this.responseText = JSON.stringify({ data: { relative_path: "stored/image.jpg" } });
    this.onload();
  }
}
globalThis.FormData = FakeFormData;
globalThis.XMLHttpRequest = FakeXmlHttpRequest;
try {
  const nativeResult = await nativeUploadAttachmentFile({
    url: "https://example.test/api/v1/sync/attachments",
    token: "token-1",
    attachment,
    parameters: buildAttachmentUploadParameters({ attachment, deviceId: "device-1" }),
  });
  assert.equal(nativeResult.status, 200);
  assert.equal(sentRequest.method, "POST");
  assert.equal(sentRequest.headers.Authorization, "Bearer token-1");
  assert.equal(sentRequest.body.parts.find(([name]) => name === "image_sequence")[1], "1");
  assert.deepEqual(sentRequest.body.parts.find(([name]) => name === "file")[1], {
    uri: "file:///documents/scan.jpg",
    name: "attachment-1.jpg",
    type: "image/jpeg",
  });
} finally {
  globalThis.FormData = originalFormData;
  globalThis.XMLHttpRequest = originalXmlHttpRequest;
}

await assert.rejects(
  uploadAttachment({
    apiBaseUrl: "https://example.test/api/v1",
    token: "token-1",
    deviceId: "device-1",
    attachment,
    uploadFile: async () => ({
      status: 400,
      body: JSON.stringify({ error: { message: "Invalid image" } }),
    }),
  }),
  /Invalid image/,
);

console.log("Validated native multipart attachment upload client.");
