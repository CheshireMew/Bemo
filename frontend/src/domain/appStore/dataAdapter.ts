import { clearBackendAppStorage } from '../attachments/backendAttachmentsApi.js';
import {
  getAllAttachmentBlobRecords,
  putAttachmentBlob,
} from '../attachments/blobStorage.js';
import { getReferencedAttachmentFilenames, replaceNoteAttachmentRefsForScope } from '../attachments/attachmentRefStorage.js';
import { extractAttachmentFilename, extractAttachmentUrlsFromContent } from '../attachments/attachmentLinks.js';
import { clearAttachmentUrlCache } from '../attachments/attachmentUrlResolver.js';
import { openIndexedDb } from '../storage/indexedDb.js';
import { shouldUseBackendAppStore } from '../runtime/appStoreRuntime.js';
import { getCachedNotes, setCachedNotes } from '../notes/notesStorage.js';
import { getTrashNotes, setTrashNotes } from '../notes/trashStorage.js';
import type { NoteMeta } from '../notes/notesTypes.js';
import { clearConflicts } from '../sync/conflictStorage.js';
import { clearMutationLog } from '../sync/mutationLogStorage.js';
import { clearRemoteSyncProgressState } from '../sync/syncStateStorage.js';
import { applyBackendBackupPayload, buildBackendBackupPayload } from '../importExport/backendImportExport.js';
import type { BackupAttachment, BackupPayload } from '../importExport/backupPayload.js';

export function usesRemoteAppData() {
  return shouldUseBackendAppStore();
}

export function getClearCurrentDataPrompt() {
  return shouldUseBackendAppStore()
    ? '这会清空当前主存储里的所有笔记、回收站、附件和同步残留，并删除本机缓存，仅保留设置。确定继续吗？'
    : '这会清空本地所有笔记、回收站、附件和同步队列，仅保留设置。确定继续吗？';
}

export function getClearCurrentDataSuccessMessage() {
  return shouldUseBackendAppStore()
    ? '已清空当前主存储和本机缓存中的笔记、附件与同步残留。'
    : '已清空本地笔记、附件和同步残留。';
}

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

async function serializeLocalAttachmentBlobs(notes: NoteMeta[], trash: NoteMeta[]): Promise<BackupAttachment[]> {
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

async function restoreLocalAttachmentBlobs(attachments: BackupAttachment[]): Promise<number> {
  for (const attachment of attachments) {
    await putAttachmentBlob({
      filename: attachment.filename,
      blob: new Blob([Uint8Array.from(attachment.data)], { type: attachment.mime_type || 'application/octet-stream' }),
      mimeType: attachment.mime_type,
    });
  }
  return attachments.length;
}

async function buildLocalBackupPayload(): Promise<BackupPayload> {
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
    attachments: await serializeLocalAttachmentBlobs(notes, trash),
  };
}

async function applyLocalBackupPayload(payload: Partial<BackupPayload>) {
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
  const importedImages = await restoreLocalAttachmentBlobs(attachments);
  await clearMutationLog();
  await clearConflicts();
  await Promise.all([
    clearRemoteSyncProgressState('server'),
    clearRemoteSyncProgressState('webdav'),
  ]);

  return {
    imported_notes: notes.length,
    imported_images: importedImages,
    imported_note_records: [],
  };
}

export async function buildBackupPayloadForCurrentStore(): Promise<BackupPayload> {
  return shouldUseBackendAppStore()
    ? buildBackendBackupPayload()
    : buildLocalBackupPayload();
}

export async function applyBackupPayloadToCurrentStore(payload: Partial<BackupPayload>) {
  if (payload.format !== 'bemo-backup' || (payload.version !== 1 && payload.version !== 2 && payload.version !== 3)) {
    throw new Error('不支持的备份格式，请选择 Bemo 导出的 JSON 备份文件。');
  }

  if (shouldUseBackendAppStore()) {
    const result = await applyBackendBackupPayload(payload);
    return {
      imported_notes: result.imported_notes,
      imported_images: result.imported_images,
      imported_note_records: [],
    };
  }

  return applyLocalBackupPayload(payload);
}

export async function clearLocalReplicaState() {
  const db = await openIndexedDb();
  const tx = db.transaction([
    'cachedNotes',
    'trashNotes',
    'mutationLog',
    'syncState',
    'conflicts',
    'blobIndex',
    'attachmentBlobs',
    'draftAttachmentBlobs',
    'attachmentRefs',
  ], 'readwrite');

  tx.objectStore('cachedNotes').clear();
  tx.objectStore('trashNotes').clear();
  tx.objectStore('mutationLog').clear();
  tx.objectStore('syncState').clear();
  tx.objectStore('conflicts').clear();
  tx.objectStore('blobIndex').clear();
  tx.objectStore('attachmentBlobs').clear();
  tx.objectStore('draftAttachmentBlobs').clear();
  tx.objectStore('attachmentRefs').clear();

  await new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
  });

  clearAttachmentUrlCache();
}

export async function clearCurrentAppData() {
  if (shouldUseBackendAppStore()) {
    await clearBackendAppStorage();
  }
  await clearLocalReplicaState();

  if (typeof localStorage !== 'undefined') {
    const draftKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith('bemo.editor.draft:')) {
        draftKeys.push(key);
      }
    }
    draftKeys.forEach((key) => localStorage.removeItem(key));
  }

  return {
    cleared_notes: true,
    cleared_attachments: true,
  };
}
