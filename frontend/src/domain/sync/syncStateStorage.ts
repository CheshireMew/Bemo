import { readStore, writeStore } from '../storage/transactions.js';

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

export async function setSyncStateValue(key: string, value: string): Promise<void> {
  return writeStore('syncState', store => { store.put({ key, value } as SyncStateRecord); });
}

export async function getSyncStateValue(key: string): Promise<string | null> {
  return (await readStore<SyncStateRecord | undefined>('syncState', store => store.get(key)))?.value ?? null;
}

export async function removeSyncStateValue(key: string): Promise<void> {
  return writeStore('syncState', store => { store.delete(key); });
}

export async function clearRemoteSyncProgressState(target: RemoteSyncTarget): Promise<void> {
  await Promise.all([
    removeSyncStateValue(getSyncCursorStateKey(target)),
    removeSyncStateValue(getSyncLastSyncStateKey(target)),
  ]);
}
