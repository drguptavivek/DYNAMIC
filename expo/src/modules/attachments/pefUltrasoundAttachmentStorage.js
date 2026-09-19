/** Copies selected PEF ultrasound images into durable app-owned storage. */
import * as FileSystem from "expo-file-system/legacy";

const DIRECTORY_NAME = "pef-ultrasound-reports";

function extensionFor(asset) {
  const name = String(asset?.fileName || asset?.uri || "");
  const match = name.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/);
  if (match) return match[1].toLowerCase();
  if (asset?.mimeType === "image/png") return "png";
  if (asset?.mimeType === "image/webp") return "webp";
  return "jpg";
}

export async function persistPefUltrasoundImage(asset, attachmentId) {
  if (!FileSystem.documentDirectory) {
    throw new Error("Durable device storage is unavailable.");
  }
  const directory = `${FileSystem.documentDirectory}${DIRECTORY_NAME}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}${attachmentId}.${extensionFor(asset)}`;
  await FileSystem.copyAsync({ from: asset.uri, to: destination });
  const info = await FileSystem.getInfoAsync(destination, { size: true });
  return {
    local_uri: destination,
    original_name: asset.fileName || `ultrasound-report-${attachmentId}.${extensionFor(asset)}`,
    mime_type: asset.mimeType || "image/jpeg",
    file_size: info.exists && Number.isFinite(info.size) ? info.size : null,
  };
}

export async function removePersistedPefUltrasoundImage(uri) {
  if (!uri || !String(uri).includes(`/${DIRECTORY_NAME}/`)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true });
}
