import {
  deleteBlobIndexRecord,
  getAttachmentBlob,
  getBlobIndexRecord,
  putAttachmentBlob,
  putBlobIndexRecord,
  getAttachmentContentBlob,
  putAttachmentContentBlob,
  getAttachmentBlobRecord,
} from './blobStorage.js';
import { resolveBackendAttachmentAssetUrl } from './backendAttachmentsApi.js';
import { getAttachmentRefFilenamesForNote } from './attachmentRefStorage.js';
import { buildAttachmentUrlFromFilename, extractAttachmentFilename, extractAttachmentUrlsFromContent } from './attachmentLinks.js';
import { shouldUseBackendAppStore } from '../runtime/appStoreRuntime.js';
import { withIndexedDb } from '../storage/transactions.js';
import { contentAttachmentFilename } from './attachmentLinks.js';
import type { AttachmentBlobRecord } from './blobStorage.js';

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

/** Keep existing aliases immutable; publish incoming bytes and a safe alias together. */
export async function materializeIncomingAttachment(filename: string, data: Uint8Array, hash: string, mimeType: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const previous = await getAttachmentBlobRecord(filename);
    const previousHash = previous ? `sha256:${await sha256Hex(new Uint8Array(await previous.blob.arrayBuffer()))}` : '';
    const destination = previous && previousHash !== hash ? contentAttachmentFilename(hash, filename) : filename;
    const aliasPrevious = destination === filename ? previous : await getAttachmentBlobRecord(destination);
    if (destination !== filename && aliasPrevious
      && `sha256:${await sha256Hex(new Uint8Array(await aliasPrevious.blob.arrayBuffer()))}` !== hash) {
      throw new Error(`同名附件内容不同，原附件已保留：${destination}`);
    }
    const blob = new Blob([Uint8Array.from(data)], { type: mimeType });
    const stored = await withIndexedDb(['attachmentBlobs', 'attachmentContentBlobs', 'blobIndex'], 'readwrite', tx => {
      const files = tx.objectStore('attachmentBlobs'), current = files.get(filename), alias = files.get(destination);
      let committed = false;
      alias.onsuccess = () => {
        const actual = current.result as AttachmentBlobRecord | undefined;
        if (Boolean(actual) !== Boolean(previous) || actual?.version !== previous?.version) return;
        const occupied = alias.result as AttachmentBlobRecord | undefined;
        if (Boolean(occupied) !== Boolean(aliasPrevious) || occupied?.version !== aliasPrevious?.version) return;
        files.put({ filename: destination, blob, mime_type: mimeType, updatedAt: Date.now(), version: crypto.randomUUID(), blob_hash: hash });
        tx.objectStore('attachmentContentBlobs').put({ blob_hash: hash, blob });
        tx.objectStore('blobIndex').put({ blob_hash: hash, filename: destination, mime_type: mimeType, size: data.byteLength, updatedAt: Date.now() });
        committed = true;
      };
      return () => committed;
    });
    if (stored) return destination;
  }
  throw new Error(`附件正在变化，原附件已保留：${filename}`);
}
