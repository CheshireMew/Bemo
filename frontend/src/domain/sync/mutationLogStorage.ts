import { readStore, writeStore, withIndexedDb } from '../storage/transactions.js';

export type NoteMutationType =
  | 'note.create'
  | 'note.update'
  | 'note.patch'
  | 'note.trash'
  | 'note.restore'
  | 'note.purge'
  | 'note.delete';
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
  return withIndexedDb('mutationLog', 'readwrite', tx => {
    const request = tx.objectStore('mutationLog').add(entry);
    return () => ({ ...entry, id: Number(request.result) });
  });
}

export function filterMutationLogByTarget(items: ChangeRecord[], target?: SyncTarget): ChangeRecord[] {
  const filtered = target ? items.filter((item) => item.target === target) : items;
  return [...filtered].sort((a, b) => a.createdAt - b.createdAt);
}

export async function getMutationLog(target?: SyncTarget): Promise<ChangeRecord[]> {
  return filterMutationLogByTarget(await readStore('mutationLog', store => store.getAll()), target);
}

export async function claimLegacyMutationTargets(target: SyncTarget): Promise<number> {
  return withIndexedDb('mutationLog', 'readwrite', tx => {
    const store = tx.objectStore('mutationLog');
    let count = 0;
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result || []) as ChangeRecord[];
      const legacyItems = items.filter((item) => !item.target);
      count = legacyItems.length;
      try { claimMutationLogTargets(legacyItems, target).forEach(item => store.put(item)); }
      catch { tx.abort(); }
    };
    return () => count;
  });
}

export async function removeMutation(id: number): Promise<void> {
  return writeStore('mutationLog', store => { store.delete(id); });
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
  return writeStore('mutationLog', store => { store.clear(); });
}
