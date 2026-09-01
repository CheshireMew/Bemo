import { applyBackupPayload, type BackupPayload } from './backupPayload.js';
import { buildBackupArchiveBlob, parseBackupArchive } from './backupArchive.js';
import { clearCurrentAppData, clearLocalReplicaState, usesRemoteAppData } from '../appStore/dataAdapter.js';
import { downloadBlob } from './importExportShared.js';
import { buildMarkdownArchiveBlob, importMarkdownArchive } from './markdownArchive.js';
import { buildBackupPayloadFromSyncDirectoryFiles } from './syncDirectoryBackup.js';
import { withSyncPaused } from '../sync/syncCoordinator.js';

export async function exportBackupArchive() {
  const archive = await buildBackupArchiveBlob();
  await downloadBlob(archive, `bemo_backup_${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip');
}

export async function importBackupArchive(file: File) {
  const isZip = /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
  const payload = isZip
    ? await parseBackupArchive(file)
    : JSON.parse(await file.text()) as Partial<BackupPayload>;
  return withSyncPaused(async () => {
    const result = await applyBackupPayload(payload);
    if (usesRemoteAppData()) await clearLocalReplicaState();
    return result;
  });
}

export async function exportMarkdownArchive() {
  const archive = await buildMarkdownArchiveBlob();
  await downloadBlob(archive, `bemo_markdown_archive_${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip');
}

export async function importMarkdownArchiveZip(file: File) {
  return withSyncPaused(async () => {
    const result = await importMarkdownArchive(file);
    if (usesRemoteAppData()) await clearLocalReplicaState();
    return result;
  });
}

export async function importBackupFromSyncDirectoryFiles(files: Iterable<File>) {
  const payload = await buildBackupPayloadFromSyncDirectoryFiles(files);
  return withSyncPaused(async () => {
    const result = await applyBackupPayload(payload);
    if (usesRemoteAppData()) await clearLocalReplicaState();
    return result;
  });
}

export async function clearCurrentWorkspaceData() {
  return withSyncPaused(clearCurrentAppData);
}

export async function resetCurrentInstallState() {
  return withSyncPaused(async () => {
  await clearLocalReplicaState();

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
  }, false);
}
