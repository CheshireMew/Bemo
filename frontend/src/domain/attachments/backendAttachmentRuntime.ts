import { collectSyncAttachments } from './attachmentBlobRuntime.js';
import { uploadBackendAttachment } from './backendAttachmentsApi.js';

export async function prepareBackendAttachments(content: string, noteId?: string) {
  const attachments = await collectSyncAttachments(content, { noteId });
  const uploaded = new Map<string, { filename: string; blob_hash: string; mime_type: string }>();

  for (const attachment of attachments) {
    const key = `${attachment.filename}:${attachment.blob_hash}`;
    if (uploaded.has(key)) {
      continue;
    }
    const stored = await uploadBackendAttachment({
      filename: attachment.filename,
      data: Uint8Array.from(attachment.data).buffer,
      mimeType: attachment.mime_type,
    });
    uploaded.set(key, {
      filename: stored.filename,
      blob_hash: stored.blob_hash,
      mime_type: stored.mime_type,
    });
  }

  return Array.from(uploaded.values());
}
