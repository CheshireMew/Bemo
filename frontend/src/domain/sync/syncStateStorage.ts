import { openIndexedDb } from '../storage/indexedDb.js';

export interface SyncStateRecord {
  key: string;
  value: string;
}

export type RemoteSyncTarget = 'server' | 'webdav';

export function getSyncCursorStateKey(target: RemoteSyncTarget) {
  return `${target}_cursor`;
}

export function getSyncLastSyncStateKey(target: RemoteSyncTarget) {
  return `${target}_last_sync_at`;
}

export function getSyncLocalSeedStateKey(target: RemoteSyncTarget) {
  return `${target}_local_seed_fingerprint`;
}

export async function setSyncStateValue(key: string, value: string): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('syncState', 'readwrite');
  tx.objectStore('syncState').put({ key, value } as SyncStateRecord);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function getSyncStateValue(key: string): Promise<string | null> {
  const db = await openIndexedDb();
  const tx = db.transaction('syncState', 'readonly');
  return new Promise((resolve) => {
    const req = tx.objectStore('syncState').get(key);
    req.onsuccess = () => resolve((req.result as SyncStateRecord | undefined)?.value ?? null);
  });
}

export async function removeSyncStateValue(key: string): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('syncState', 'readwrite');
  tx.objectStore('syncState').delete(key);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function clearRemoteSyncProgressState(target: RemoteSyncTarget): Promise<void> {
  await Promise.all([
    removeSyncStateValue(getSyncCursorStateKey(target)),
    removeSyncStateValue(getSyncLastSyncStateKey(target)),
    removeSyncStateValue(getSyncLocalSeedStateKey(target)),
  ]);
}
