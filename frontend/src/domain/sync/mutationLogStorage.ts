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
  target_id?: string;
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
  targetId?: string | null;
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
    target_id: input.targetId || undefined,
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

export function filterMutationLogByTarget(items: ChangeRecord[], target?: SyncTarget, targetId?: string): ChangeRecord[] {
  const filtered = items.filter(item => (!target || item.target === target) && (!targetId || item.target_id === targetId));
  return [...filtered].sort((a, b) => a.createdAt - b.createdAt);
}

export async function getMutationLog(target?: SyncTarget, targetId?: string): Promise<ChangeRecord[]> {
  return filterMutationLogByTarget(await readStore('mutationLog', store => store.getAll()), target, targetId);
}

export async function bindLegacyMutationTarget(target: SyncTarget, targetId: string): Promise<void> {
  return withIndexedDb(['mutationLog', 'syncState'], 'readwrite', tx => {
    const state = tx.objectStore('syncState');
    const owner = state.get(`legacy_target_owner:${target}`);
    owner.onsuccess = () => {
      if (owner.result && owner.result.value !== targetId) return;
      state.put({ key: `legacy_target_owner:${target}`, value: targetId });
      const log = tx.objectStore('mutationLog');
      const request = log.getAll();
      request.onsuccess = () => {
        for (const item of request.result as ChangeRecord[]) {
          if ((!item.target || item.target === target) && !item.target_id) log.put({ ...item, target, target_id: targetId });
        }
      };
    };
  });
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
