import { API_ORIGIN, resolveBackendUrl } from '../config';

const ATTACHMENT_URL_PATTERN = /(\/images\/[^)\s"'`>]+)/g;

export type SyncAttachment = {
  url: string;
  filename: string;
  blob_hash: string;
  mime_type: string;
};

export function extractAttachmentUrlsFromContent(content: string): string[] {
  const matches = content.match(ATTACHMENT_URL_PATTERN) || [];
  return Array.from(new Set(matches));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const exactBytes = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest('SHA-256', exactBytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function collectSyncAttachments(content: string): Promise<Array<SyncAttachment & { data: Uint8Array }>> {
  const urls = extractAttachmentUrlsFromContent(content);
  const attachments: Array<SyncAttachment & { data: Uint8Array }> = [];

  for (const url of urls) {
    const response = await fetch(resolveBackendUrl(url));
    if (!response.ok) continue;
    const data = new Uint8Array(await response.arrayBuffer());
    const mimeType = response.headers.get('content-type') || 'application/octet-stream';
    const fileName = url.split('/').pop() || 'attachment.bin';
    const blobHash = `sha256:${await sha256Hex(data)}`;
    attachments.push({
      url,
      filename: fileName,
      blob_hash: blobHash,
      mime_type: mimeType,
      data,
    });
  }

  return attachments;
}

export async function ensureLocalAttachment(filename: string, data: Uint8Array): Promise<void> {
  const exactBytes = Uint8Array.from(data);
  await fetch(`${API_ORIGIN}/api/sync/local/blobs/${encodeURIComponent(filename)}`, {
    method: 'PUT',
    body: new Blob([exactBytes]),
  });
}
