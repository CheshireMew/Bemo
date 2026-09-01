import { clearBackendAppStorage } from '../attachments/backendAttachmentsApi.js';
import {
  getAllAttachmentBlobRecords,
} from '../attachments/blobStorage.js';
import { getReferencedAttachmentFilenames } from '../attachments/attachmentRefStorage.js';
import { extractAttachmentFilename, extractAttachmentUrlsFromContent } from '../attachments/attachmentLinks.js';
import { clearAttachmentUrlCache } from '../attachments/attachmentUrlResolver.js';
import { withIndexedDb } from '../storage/transactions.js';
import { extractAttachmentFilenames } from '../attachments/attachmentRefParser.js';
import { validateBackupPayload } from '../importExport/backupValidation.js';
import { shouldUseBackendAppStore } from '../runtime/appStoreRuntime.js';
import { getCachedNotes } from '../notes/notesStorage.js';
import { getTrashNotes } from '../notes/trashStorage.js';
import type { NoteMeta } from '../notes/notesTypes.js';
import { applyBackendBackupPayload, buildBackendBackupPayload } from '../importExport/backendImportExport.js';
import type { BackupAttachment, BackupPayload } from '../importExport/backupPayload.js';

export function usesRemoteAppData() {
  return shouldUseBackendAppStore();
}

export function getClearCurrentDataPrompt() {
  return shouldUseBackendAppStore()
    ? '这会永久删除后端主存储中的所有笔记、回收站、附件和同步残留，并清理本机缓存，仅保留设置。使用同一后端的其他设备也会受到影响。建议先导出完整备份。'
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
  const { notes, trash, attachments } = validateBackupPayload(payload);
  const blobs = attachments.map(item => ({ filename: item.filename, mime_type: item.mime_type,
    blob: new Blob([Uint8Array.from(item.data)], { type: item.mime_type }), updatedAt: Date.now() }));
  const stores = ['cachedNotes', 'trashNotes', 'attachmentBlobs', 'draftAttachmentBlobs', 'attachmentRefs', 'blobIndex', 'mutationLog', 'conflicts', 'syncState'];
  await withIndexedDb(stores, 'readwrite', tx => {
    for (const name of stores) if (name !== 'syncState') tx.objectStore(name).clear();
    notes.forEach(note => tx.objectStore('cachedNotes').put(note));
    trash.forEach(note => tx.objectStore('trashNotes').put(note));
    blobs.forEach(blob => tx.objectStore('attachmentBlobs').put(blob));
    for (const [scope, items] of [['active', notes], ['trash', trash]] as const) {
      for (const note of items) for (const filename of extractAttachmentFilenames(note.content)) {
        tx.objectStore('attachmentRefs').put({ id: `note:${note.note_id}:${filename}`, owner_type: 'note', owner_id: note.note_id, note_id: note.note_id, filename, scope, updatedAt: Date.now() });
      }
    }
    for (const target of ['server', 'webdav']) for (const suffix of ['cursor', 'last_sync_at']) tx.objectStore('syncState').delete(`${target}_${suffix}`);
  });
  clearAttachmentUrlCache();

  return {
    imported_notes: notes.length,
    imported_images: attachments.length,
    imported_note_records: [],
  };
}

export async function buildBackupPayloadForCurrentStore(): Promise<BackupPayload> {
  return shouldUseBackendAppStore()
    ? buildBackendBackupPayload()
    : buildLocalBackupPayload();
}

export async function applyBackupPayloadToCurrentStore(payload: Partial<BackupPayload>) {
  validateBackupPayload(payload);

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
  await withIndexedDb([
    'cachedNotes',
    'trashNotes',
    'mutationLog',
    'syncState',
    'conflicts',
    'blobIndex',
    'attachmentBlobs',
    'draftAttachmentBlobs',
    'attachmentRefs',
  ], 'readwrite', tx => {

  tx.objectStore('cachedNotes').clear();
  tx.objectStore('trashNotes').clear();
  tx.objectStore('mutationLog').clear();
  tx.objectStore('syncState').clear();
  tx.objectStore('conflicts').clear();
  tx.objectStore('blobIndex').clear();
  tx.objectStore('attachmentBlobs').clear();
  tx.objectStore('draftAttachmentBlobs').clear();
  tx.objectStore('attachmentRefs').clear();

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
