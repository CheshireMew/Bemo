import { applyBackupPayload, type BackupPayload } from './backupPayload.js';
import { buildBackupArchiveBlob, parseBackupArchive } from './backupArchive.js';
import { clearCurrentAppData, clearLocalReplicaState, usesRemoteAppData } from '../appStore/dataAdapter.js';
import { downloadBlob } from './importExportShared.js';
import { buildMarkdownArchiveBlob, importMarkdownArchive } from './markdownArchive.js';
import { getSyncProxyToken, resolveBackendUrl } from '../../config.js';

export async function exportBackupArchive() {
  const archive = await buildBackupArchiveBlob();
  await downloadBlob(archive, `bemo_backup_${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip');
}

export async function importBackupArchive(file: File) {
  const isZip = /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
  const payload = isZip
    ? await parseBackupArchive(file)
    : JSON.parse(await file.text()) as Partial<BackupPayload>;
  const result = await applyBackupPayload(payload);
  if (usesRemoteAppData()) {
    await clearLocalReplicaState();
  }
  return result;
}

export async function exportMarkdownArchive() {
  const archive = await buildMarkdownArchiveBlob();
  await downloadBlob(archive, `bemo_markdown_archive_${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip');
}

export async function importMarkdownArchiveZip(file: File) {
  const result = await importMarkdownArchive(file);
  if (usesRemoteAppData()) {
    await clearLocalReplicaState();
  }
  return result;
}

export async function importBackupFromSyncDirectory(path: string) {
  const url = resolveBackendUrl('/api/sync/webdav/local-backup');
  const syncProxyToken = getSyncProxyToken();
  if (!url) {
    throw new Error('当前没有可用的本机同步服务地址，无法读取同步目录。');
  }
  if (!syncProxyToken) {
    throw new Error('当前没有可用的同步服务 Token，无法读取同步目录。');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${syncProxyToken}`,
    },
    body: JSON.stringify({ path }),
  });

  if (!response.ok) {
    let message = `读取同步目录失败 (${response.status})`;
    try {
      const payload = await response.json() as { detail?: string };
      if (payload.detail) message = payload.detail;
    } catch {
      // Ignore non-JSON error payloads.
    }
    throw new Error(message);
  }

  const payload = await response.json() as Partial<BackupPayload>;
  const result = await applyBackupPayload(payload);
  if (usesRemoteAppData()) {
    await clearLocalReplicaState();
  }
  return result;
}

export async function clearCurrentWorkspaceData() {
  return clearCurrentAppData();
}

export async function resetCurrentInstallState() {
  await clearCurrentWorkspaceData();

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
