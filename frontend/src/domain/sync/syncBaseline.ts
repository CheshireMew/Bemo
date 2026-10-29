import type { SyncChange, SyncRemoteNoteState } from './syncTransport.js';
import { getSyncStateRecords, getSyncStateValue, setSyncStateValue } from './syncStateStorage.js';
import { scopedSyncKey } from './syncTargetIdentity.js';

export type SyncBaseline = {
  note_id: string; scope: SyncRemoteNoteState['scope']; revision: number;
  content: string; tags: string[]; pinned: boolean;
  cursor?: string;
};

export function noteStateFingerprint(note: { content: string; tags: string[]; pinned?: boolean }) {
  return JSON.stringify([note.content, note.tags, Boolean(note.pinned)]);
}

export async function readSyncBaselines(targetId: string): Promise<Map<string, SyncBaseline>> {
  const rows = await getSyncStateRecords(scopedSyncKey(targetId, 'baseline:'));
  return new Map(rows.map(row => { const value = JSON.parse(row.value) as SyncBaseline; return [value.note_id, value]; }));
}

export async function recordSyncBaseline(targetId: string, change: SyncChange) {
  const id = change.entity_id;
  if (!id) return;
  const key = scopedSyncKey(targetId, `baseline:${encodeURIComponent(id)}`);
  const previous = await getSyncStateValue(key);
  const old = previous ? JSON.parse(previous) as SyncBaseline : undefined;
  if (old?.cursor && change.cursor && Number(change.cursor) <= Number(old.cursor)) return;
  const payload = change.payload || {};
  const scope = change.type === 'note.purge' ? 'purged' : ['note.trash', 'note.delete'].includes(change.type || '') ? 'trash' : 'active';
  const baseline: SyncBaseline = {
    note_id: id, scope, revision: Number(payload.revision) || old?.revision || 1,
    content: typeof payload.content === 'string' ? payload.content : old?.content || '',
    tags: Array.isArray(payload.tags) ? payload.tags.map(String) : old?.tags || [],
    pinned: payload.pinned !== undefined ? Boolean(payload.pinned) : old?.pinned || false,
    cursor: change.cursor,
  };
  await setSyncStateValue(key, JSON.stringify(baseline));
}
