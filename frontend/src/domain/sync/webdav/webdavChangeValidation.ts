import { applyChangesToSnapshotState } from './webdavSnapshotState.js';
import type { WebDavSnapshotNote } from './webdavTypes.js';
import type { SyncChange, SyncPushConflict } from '../syncTransport.js';

/** File locking protects the commit; this check protects the note being edited. */
export function validateWebDavChanges(notes: Record<string, WebDavSnapshotNote>, changes: SyncChange[]) {
  let current = notes;
  const accepted: SyncChange[] = [];
  const conflicts: SyncPushConflict[] = [];
  const blocked = new Set<string>();
  for (const change of changes) {
    const id = String(change.entity_id || '');
    const note = current[id];
    const kind = String(change.type || '');
    let reason = '';
    if (!id || !change.operation_id) reason = 'invalid_change';
    else if (blocked.has(id)) reason = 'dependency_conflict';
    else if (kind === 'note.create') { if (note) reason = 'note_exists'; }
    else if (!['note.update', 'note.patch', 'note.trash', 'note.delete', 'note.restore', 'note.purge'].includes(kind)) reason = 'unsupported_change_type';
    else if (note?.scope === 'purged' && kind !== 'note.purge') reason = 'note_not_found';
    else if ((!note || note.scope !== 'active') && ['note.update', 'note.patch'].includes(kind)) reason = 'note_not_found';
    else if (note && change.base_revision != null && change.base_revision !== note.revision) reason = 'revision_conflict';
    if (reason) {
      blocked.add(id);
      conflicts.push({ operation_id: change.operation_id, note_id: id, reason,
        current_revision: note?.revision ?? 0,
        remote_snapshot: note ? { ...note, trashed: note.scope === 'trash', purged: note.scope === 'purged' } : undefined });
      continue;
    }
    const normalized: SyncChange = { ...change, payload: { ...change.payload,
      revision: kind === 'note.create' || !note ? Math.max(1, Number(change.payload?.revision) || 1) : note.revision + 1 } };
    current = applyChangesToSnapshotState(current, [normalized]);
    const next = current[id]!;
    accepted.push({ ...normalized, type: kind === 'note.delete' ? 'note.trash' : kind,
      payload: { ...normalized.payload, filename: next.filename, content: next.content, tags: next.tags,
        pinned: next.pinned, created_at: next.created_at, attachments: next.attachments, revision: next.revision } });
  }
  return { accepted, conflicts };
}
