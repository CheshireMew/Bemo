import { openIndexedDb } from '../../utils/indexedDb.js';

export interface SyncStateRecord {
  key: string;
  value: string;
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
