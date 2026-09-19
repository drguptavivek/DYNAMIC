import path from "node:path";

const SAFE_ID_PATTERN = /[^a-zA-Z0-9._-]+/g;

export function safeAttachmentPathPart(value: unknown): string {
  const safe = String(value || "").trim().replace(SAFE_ID_PATTERN, "_").replace(/^\.+/, "");
  if (!safe) throw new Error("Invalid attachment path identity");
  return safe.slice(0, 180);
}

export function imageExtension(mimeType: string): string {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/heic" || mimeType === "image/heif") return ".heic";
  return ".jpg";
}

export function isSupportedImageBuffer(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimeType === "image/webp") {
    return buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  }
  if (mimeType === "image/heic" || mimeType === "image/heif") {
    return buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp";
  }
  return false;
}

export function buildFormAttachmentLocation(input: {
  householdId: string;
  womanId: string;
  responseId: string;
  sequence: number;
  imageSequence?: number;
  attachmentId: string;
  mimeType: string;
  root?: string;
}) {
  const household = safeAttachmentPathPart(input.householdId);
  const woman = safeAttachmentPathPart(input.womanId);
  const response = safeAttachmentPathPart(input.responseId);
  const attachment = safeAttachmentPathPart(input.attachmentId);
  const imageSequence = input.imageSequence || 1;
  const storedFileName = `${response}-${input.sequence}-${imageSequence}-${attachment}${imageExtension(input.mimeType)}`;
  const relativePath = path.posix.join("imageuploads", household, woman, storedFileName);
  const root = input.root || process.env.IMAGE_UPLOAD_ROOT || path.resolve(process.cwd(), "imageuploads");
  const directory = path.resolve(root, household, woman);
  const absolutePath = path.resolve(directory, storedFileName);
  if (!absolutePath.startsWith(`${directory}${path.sep}`)) {
    throw new Error("Invalid attachment storage path");
  }
  return { absolutePath, directory, relativePath, storedFileName };
}
