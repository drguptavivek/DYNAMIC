import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  buildFormAttachmentLocation,
  isSupportedImageBuffer,
  safeAttachmentPathPart,
} from "./formAttachmentStorage";

test("PEF report images are stored below the household and woman folders", () => {
  const root = path.resolve("C:/attachment-test-root");
  const result = buildFormAttachmentLocation({
    householdId: "1-01-0006-11",
    womanId: "1-01-0006-11-02",
    responseId: "PEF-response-1",
    sequence: 2,
    imageSequence: 2,
    attachmentId: "attachment-abc",
    mimeType: "image/png",
    root,
  });

  assert.equal(
    result.relativePath,
    "imageuploads/1-01-0006-11/1-01-0006-11-02/PEF-response-1-2-2-attachment-abc.png",
  );
  assert.ok(result.absolutePath.startsWith(path.join(root, "1-01-0006-11", "1-01-0006-11-02")));
});

test("PEF ANC card images are stored in the woman's ANC folder", () => {
  const root = path.resolve("C:/attachment-test-root");
  const result = buildFormAttachmentLocation({
    householdId: "1-01-0006-11",
    womanId: "1-01-0006-11-02",
    responseId: "PEF-response-1",
    sequence: 1,
    imageSequence: 1,
    attachmentId: "anc-attachment",
    mimeType: "image/jpeg",
    category: "ANC",
    root,
  });

  assert.equal(
    result.relativePath,
    "imageuploads/1-01-0006-11/1-01-0006-11-02/ANC/PEF-response-1-1-1-anc-attachment.jpg",
  );
  assert.ok(result.absolutePath.startsWith(
    path.join(root, "1-01-0006-11", "1-01-0006-11-02", "ANC"),
  ));
});

test("attachment path identities cannot escape the upload root", () => {
  assert.equal(safeAttachmentPathPart("../../woman/id"), "_.._woman_id");
  assert.throws(() => safeAttachmentPathPart("..."), /Invalid attachment path identity/);
});

test("attachment content must match a supported image signature", () => {
  assert.equal(isSupportedImageBuffer(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg"), true);
  assert.equal(isSupportedImageBuffer(Buffer.from("not an image"), "image/jpeg"), false);
  assert.equal(isSupportedImageBuffer(Buffer.from("%PDF-1.7"), "application/pdf"), false);
});
