import path from "node:path";
import { readFile, realpath, stat } from "node:fs/promises";
import { isSupportedImageBuffer } from "./formAttachmentStorage";

export class DashboardImageError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export async function readDashboardAttachmentImage(relativePath: string, mimeType: string, root = process.env.IMAGE_UPLOAD_ROOT || path.resolve(process.cwd(), "imageuploads")) {
  const mime = mimeType === "image/jpg" ? "image/jpeg" : mimeType;
  if (!["image/jpeg","image/png","image/webp","image/heic","image/heif"].includes(mime)) throw new DashboardImageError(415,"UNSUPPORTED_IMAGE");
  if (typeof relativePath !== "string" || !relativePath.startsWith("imageuploads/") || relativePath.includes("\\") || relativePath.includes("\0") || path.posix.normalize(relativePath) !== relativePath) throw new DashboardImageError(404,"IMAGE_NOT_FOUND");
  try {
    const realRoot = await realpath(root);
    const target = await realpath(path.resolve(realRoot,relativePath.slice("imageuploads/".length)));
    if (!target.startsWith(realRoot + path.sep)) throw new DashboardImageError(404,"IMAGE_NOT_FOUND");
    const info=await stat(target);
    if (!info.isFile() || info.size > 12*1024*1024) throw new DashboardImageError(404,"IMAGE_NOT_FOUND");
    const bytes=await readFile(target);
    if (!isSupportedImageBuffer(bytes,mime)) throw new DashboardImageError(415,"UNSUPPORTED_IMAGE");
    return {bytes,mime};
  } catch(error) {
    if(error instanceof DashboardImageError) throw error;
    if((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ENOTDIR") throw new DashboardImageError(404,"IMAGE_NOT_FOUND");
    throw error;
  }
}
