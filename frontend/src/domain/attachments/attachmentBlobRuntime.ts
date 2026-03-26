import {
  deleteBlobIndexRecord,
  getAttachmentBlob,
  getBlobIndexRecord,
  putAttachmentBlob,
  putBlobIndexRecord,
} from './blobStorage.js';
import { resolveBackendAttachmentAssetUrl } from './backendAttachmentsApi.js';
import { getAttachmentRefFilenamesForNote } from './attachmentRefStorage.js';
import { buildAttachmentUrlFromFilename, extractAttachmentFilename, extractAttachmentUrlsFromContent } from './attachmentLinks.js';

export type SyncAttachment = {
  url: string;
  filename: string;
  blob_hash: string;
  mime_type: string;
};

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const exactBytes = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest('SHA-256', exactBytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function collectSyncAttachments(
  content: string,
  options?: { noteId?: string | null },
): Promise<Array<SyncAttachment & { data: Uint8Array }>> {
  const contentUrls = extractAttachmentUrlsFromContent(content);
  const contentFilenames = new Set(
    contentUrls
      .map((url) => extractAttachmentFilename(url))
      .filter((filename): filename is string => Boolean(filename)),
  );
  const refFilenames = options?.noteId
    ? await getAttachmentRefFilenamesForNote(options.noteId, ['active', 'trash'])
    : [];
  const urls = Array.from(new Set([
    ...refFilenames
      .filter((filename) => contentFilenames.size === 0 || contentFilenames.has(filename))
      .map(buildAttachmentUrlFromFilename),
    ...contentUrls,
  ]));
  const attachments: Array<SyncAttachment & { data: Uint8Array }> = [];

  for (const url of urls) {
    const fileName = extractAttachmentFilename(url) || url.split('/').pop() || 'attachment.bin';
    const localBlob = await getAttachmentBlob(fileName);
    let data: Uint8Array;
    let mimeType = localBlob?.type || 'application/octet-stream';

    if (localBlob) {
      data = new Uint8Array(await localBlob.arrayBuffer());
    } else {
      const fallbackUrl = url.startsWith('/images/')
        ? (resolveBackendAttachmentAssetUrl(url) || url)
        : url;
      if (!fallbackUrl) continue;
      const response = await fetch(fallbackUrl);
      if (!response.ok) continue;
      data = new Uint8Array(await response.arrayBuffer());
      mimeType = response.headers.get('content-type') || mimeType;
    }

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

export async function ensureBlobIndexValid(blobHash: string): Promise<boolean> {
  const record = await getBlobIndexRecord(blobHash);
  if (!record) return false;

  const blob = await getAttachmentBlob(record.filename);
  if (blob) {
    return true;
  }

  await deleteBlobIndexRecord(blobHash);
  return false;
}

export async function ensureLocalAttachment(
  filename: string,
  data: Uint8Array,
  blobHash: string,
  mimeType = 'application/octet-stream',
): Promise<void> {
  if (await ensureBlobIndexValid(blobHash)) {
    return;
  }

  await putAttachmentBlob({
    filename,
    blob: new Blob([Uint8Array.from(data)], { type: mimeType }),
    mimeType,
  });

  await putBlobIndexRecord({
    blobHash,
    filename,
    mimeType,
    size: data.byteLength,
  });
}
