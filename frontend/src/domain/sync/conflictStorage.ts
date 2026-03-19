import { openIndexedDb } from '../../utils/indexedDb.js';
import type { SyncTarget } from './mutationLogStorage.js';

export interface SyncConflictRecord {
  id?: number;
  source: SyncTarget;
  note_id: string;
  operation_id: string;
  reason: string;
  status?: 'open' | 'resolved';
  action_label?: string;
  local_filename?: string;
  conflict_copy_filename?: string;
  detail_json: string;
  createdAt: number;
  resolvedAt?: number;
}

export async function addConflict(source: SyncTarget, detail: {
  note_id: string;
  operation_id: string;
  reason: string;
  action_label?: string;
  local_filename?: string;
  conflict_copy_filename?: string;
  [key: string]: unknown;
}): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('conflicts', 'readwrite');
  tx.objectStore('conflicts').add({
    source,
    note_id: detail.note_id,
    operation_id: detail.operation_id,
    reason: detail.reason,
    status: 'open',
    action_label: typeof detail.action_label === 'string' ? detail.action_label : '',
    local_filename: typeof detail.local_filename === 'string' ? detail.local_filename : '',
    conflict_copy_filename: typeof detail.conflict_copy_filename === 'string' ? detail.conflict_copy_filename : '',
    detail_json: JSON.stringify(detail),
    createdAt: Date.now(),
  } as SyncConflictRecord);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function getConflicts(): Promise<Array<SyncConflictRecord & { detail: Record<string, unknown> }>> {
  const db = await openIndexedDb();
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
  const db = await openIndexedDb();
  const tx = db.transaction('conflicts', 'readwrite');
  tx.objectStore('conflicts').delete(id);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function getConflict(id: number): Promise<(SyncConflictRecord & { detail: Record<string, unknown> }) | null> {
  const db = await openIndexedDb();
  const tx = db.transaction('conflicts', 'readonly');
  return new Promise((resolve) => {
    const req = tx.objectStore('conflicts').get(id);
    req.onsuccess = () => {
      const row = (req.result as SyncConflictRecord | undefined) ?? null;
      if (!row) {
        resolve(null);
        return;
      }
      resolve({
        ...row,
        detail: row.detail_json ? JSON.parse(row.detail_json) as Record<string, unknown> : {},
      });
    };
  });
}

export async function clearConflicts(): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('conflicts', 'readwrite');
  tx.objectStore('conflicts').clear();
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}
