import { buildBackupPayload, applyBackupPayload, type BackupPayload } from './backupPayload.js';
import { buildBackupArchiveBlob, parseBackupArchive } from './backupArchive.js';
import { cleanupOrphanAttachments } from '../attachments/orphanAttachmentCleanup.js';
import { clearAttachmentUrlCache } from '../attachments/attachmentUrlResolver.js';
import { exportFlomoCsv, importFlomoArchive } from './flomoImportExport.js';
import { downloadBlob } from './importExportShared.js';
import { buildMarkdownArchiveBlob, importMarkdownArchive } from './markdownArchive.js';
import { openIndexedDb } from '../storage/indexedDb.js';

export type { BackupPayload } from './backupPayload.js';

export async function exportBackupArchive() {
  const archive = await buildBackupArchiveBlob();
  downloadBlob(archive, `bemo_backup_${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip');
}

export async function importBackupArchive(file: File) {
  const isZip = /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
  const payload = isZip
    ? await parseBackupArchive(file)
    : JSON.parse(await file.text()) as Partial<BackupPayload>;
  return applyBackupPayload(payload);
}

export async function exportMarkdownArchive() {
  const archive = await buildMarkdownArchiveBlob();
  downloadBlob(archive, `bemo_markdown_archive_${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip');
}

export async function importMarkdownArchiveZip(file: File) {
  return importMarkdownArchive(file);
}

export async function clearAllLocalExperimentData() {
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

export async function resetAppToFirstInstallState() {
  await clearAllLocalExperimentData();

  if (typeof localStorage !== 'undefined') {
    const keysToRemove: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      if (key.startsWith('bemo.') || key === 'theme') {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }

  return {
    reset_completed: true,
  };
}

export {
  applyBackupPayload,
  buildBackupArchiveBlob,
  buildBackupPayload,
  cleanupOrphanAttachments,
  exportFlomoCsv,
  importFlomoArchive,
};
