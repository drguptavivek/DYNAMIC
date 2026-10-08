import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { db, schema } from "../db";
import syncRouter from "../routes/sync";

test("multipart PEF/PFF uploads store exact bytes and safely retry after failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dynamic-attachment-http-"));
  const originalRoot = process.env.IMAGE_UPLOAD_ROOT;
  const originalSelect = db.select;
  const originalInsert = db.insert;
  process.env.IMAGE_UPLOAD_ROOT = root;
  const rows = new Map<string, any>();
  let selectResults: any[][] = [];
  let failInsert = false;
  const mockedDb = db as any;
  mockedDb.select = () => ({ from: () => ({ where: () => ({
    limit: async () => selectResults.shift() || [],
    then: (resolve: (rows: any[]) => unknown) => resolve(selectResults.shift() || []),
  }) }) });
  mockedDb.insert = (table: unknown) => ({ values: async (row: any) => {
    assert.equal(table, schema.formAttachments);
    if (failInsert) throw new Error("injected metadata persistence failure");
    rows.set(row.attachment_id, row);
  } });

  // Authentication/session and DB fixtures are synthetic; parser, handler and file writes are real.
  const route = (syncRouter as any).stack.find((layer: any) => layer.route?.path === "/attachments").route;
  const app = express();
  app.post("/api/v1/sync/attachments", (req, _res, next) => {
    req.user = { sub: "worker-1", username: "worker", role: "field_worker", site_id: 2, type: "access" };
    next();
  }, route.stack.at(-2).handle, (req, res, next) => {
    const previous = rows.get(req.body.attachment_id);
    selectResults = [
      [{ authorized: true, user_id: "worker-1" }],
      [{ household_id: "2-02-0001-01" }],
      req.body.woman_id === "2-02-0001-01-02" ? [{ woman_id: req.body.woman_id }] : [],
    ];
    if (req.body.woman_id !== "2-02-0001-01-02") selectResults.push([]);
    selectResults.push(previous ? [previous] : [], []);
    route.stack.at(-1).handle(req, res, next);
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  // tsx loads the same JS upload contract used by the field app.
  // @ts-ignore Expo JS modules have no TypeScript declarations.
  const { uploadAttachment } = await import("../../../../expo/src/modules/attachments/attachmentUploadClient.js");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=", "base64");
  const attachment = (form: string, question: string, suffix = "") => ({
    attachment_id: `${question}${suffix}`, form_response_id: `${form}-response`, form_code: form,
    question_name: question, household_id: "2-02-0001-01", woman_id: "2-02-0001-01-02",
    report_sequence: 1, image_sequence: 1, display_name: "Report / interview name", mime_type: "image/png",
    ...(question.includes("reports") ? { ultrasound_date: "2026-10-08" } : {}),
  });
  const upload = (image: any, bytes = png) => uploadAttachment({
    apiBaseUrl: `http://127.0.0.1:${address.port}/api/v1`, token: "fixture", deviceId: "device-1", attachment: image,
    uploadFile: async ({ url, parameters }: any) => {
      const body = new FormData();
      for (const [key, value] of Object.entries(parameters)) body.append(key, String(value));
      body.append("file", new Blob([new Uint8Array(bytes)], { type: image.mime_type }), "camera.png");
      const response = await fetch(url, { method: "POST", body });
      return { status: response.status, body: await response.text() };
    },
  });
  try {
    const questions = {
      PEF: ["pef_ultrasound_reports", "pef_anc_card_image"],
      PFF: ["pff_first_ultrasound_report_image", "pff_additional_ultrasound_reports", "pff_anc_card_image"],
    };
    for (const [form, fields] of Object.entries(questions)) {
      for (const field of fields) {
        const image = attachment(form, field);
        const result = await upload(image);
        const row = rows.get(image.attachment_id);
        assert.equal(result.data.relative_path, row.relative_path);
        const stored = await readFile(path.join(root, row.relative_path.replace(/^imageuploads\//, "")));
        assert.deepEqual(stored, png);
        assert.equal(row.sha256, createHash("sha256").update(png).digest("hex"));
        assert.equal(row.form_response_id, image.form_response_id);
        assert.equal(row.question_name, field);
        assert.deepEqual(await upload(image), result);
      }
    }
    assert.equal(rows.size, 5);
    await assert.rejects(upload({ ...attachment("PEF", "pef_ultrasound_reports", "wrong-woman"), woman_id: "pregnancy-1" }), /Woman does not belong/);
    await assert.rejects(upload(attachment("PEF", "pef_ultrasound_reports", "invalid"), Buffer.from("not an image")), /not a supported image/);
    await assert.rejects(upload(attachment("PEF", "pef_ultrasound_reports"), Buffer.concat([png, Buffer.from("changed")])), /already contains different data/);
    const retryImage = { ...attachment("PEF", "pef_anc_card_image", "retry"), form_response_id: "retry-response" };
    failInsert = true;
    const oldError = console.error;
    console.error = () => {};
    try { await assert.rejects(upload(retryImage), /Could not store form attachment/); }
    finally { console.error = oldError; }
    assert.equal(rows.has(retryImage.attachment_id), false);
    const files = await readdir(root, { recursive: true });
    assert.equal(files.some((file) => file.includes("retry-response") || file.endsWith(".tmp")), false);
    failInsert = false;
    await upload(retryImage);
    assert.equal(rows.size, 6);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);
    const jpegImage = { ...attachment("PFF", "pff_anc_card_image", "jpeg"), form_response_id: "jpeg-response", mime_type: "image/jpeg" };
    const jpegResult = await upload(jpegImage, jpeg);
    assert.ok(jpegResult.data.relative_path.endsWith(".jpg"));
    assert.deepEqual(await readFile(path.join(root, jpegResult.data.relative_path.replace(/^imageuploads\//, ""))), jpeg);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    mockedDb.select = originalSelect;
    mockedDb.insert = originalInsert;
    if (originalRoot === undefined) delete process.env.IMAGE_UPLOAD_ROOT;
    else process.env.IMAGE_UPLOAD_ROOT = originalRoot;
    await rm(root, { recursive: true, force: true });
  }
});
