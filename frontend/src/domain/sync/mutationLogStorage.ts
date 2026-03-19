import { openIndexedDb } from '../../utils/indexedDb.js';

export type NoteMutationType = 'note.create' | 'note.update' | 'note.patch' | 'note.delete';
export type SyncTarget = 'server' | 'webdav';

export interface ChangeRecord {
  id?: number;
  operation_id: string;
  device_id: string;
  entity_id: string;
  target?: SyncTarget;
  type: NoteMutationType;
  base_revision: number | null;
  timestamp: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

function createOperationId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `op_${Date.now()}_${random}`;
}

export function claimMutationLogTargets(items: ChangeRecord[], target: SyncTarget): ChangeRecord[] {
  return items.map((item) => (
    item.target ? item : { ...item, target }
  ));
}

export async function enqueueChange(input: {
  target: SyncTarget;
  deviceId: string;
  entityId: string;
  type: NoteMutationType;
  baseRevision?: number | null;
  payload: Record<string, unknown>;
}): Promise<ChangeRecord> {
  const entry: ChangeRecord = {
    operation_id: createOperationId(),
    device_id: input.deviceId,
    entity_id: input.entityId,
    target: input.target,
    type: input.type,
    base_revision: input.baseRevision ?? null,
    timestamp: new Date().toISOString(),
    payload: input.payload,
    createdAt: Date.now(),
  };
  const db = await openIndexedDb();
  const tx = db.transaction('mutationLog', 'readwrite');
  const store = tx.objectStore('mutationLog');
  const request = store.add(entry);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve({ ...entry, id: Number(request.result) });
    request.onerror = () => reject(request.error);
  });
}

export function filterMutationLogByTarget(items: ChangeRecord[], target?: SyncTarget): ChangeRecord[] {
  const filtered = target ? items.filter((item) => item.target === target) : items;
  return [...filtered].sort((a, b) => a.createdAt - b.createdAt);
}

export async function getMutationLog(target?: SyncTarget): Promise<ChangeRecord[]> {
  const db = await openIndexedDb();
  const tx = db.transaction('mutationLog', 'readonly');
  const store = tx.objectStore('mutationLog');
  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result || []) as ChangeRecord[];
      resolve(filterMutationLogByTarget(items, target));
    };
  });
}

export async function claimLegacyMutationTargets(target: SyncTarget): Promise<number> {
  const db = await openIndexedDb();
  const tx = db.transaction('mutationLog', 'readwrite');
  const store = tx.objectStore('mutationLog');

  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result || []) as ChangeRecord[];
      const legacyItems = items.filter((item) => !item.target);
      if (legacyItems.length === 0) {
        resolve(0);
        return;
      }

      claimMutationLogTargets(legacyItems, target).forEach((item) => {
        store.put(item);
      });

      tx.oncomplete = () => resolve(legacyItems.length);
    };
  });
}

export async function removeMutation(id: number): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('mutationLog', 'readwrite');
  tx.objectStore('mutationLog').delete(id);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function getPendingCount(): Promise<number> {
  return (await getMutationLog()).length;
}

export async function getPendingCountsByTarget(): Promise<Record<SyncTarget, number>> {
  const [serverQueue, webdavQueue] = await Promise.all([
    getMutationLog('server'),
    getMutationLog('webdav'),
  ]);

  return {
    server: serverQueue.length,
    webdav: webdavQueue.length,
  };
}

export async function clearMutationLog(): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('mutationLog', 'readwrite');
  tx.objectStore('mutationLog').clear();
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}
