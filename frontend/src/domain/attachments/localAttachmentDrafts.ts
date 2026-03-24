import {
  deleteDraftAttachmentBlob,
  getDraftAttachmentBlobRecordsForSession,
  putAttachmentBlob,
  putDraftAttachmentBlob,
} from './blobStorage.js';
import { extractAttachmentUrlsFromContent } from './attachmentLinks.js';
import { buildLocalAttachmentPath, createLocalAttachmentFilename } from './localAttachmentPaths.js';

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

function collectReferencedDraftAttachmentFilenames(content: string) {
  return new Set(
    extractAttachmentUrlsFromContent(content)
      .filter((url) => url.startsWith('/images/'))
      .map((url) => decodeURIComponent(url.replace(/^\/images\//, ''))),
  );
}

export async function promoteDraftAttachmentsForContent(sessionKey: string, content: string) {
  const referencedFilenames = collectReferencedDraftAttachmentFilenames(content);
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
  const referencedFilenames = collectReferencedDraftAttachmentFilenames(content);
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
