import type { NoteMeta } from '../store/notes';

const DB_NAME = 'bemo-offline';
const DB_VERSION = 4;

export type NoteMutationType = 'note.create' | 'note.update' | 'note.patch' | 'note.delete';
export type SyncTarget = 'server' | 'webdav';

export interface ChangeRecord {
  id?: number;
  operation_id: string;
  device_id: string;
  entity_id: string;
  type: NoteMutationType;
  base_revision: number | null;
  timestamp: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface SyncStateRecord {
  key: string;
  value: string;
}

export interface SyncConflictRecord {
  id?: number;
  source: SyncTarget;
  note_id: string;
  operation_id: string;
  reason: string;
  detail_json: string;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('cachedNotes')) {
        db.createObjectStore('cachedNotes', { keyPath: 'filename' });
      }
      if (!db.objectStoreNames.contains('mutationLog')) {
        db.createObjectStore('mutationLog', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('syncState')) {
        db.createObjectStore('syncState', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('conflicts')) {
        db.createObjectStore('conflicts', { keyPath: 'id', autoIncrement: true });
      }
      if (db.objectStoreNames.contains('pendingQueue')) {
        db.deleteObjectStore('pendingQueue');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createOfflineNoteId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `local_${Date.now()}_${random}`;
}

function createOperationId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `op_${Date.now()}_${random}`;
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getSyncStateValue('device_id');
  if (existing) return existing;
  const next = `device_${Math.random().toString(36).slice(2, 12)}`;
  await setSyncStateValue('device_id', next);
  return next;
}

export async function setCachedNotes(notes: NoteMeta[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('cachedNotes', 'readwrite');
  const store = tx.objectStore('cachedNotes');
  store.clear();
  notes.forEach((n) => store.put(n));
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function getCachedNotes(): Promise<NoteMeta[]> {
  const db = await openDB();
  const tx = db.transaction('cachedNotes', 'readonly');
  const store = tx.objectStore('cachedNotes');
  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result || []) as NoteMeta[]);
  });
}

export async function enqueueChange(input: {
  entityId: string;
  type: NoteMutationType;
  baseRevision?: number | null;
  payload: Record<string, unknown>;
}): Promise<ChangeRecord> {
  const deviceId = await getOrCreateDeviceId();
  const entry: ChangeRecord = {
    operation_id: createOperationId(),
    device_id: deviceId,
    entity_id: input.entityId,
    type: input.type,
    base_revision: input.baseRevision ?? null,
    timestamp: new Date().toISOString(),
    payload: input.payload,
    createdAt: Date.now(),
  };
  const db = await openDB();
  const tx = db.transaction('mutationLog', 'readwrite');
  const store = tx.objectStore('mutationLog');
  const request = store.add(entry);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve({ ...entry, id: Number(request.result) });
    request.onerror = () => reject(request.error);
  });
}

export async function getMutationLog(): Promise<ChangeRecord[]> {
  const db = await openDB();
  const tx = db.transaction('mutationLog', 'readonly');
  const store = tx.objectStore('mutationLog');
  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result || []) as ChangeRecord[];
      items.sort((a, b) => a.createdAt - b.createdAt);
      resolve(items);
    };
  });
}

export async function removeMutation(id: number): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('mutationLog', 'readwrite');
  tx.objectStore('mutationLog').delete(id);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function getPendingCount(): Promise<number> {
  return (await getMutationLog()).length;
}

export async function setSyncStateValue(key: string, value: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('syncState', 'readwrite');
  tx.objectStore('syncState').put({ key, value } as SyncStateRecord);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function getSyncStateValue(key: string): Promise<string | null> {
  const db = await openDB();
  const tx = db.transaction('syncState', 'readonly');
  return new Promise((resolve) => {
    const req = tx.objectStore('syncState').get(key);
    req.onsuccess = () => resolve((req.result as SyncStateRecord | undefined)?.value ?? null);
  });
}

export async function addConflict(source: SyncTarget, detail: {
  note_id: string;
  operation_id: string;
  reason: string;
  [key: string]: unknown;
}): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('conflicts', 'readwrite');
  tx.objectStore('conflicts').add({
    source,
    note_id: detail.note_id,
    operation_id: detail.operation_id,
    reason: detail.reason,
    detail_json: JSON.stringify(detail),
    createdAt: Date.now(),
  } as SyncConflictRecord);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function getConflicts(): Promise<Array<SyncConflictRecord & { detail: Record<string, unknown> }>> {
  const db = await openDB();
  const tx = db.transaction('conflicts', 'readonly');
  const store = tx.objectStore('conflicts');
  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = (req.result || []) as SyncConflictRecord[];
      rows.sort((a, b) => b.createdAt - a.createdAt);
      resolve(rows.map((row) => ({
        ...row,
        detail: row.detail_json ? JSON.parse(row.detail_json) as Record<string, unknown> : {},
      })));
    };
  });
}

export async function clearConflict(id: number): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('conflicts', 'readwrite');
  tx.objectStore('conflicts').delete(id);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}
