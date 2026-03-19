import {
  getAllAttachmentBlobRecords,
  putAttachmentBlob,
} from '../../domain/attachments/blobStorage.js';
import { getReferencedAttachmentFilenames, replaceNoteAttachmentRefsForScope } from '../../domain/attachments/attachmentRefStorage.js';
import { getCachedNotes, setCachedNotes } from '../notes/notesStorage.js';
import { getTrashNotes, setTrashNotes } from '../notes/trashStorage.js';
import type { NoteMeta } from '../notes/notesTypes.js';
import { clearConflicts } from '../sync/conflictStorage.js';
import { clearMutationLog } from '../sync/mutationLogStorage.js';
import { removeSyncStateValue } from '../sync/syncStateStorage.js';
import { extractAttachmentFilename } from '../../utils/attachmentUrls.js';
import { extractAttachmentUrlsFromContent } from '../../utils/syncAttachments.js';

export type BackupAttachment = {
  filename: string;
  mime_type: string;
  data: number[];
};

export type BackupPayload = {
  format: 'bemo-backup';
  version: 1 | 2 | 3;
  exported_at: string;
  notes: NoteMeta[];
  trash: NoteMeta[];
  attachments?: BackupAttachment[];
};

function collectReferencedAttachmentFilenamesFromNotes(notes: NoteMeta[]): Set<string> {
  const filenames = new Set<string>();
  for (const note of notes) {
    for (const url of extractAttachmentUrlsFromContent(note.content || '')) {
      const filename = extractAttachmentFilename(url);
      if (filename) {
        filenames.add(filename);
      }
    }
  }
  return filenames;
}

async function serializeAttachmentBlobs(notes: NoteMeta[], trash: NoteMeta[]): Promise<BackupAttachment[]> {
  const referenced = await getReferencedAttachmentFilenames(['active', 'trash']);
  const fallback = collectReferencedAttachmentFilenamesFromNotes([...notes, ...trash]);
  const allowed = new Set<string>([...referenced, ...fallback]);
  const attachments = await getAllAttachmentBlobRecords();
  return Promise.all(attachments
    .filter((attachment) => allowed.has(attachment.filename))
    .map(async (attachment): Promise<BackupAttachment> => ({
    filename: attachment.filename,
    mime_type: attachment.mime_type,
    data: Array.from(new Uint8Array(await attachment.blob.arrayBuffer())),
  })));
}

async function restoreAttachmentBlobs(attachments: BackupAttachment[]): Promise<number> {
  for (const attachment of attachments) {
    await putAttachmentBlob({
      filename: attachment.filename,
      blob: new Blob([Uint8Array.from(attachment.data)], { type: attachment.mime_type || 'application/octet-stream' }),
      mimeType: attachment.mime_type,
    });
  }
  return attachments.length;
}

export async function buildBackupPayload(): Promise<BackupPayload> {
  const [notes, trash] = await Promise.all([
    getCachedNotes(),
    getTrashNotes(),
  ]);
  return {
    format: 'bemo-backup',
    version: 2,
    exported_at: new Date().toISOString(),
    notes,
    trash,
    attachments: await serializeAttachmentBlobs(notes, trash),
  };
}

export async function applyBackupPayload(payload: Partial<BackupPayload>) {
  if (payload.format !== 'bemo-backup' || (payload.version !== 1 && payload.version !== 2 && payload.version !== 3)) {
    throw new Error('不支持的备份格式，请选择 Bemo 导出的 JSON 备份文件。');
  }

  const notes = Array.isArray(payload.notes) ? payload.notes : [];
  const trash = Array.isArray(payload.trash) ? payload.trash : [];
  const attachments = (payload.version === 2 || payload.version === 3) && Array.isArray(payload.attachments)
    ? payload.attachments.filter((item): item is BackupAttachment => (
      Boolean(item)
      && typeof item.filename === 'string'
      && typeof item.mime_type === 'string'
      && Array.isArray(item.data)
    ))
    : [];

  await setCachedNotes(notes);
  await setTrashNotes(trash);
  await Promise.all([
    replaceNoteAttachmentRefsForScope('active', notes),
    replaceNoteAttachmentRefsForScope('trash', trash),
  ]);
  const importedImages = await restoreAttachmentBlobs(attachments);
  await clearMutationLog();
  await clearConflicts();
  await Promise.all([
    removeSyncStateValue('server_cursor'),
    removeSyncStateValue('webdav_cursor'),
    removeSyncStateValue('server_last_sync_at'),
    removeSyncStateValue('webdav_last_sync_at'),
  ]);

  return {
    imported_notes: notes.length,
    imported_images: importedImages,
    imported_note_records: [],
  };
}
