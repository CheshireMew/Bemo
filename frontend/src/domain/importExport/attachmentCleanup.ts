import {
  deleteAttachmentBlob,
  deleteDraftAttachmentBlob,
  deleteBlobIndexRecord,
  getAllAttachmentBlobRecords,
  getAllBlobIndexRecords,
  getAllDraftAttachmentBlobRecords,
} from '../attachments/blobStorage.js';
import { getReferencedAttachmentFilenames } from '../attachments/attachmentRefStorage.js';
import { getCachedNotes } from '../notes/notesStorage.js';
import { getTrashNotes } from '../notes/trashStorage.js';
import { clearAttachmentUrlCache, extractAttachmentFilename } from '../../utils/attachmentUrls.js';
import { extractAttachmentUrlsFromContent } from '../../utils/syncAttachments.js';
import { getMutationLog } from '../sync/mutationLogStorage.js';

const EDITOR_DRAFT_STORAGE_PREFIX = 'bemo.editor.draft:';

function collectReferencedAttachmentsFromContent(content: string | undefined | null, referenced: Set<string>) {
  for (const url of extractAttachmentUrlsFromContent(content || '')) {
    const filename = extractAttachmentFilename(url);
    if (filename) {
      referenced.add(filename);
    }
  }
}

export async function cleanupOrphanImagesRequest() {
  const [notes, trash, attachments, draftAttachments, blobIndex, mutationLog, refFilenames] = await Promise.all([
    getCachedNotes(),
    getTrashNotes(),
    getAllAttachmentBlobRecords(),
    getAllDraftAttachmentBlobRecords(),
    getAllBlobIndexRecords(),
    getMutationLog(),
    getReferencedAttachmentFilenames(),
  ]);

  const referenced = new Set<string>(refFilenames);
  for (const note of [...notes, ...trash]) {
    collectReferencedAttachmentsFromContent(note.content, referenced);
  }
  for (const mutation of mutationLog) {
    const content = typeof mutation.payload?.content === 'string' ? mutation.payload.content : '';
    collectReferencedAttachmentsFromContent(content, referenced);
  }
  if (typeof localStorage !== 'undefined') {
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !key.startsWith(EDITOR_DRAFT_STORAGE_PREFIX)) continue;
        const rawDraft = localStorage.getItem(key);
        if (!rawDraft) continue;
        const parsed = JSON.parse(rawDraft) as { content?: string };
        collectReferencedAttachmentsFromContent(parsed.content, referenced);
      }
    } catch (error) {
      console.warn('Failed to parse editor draft during attachment cleanup.', error);
    }
  }

  const deletedFiles: string[] = [];
  for (const attachment of attachments) {
    if (referenced.has(attachment.filename)) continue;
    await deleteAttachmentBlob(attachment.filename);
    clearAttachmentUrlCache(attachment.filename);
    deletedFiles.push(attachment.filename);
  }

  for (const record of blobIndex) {
    if (referenced.has(record.filename)) continue;
    await deleteBlobIndexRecord(record.blob_hash);
  }

  for (const attachment of draftAttachments) {
    if (referenced.has(attachment.filename)) continue;
    await deleteDraftAttachmentBlob(attachment.filename);
    clearAttachmentUrlCache(attachment.filename);
  }

  return {
    deleted_count: deletedFiles.length,
    deleted_files: deletedFiles,
  };
}
