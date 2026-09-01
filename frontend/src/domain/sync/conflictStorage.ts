import { readStore, writeStore, withIndexedDb } from '../storage/transactions.js';
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
  return withIndexedDb('conflicts', 'readwrite', tx => {
  const store = tx.objectStore('conflicts');
  const request = store.getAll();
  request.onsuccess = () => {
    const rows = request.result as SyncConflictRecord[];
    if (detail.operation_id && rows.some(row => row.operation_id === detail.operation_id && row.source === source && row.reason === detail.reason)) return;
    try { store.add({
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
    } as SyncConflictRecord); } catch { tx.abort(); }
  };
  });
}

function decode(row: SyncConflictRecord) {
  return { ...row, detail: row.detail_json ? JSON.parse(row.detail_json) as Record<string, unknown> : {} };
}
export async function getConflicts(): Promise<Array<SyncConflictRecord & { detail: Record<string, unknown> }>> {
  const rows = await readStore<SyncConflictRecord[]>('conflicts', store => store.getAll());
  return rows.sort((a, b) => b.createdAt - a.createdAt).map(decode);
}
export function clearConflict(id: number): Promise<void> {
  return writeStore('conflicts', store => { store.delete(id); });
}
export async function getConflict(id: number): Promise<(SyncConflictRecord & { detail: Record<string, unknown> }) | null> {
  const row = await readStore<SyncConflictRecord | undefined>('conflicts', store => store.get(id));
  return row ? decode(row) : null;
}
export function clearConflicts(): Promise<void> {
  return writeStore('conflicts', store => { store.clear(); });
}
