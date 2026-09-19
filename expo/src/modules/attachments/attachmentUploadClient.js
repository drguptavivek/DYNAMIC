/** Uploads one app-owned attachment through Expo FileSystem's native multipart transport. */

export function buildAttachmentUploadParameters({ attachment, deviceId }) {
  const parameters = {
    attachment_id: String(attachment.attachment_id),
    form_response_id: String(attachment.form_response_id),
    form_code: String(attachment.form_code),
    question_name: String(attachment.question_name),
    household_id: String(attachment.household_id),
    woman_id: String(attachment.woman_id),
    report_sequence: String(attachment.report_sequence),
    image_sequence: String(attachment.image_sequence || 1),
    display_name: String(attachment.display_name),
    device_id: String(deviceId),
  };
  if (attachment.ultrasound_date) {
    parameters.ultrasound_date = String(attachment.ultrasound_date);
  }
  return parameters;
}

export async function nativeUploadAttachmentFile({ url, token, attachment, parameters }) {
  const body = new FormData();
  for (const [name, value] of Object.entries(parameters)) {
    body.append(name, value);
  }
  body.append("file", {
    uri: attachment.local_uri,
    name: attachment.original_file_name || `${attachment.attachment_id}.jpg`,
    type: attachment.mime_type || "image/jpeg",
  });

  // Expo SDK 57's fetch implementation rejects React Native's local-file
  // FormData part. XMLHttpRequest uses React Native's native networking path,
  // which supports the { uri, name, type } file contract without reading the
  // image into JavaScript memory.
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.onload = () => resolve({ status: request.status, body: request.responseText });
    request.onerror = () => reject(new Error("Attachment upload network request failed"));
    request.ontimeout = () => reject(new Error("Attachment upload timed out"));
    request.send(body);
  });
}

export async function uploadAttachment({
  apiBaseUrl,
  token,
  deviceId,
  attachment,
  uploadFile = nativeUploadAttachmentFile,
}) {
  const result = await uploadFile({
    url: `${apiBaseUrl}/sync/attachments`,
    token,
    attachment,
    parameters: buildAttachmentUploadParameters({ attachment, deviceId }),
  });
  let payload = null;
  try {
    payload = JSON.parse(result?.body || "null");
  } catch {
    // The status-specific fallback below is more useful than a JSON parser error.
  }
  if (!result || result.status < 200 || result.status >= 300) {
    const message = payload?.error?.message || `Attachment upload failed (${result?.status || "network error"})`;
    throw new Error(message);
  }
  return payload;
}
