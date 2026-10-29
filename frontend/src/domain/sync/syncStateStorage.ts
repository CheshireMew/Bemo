import { readStore, writeStore } from '../storage/transactions.js';
import { appRequest } from '../appStore/backendAppApi.js';
import { shouldUseBackendAppStore } from '../runtime/appStoreRuntime.js';
import { readSyncConfigSnapshot } from './syncConfig.js';
import { getSyncTargetId, scopedSyncKey } from './syncTargetIdentity.js';

export interface SyncStateRecord {
  key: string;
  value: string;
}

export type RemoteSyncTarget = 'server' | 'webdav';

export function getSyncCursorStateKey(target: RemoteSyncTarget, targetId = getSyncTargetId(readSyncConfigSnapshot(), target)) {
  return targetId ? scopedSyncKey(targetId, 'cursor') : `${target}_cursor`;
}

export function getSyncLastSyncStateKey(target: RemoteSyncTarget, targetId = getSyncTargetId(readSyncConfigSnapshot(), target)) {
  return targetId ? scopedSyncKey(targetId, 'last_sync_at') : `${target}_last_sync_at`;
}

export async function setSyncStateValue(key: string, value: string): Promise<void> {
  if (key.startsWith('sync:') && shouldUseBackendAppStore()) {
    await appRequest(`/api/app/sync-state/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ value }) });
    return;
  }
  return writeStore('syncState', store => { store.put({ key, value } as SyncStateRecord); });
}

export async function getSyncStateValue(key: string): Promise<string | null> {
  if (key.startsWith('sync:') && shouldUseBackendAppStore()) {
    return (await appRequest<{ value: string | null }>(`/api/app/sync-state/${encodeURIComponent(key)}`)).value;
  }
  return (await readStore<SyncStateRecord | undefined>('syncState', store => store.get(key)))?.value ?? null;
}

export async function getSyncStateRecords(prefix: string): Promise<SyncStateRecord[]> {
  if (prefix.startsWith('sync:') && shouldUseBackendAppStore()) {
    return appRequest<SyncStateRecord[]>(`/api/app/sync-states?prefix=${encodeURIComponent(prefix)}`);
  }
  return (await readStore<SyncStateRecord[]>('syncState', store => store.getAll())).filter(row => row.key.startsWith(prefix));
}

export async function removeSyncStateValue(key: string): Promise<void> {
  if (key.startsWith('sync:') && shouldUseBackendAppStore()) {
    await appRequest(`/api/app/sync-state/${encodeURIComponent(key)}`, { method: 'DELETE' });
    return;
  }
  return writeStore('syncState', store => { store.delete(key); });
}

export async function migrateLegacySyncProgress(target: RemoteSyncTarget, targetId: string) {
  const ownerKey = `legacy_progress_owner:${target}`;
  const owner = await getSyncStateValue(ownerKey);
  if (owner && owner !== targetId) return;
  // Progress belongs to the first configured target only, never a later replacement.
  await setSyncStateValue(ownerKey, targetId);
  for (const name of ['cursor', 'last_sync_at']) {
    const key = scopedSyncKey(targetId, name);
    if (await getSyncStateValue(key) !== null) continue;
    const legacy = await getSyncStateValue(`${target}_${name}`);
    if (legacy !== null) await setSyncStateValue(key, legacy);
  }
}

export async function clearRemoteSyncProgressState(target: RemoteSyncTarget): Promise<void> {
  await Promise.all([
    removeSyncStateValue(getSyncCursorStateKey(target)),
    removeSyncStateValue(getSyncLastSyncStateKey(target)),
  ]);
}
