import {
  deleteBlobIndexRecord,
  getAttachmentBlob,
  getBlobIndexRecord,
  putAttachmentBlob,
  putBlobIndexRecord,
  getAttachmentContentBlob,
  putAttachmentContentBlob,
} from './blobStorage.js';
import { resolveBackendAttachmentAssetUrl } from './backendAttachmentsApi.js';
import { getAttachmentRefFilenamesForNote } from './attachmentRefStorage.js';
import { buildAttachmentUrlFromFilename, extractAttachmentFilename, extractAttachmentUrlsFromContent } from './attachmentLinks.js';
import { shouldUseBackendAppStore } from '../runtime/appStoreRuntime.js';

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
  options?: { noteId?: string | null; source?: 'primary' | 'import' },
): Promise<Array<SyncAttachment & { data: Uint8Array }>> {
  const contentUrls = extractAttachmentUrlsFromContent(content);
  const contentFilenames = new Set(
    contentUrls
      .map((url) => extractAttachmentFilename(url))
      .filter((filename): filename is string => Boolean(filename)),
  );
  const backendPrimary = shouldUseBackendAppStore() && options?.source !== 'import';
  const refFilenames = options?.noteId && !backendPrimary
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
    const localBlob = backendPrimary ? null : await getAttachmentBlob(fileName);
    let data: Uint8Array;
    let mimeType = localBlob?.type || 'application/octet-stream';

    if (localBlob) {
      data = new Uint8Array(await localBlob.arrayBuffer());
    } else {
      const fallbackUrl = url.startsWith('/images/')
        ? (resolveBackendAttachmentAssetUrl(url) || url)
        : url;
      if (!fallbackUrl) throw new Error(`找不到附件：${fileName}`);
      const response = await fetch(fallbackUrl, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`读取附件失败：${fileName} (${response.status})`);
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

export async function ensureBlobIndexValid(blobHash: string, filename?: string, mimeType?: string): Promise<boolean> {
  let blob = await getAttachmentContentBlob(blobHash);
  const record = await getBlobIndexRecord(blobHash);
  if (!blob && record) {
    const legacyBlob = await getAttachmentBlob(record.filename);
    if (legacyBlob && `sha256:${await sha256Hex(new Uint8Array(await legacyBlob.arrayBuffer()))}` === blobHash) {
      blob = legacyBlob;
      await putAttachmentContentBlob(blobHash, blob);
    }
  }
  if (!blob) {
    if (record) await deleteBlobIndexRecord(blobHash);
    return false;
  }
  if (filename) {
    await putAttachmentBlob({ filename, blob: new Blob([await blob.arrayBuffer()], { type: mimeType || blob.type }), mimeType: mimeType || blob.type });
  }
  return true;
}

export async function ensureLocalAttachment(
  filename: string,
  data: Uint8Array,
  blobHash: string,
  mimeType = 'application/octet-stream',
): Promise<void> {
  if (await ensureBlobIndexValid(blobHash, filename, mimeType)) {
    return;
  }

  const blob = new Blob([Uint8Array.from(data)], { type: mimeType });
  await putAttachmentContentBlob(blobHash, blob);
  await putAttachmentBlob({
    filename,
    blob,
    mimeType,
  });

  await putBlobIndexRecord({
    blobHash,
    filename,
    mimeType,
    size: data.byteLength,
  });
}
