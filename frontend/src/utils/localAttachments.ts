import {
  deleteDraftAttachmentBlob,
  getDraftAttachmentBlobRecordsForSession,
  putAttachmentBlob,
  putDraftAttachmentBlob,
} from './db.js';
import { extractAttachmentUrlsFromContent } from './syncAttachments.js';

function sanitizeFilename(filename: string) {
  const trimmed = filename.trim();
  const normalized = trimmed.normalize('NFKC').replace(/[\\/:*?"<>|]/g, '-');
  return normalized || 'attachment.bin';
}

export function buildLocalAttachmentPath(filename: string) {
  return `/images/${encodeURIComponent(filename)}`;
}

export function createLocalAttachmentFilename(filename: string) {
  const dotIndex = filename.lastIndexOf('.');
  const hasExtension = dotIndex > 0 && dotIndex < filename.length - 1;
  const base = hasExtension ? filename.slice(0, dotIndex) : filename;
  const extension = hasExtension ? filename.slice(dotIndex) : '';
  const safeBase = sanitizeFilename(base || 'attachment');
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeBase}${extension}`;
}

export function createDraftAttachmentSessionKey() {
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveLocalAttachmentFile(file: File, options?: { draftSessionKey?: string }) {
  const filename = createLocalAttachmentFilename(file.name || 'attachment.bin');
  if (options?.draftSessionKey) {
    await putDraftAttachmentBlob({
      sessionKey: options.draftSessionKey,
      filename,
      blob: file,
      mimeType: file.type || 'application/octet-stream',
    });
  } else {
    await putAttachmentBlob({
      filename,
      blob: file,
      mimeType: file.type || 'application/octet-stream',
    });
  }
  return {
    filename,
    url: buildLocalAttachmentPath(filename),
  };
}

export async function promoteDraftAttachmentsForContent(sessionKey: string, content: string) {
  const referencedFilenames = new Set(
    extractAttachmentUrlsFromContent(content)
      .filter((url) => url.startsWith('/images/'))
      .map((url) => decodeURIComponent(url.replace(/^\/images\//, ''))),
  );
  const draftAttachments = await getDraftAttachmentBlobRecordsForSession(sessionKey);

  for (const attachment of draftAttachments) {
    if (!referencedFilenames.has(attachment.filename)) {
      continue;
    }

    await putAttachmentBlob({
      filename: attachment.filename,
      blob: attachment.blob,
      mimeType: attachment.mime_type,
    });
  }
}

export async function pruneDraftAttachmentsForContent(sessionKey: string, content: string) {
  const referencedFilenames = new Set(
    extractAttachmentUrlsFromContent(content)
      .filter((url) => url.startsWith('/images/'))
      .map((url) => decodeURIComponent(url.replace(/^\/images\//, ''))),
  );
  const draftAttachments = await getDraftAttachmentBlobRecordsForSession(sessionKey);

  await Promise.all(draftAttachments.map(async (attachment) => {
    if (!referencedFilenames.has(attachment.filename)) {
      await deleteDraftAttachmentBlob(attachment.filename);
    }
  }));
}

export async function clearDraftAttachmentSession(sessionKey: string) {
  const draftAttachments = await getDraftAttachmentBlobRecordsForSession(sessionKey);
  await Promise.all(draftAttachments.map((attachment) => deleteDraftAttachmentBlob(attachment.filename)));
}
