import { clearBackendAppStorage } from '../attachments/backendAttachmentsApi.js';
import type { AttachmentRefRecord } from '../attachments/attachmentRefStorage.js';
import { extractAttachmentFilename, extractAttachmentUrlsFromContent } from '../attachments/attachmentLinks.js';
import { clearAttachmentUrlCache } from '../attachments/attachmentUrlResolver.js';
import { withIndexedDb } from '../storage/transactions.js';
import { extractAttachmentFilenames } from '../attachments/attachmentRefParser.js';
import { validateBackupPayload } from '../importExport/backupValidation.js';
import { shouldUseBackendAppStore } from '../runtime/appStoreRuntime.js';
import type { NoteMeta } from '../notes/notesTypes.js';
import { applyBackendBackupPayload, buildBackendBackupPayload } from '../importExport/backendImportExport.js';
import type { BackupAttachment, BackupPayload } from '../importExport/backupPayload.js';
import { scheduleWorkspaceReplacement } from '../sync/workspaceReplacement.js';
import { getOrCreateDeviceId } from '../storage/deviceIdentity.js';
import { readSyncConfigSnapshot } from '../sync/syncConfig.js';
import { getSyncTargetId } from '../sync/syncTargetIdentity.js';
import type { ChangeRecord } from '../sync/mutationLogStorage.js';
import type { SyncStateRecord } from '../sync/syncStateStorage.js';

export function usesRemoteAppData() {
  return shouldUseBackendAppStore();
}

export function getClearCurrentDataPrompt() {
  return shouldUseBackendAppStore()
    ? '这会永久删除后端主存储中的所有笔记、回收站和附件，并清理本机缓存。删除结果也会同步到已连接的目标，使用同一后端的其他设备也会受到影响。建议先导出完整备份。'
    : '这会清空本地笔记、回收站和附件，删除结果也会同步到已连接的目标。建议先导出完整备份。';
}

export function getClearCurrentDataSuccessMessage() {
  return shouldUseBackendAppStore()
    ? '已清空当前主存储和本机缓存，删除结果将在同步时发送。'
    : '已清空本地笔记和附件，删除结果将在同步时发送。';
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

async function serializeLocalAttachmentBlobs(notes: NoteMeta[], trash: NoteMeta[], refs: AttachmentRefRecord[], attachments: Array<{filename: string; mime_type: string; blob: Blob}>): Promise<BackupAttachment[]> {
  const referenced = refs.filter(ref => ref.scope === 'active' || ref.scope === 'trash').map(ref => ref.filename);
  const fallback = collectReferencedAttachmentFilenamesFromNotes([...notes, ...trash]);
  const allowed = new Set<string>([...referenced, ...fallback]);
  return Promise.all(attachments
    .filter((attachment) => allowed.has(attachment.filename))
    .map(async (attachment): Promise<BackupAttachment> => ({
      filename: attachment.filename,
      mime_type: attachment.mime_type,
      data: Array.from(new Uint8Array(await attachment.blob.arrayBuffer())),
    })));
}

async function buildLocalBackupPayload(): Promise<BackupPayload> {
  const { notes, trash, refs, attachments } = await withIndexedDb(['cachedNotes', 'trashNotes', 'attachmentRefs', 'attachmentBlobs'], 'readonly', tx => {
    const notes = tx.objectStore('cachedNotes').getAll();
    const trash = tx.objectStore('trashNotes').getAll();
    const refs = tx.objectStore('attachmentRefs').getAll();
    const attachments = tx.objectStore('attachmentBlobs').getAll();
    return () => ({ notes: notes.result as NoteMeta[], trash: trash.result as NoteMeta[], refs: refs.result as AttachmentRefRecord[], attachments: attachments.result as Array<{filename: string; mime_type: string; blob: Blob}> });
  });
  return {
    format: 'bemo-backup',
    version: 2,
    exported_at: new Date().toISOString(),
    notes,
    trash,
    attachments: await serializeLocalAttachmentBlobs(notes, trash, refs, attachments),
  };
}

async function applyLocalBackupPayload(payload: Partial<BackupPayload>) {
  const { notes, trash, attachments } = validateBackupPayload(payload);
  // An imported protocol revision is never an editor's concurrency credential.
  for (const note of [...notes, ...trash]) note.edit_version = crypto.randomUUID();
  const blobs = attachments.map(item => ({ filename: item.filename, mime_type: item.mime_type,
    blob: new Blob([Uint8Array.from(item.data)], { type: item.mime_type }), updatedAt: Date.now(), version: crypto.randomUUID() }));
  const stores = ['cachedNotes', 'trashNotes', 'attachmentBlobs', 'attachmentContentBlobs', 'draftAttachmentBlobs', 'attachmentRefs', 'blobIndex', 'mutationLog', 'conflicts', 'syncState'];
  const deviceId = await getOrCreateDeviceId();
  const config = readSyncConfigSnapshot(), targetId = getSyncTargetId(config);
  await withIndexedDb(stores, 'readwrite', tx => {
    const active = tx.objectStore('cachedNotes').getAll(), deleted = tx.objectStore('trashNotes').getAll();
    const pending = tx.objectStore('mutationLog').getAll(), state = tx.objectStore('syncState').getAll();
    state.onsuccess = () => {
      scheduleWorkspaceReplacement(tx, [...active.result, ...deleted.result] as NoteMeta[], notes, trash,
        pending.result as ChangeRecord[], state.result as SyncStateRecord[], deviceId,
        targetId && config.mode !== 'local' ? { target: config.mode, targetId } : undefined);
      for (const name of stores) if (!['syncState', 'mutationLog'].includes(name)) tx.objectStore(name).clear();
      notes.forEach(note => tx.objectStore('cachedNotes').put(note));
      trash.forEach(note => tx.objectStore('trashNotes').put(note));
      blobs.forEach(blob => tx.objectStore('attachmentBlobs').put(blob));
      for (const [scope, items] of [['active', notes], ['trash', trash]] as const) {
        for (const note of items) for (const filename of extractAttachmentFilenames(note.content)) {
          tx.objectStore('attachmentRefs').put({ id: `note:${note.note_id}:${filename}`, owner_type: 'note', owner_id: note.note_id, note_id: note.note_id, filename, scope, updatedAt: Date.now() });
        }
      }
    };
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
    'attachmentContentBlobs',
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
  tx.objectStore('attachmentContentBlobs').clear();
  tx.objectStore('draftAttachmentBlobs').clear();
  tx.objectStore('attachmentRefs').clear();

  });

  clearAttachmentUrlCache();
}

export async function clearCurrentAppData() {
  if (shouldUseBackendAppStore()) {
    await clearBackendAppStorage();
    await clearLocalReplicaState();
  } else {
    await applyLocalBackupPayload({ format: 'bemo-backup', version: 3, notes: [], trash: [], attachments: [] });
  }

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
