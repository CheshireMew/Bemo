import { normalizeNoteRevision, normalizeNoteTags } from '../../notes/noteContract.js';
import type { SyncRemoteNoteState } from '../syncTransport.js';
import type { SnapshotRecord, WebDavSnapshotNote } from './webdavTypes.js';

type SyncChange = {
  operation_id?: string;
  device_id?: string;
  entity_id?: string;
  type?: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
};

function normalizeAttachment(value: unknown) {
  if (!value || typeof value !== 'object') return [];
  const attachment = value as Record<string, unknown>;
  const filename = typeof attachment.filename === 'string' ? attachment.filename : '';
  const blobHash = typeof attachment.blob_hash === 'string' ? attachment.blob_hash : '';
  const mimeType = typeof attachment.mime_type === 'string' ? attachment.mime_type : 'application/octet-stream';
  if (!filename || !blobHash) return [];
  return [{
    filename,
    blob_hash: blobHash,
    mime_type: mimeType,
  }];
}

function toSnapshotNote(change: SyncChange, existing?: WebDavSnapshotNote): WebDavSnapshotNote | null {
  const payload = change.payload || {};
  const noteId = String(change.entity_id || existing?.note_id || '');
  if (!noteId) return null;

  if (change.type === 'note.purge') return null;

  if (change.type === 'note.delete' || change.type === 'note.trash') {
    return {
      note_id: noteId,
      scope: 'trash',
      revision: normalizeNoteRevision(payload.revision, existing?.revision ?? 1),
      filename: typeof payload.filename === 'string' ? payload.filename : existing?.filename,
      content: typeof payload.content === 'string' ? payload.content : existing?.content || '',
      tags: Array.isArray(payload.tags) ? normalizeNoteTags(payload.tags) : existing?.tags || [],
      pinned: payload.pinned !== undefined ? Boolean(payload.pinned) : existing?.pinned || false,
      created_at: typeof payload.created_at === 'string' ? payload.created_at : existing?.created_at,
      updated_at: typeof change.timestamp === 'string' ? change.timestamp : existing?.updated_at,
      attachments: Array.isArray(payload.attachments)
        ? payload.attachments.flatMap((attachment) => normalizeAttachment(attachment))
        : existing?.attachments || [],
    };
  }

  if (change.type === 'note.restore') {
    return {
      note_id: noteId,
      scope: 'active',
      revision: normalizeNoteRevision(payload.revision, existing?.revision ?? 1),
      filename: typeof payload.filename === 'string' ? payload.filename : existing?.filename,
      content: typeof payload.content === 'string' ? payload.content : existing?.content || '',
      tags: Array.isArray(payload.tags) ? normalizeNoteTags(payload.tags) : existing?.tags || [],
      pinned: payload.pinned !== undefined ? Boolean(payload.pinned) : existing?.pinned || false,
      created_at: typeof payload.created_at === 'string' ? payload.created_at : existing?.created_at,
      updated_at: typeof change.timestamp === 'string' ? change.timestamp : existing?.updated_at,
      attachments: Array.isArray(payload.attachments)
        ? payload.attachments.flatMap((attachment) => normalizeAttachment(attachment))
        : existing?.attachments || [],
    };
  }

  if (change.type === 'note.patch' && existing) {
    return {
      ...existing,
      revision: normalizeNoteRevision(payload.revision, existing.revision + 1),
      pinned: payload.pinned !== undefined ? Boolean(payload.pinned) : existing.pinned,
      tags: Array.isArray(payload.tags) ? normalizeNoteTags(payload.tags) : existing.tags,
      updated_at: typeof change.timestamp === 'string' ? change.timestamp : existing.updated_at,
      attachments: Array.isArray(payload.attachments)
        ? payload.attachments.flatMap((attachment) => normalizeAttachment(attachment))
        : existing.attachments,
    };
  }

  if (change.type === 'note.create' || change.type === 'note.update' || change.type === 'note.patch') {
    return {
      note_id: noteId,
      scope: 'active',
      revision: normalizeNoteRevision(payload.revision, existing?.revision ?? 1),
      filename: typeof payload.filename === 'string' ? payload.filename : existing?.filename,
      content: typeof payload.content === 'string' ? payload.content : existing?.content || '',
      tags: Array.isArray(payload.tags) ? normalizeNoteTags(payload.tags) : existing?.tags || [],
      pinned: payload.pinned !== undefined ? Boolean(payload.pinned) : existing?.pinned || false,
      created_at: typeof payload.created_at === 'string' ? payload.created_at : existing?.created_at,
      updated_at: typeof change.timestamp === 'string' ? change.timestamp : existing?.updated_at,
      attachments: Array.isArray(payload.attachments)
        ? payload.attachments.flatMap((attachment) => normalizeAttachment(attachment))
        : existing?.attachments || [],
    };
  }

  return existing ?? null;
}

function toRemoteNoteState(change: SyncChange, existing?: SyncRemoteNoteState): SyncRemoteNoteState | null {
  const noteId = String(change.entity_id || existing?.note_id || '');
  if (!noteId) return null;
  if (change.type === 'note.purge') return null;

  const payload = change.payload || {};
  const revision = normalizeNoteRevision(payload.revision, existing?.revision ?? 1);
  return {
    note_id: noteId,
    scope: change.type === 'note.trash' || change.type === 'note.delete' ? 'trash' : 'active',
    revision,
  };
}

export function applyChangesToSnapshotState(
  currentNotes: Record<string, WebDavSnapshotNote>,
  changes: SyncChange[],
): Record<string, WebDavSnapshotNote> {
  const next = { ...currentNotes };

  for (const change of changes) {
    const noteId = String(change.entity_id || '');
    if (!noteId) continue;

    if (change.type === 'note.purge') {
      delete next[noteId];
      continue;
    }

    const snapshotNote = toSnapshotNote(change, next[noteId]);
    if (snapshotNote) {
      next[noteId] = snapshotNote;
    }
  }

  return next;
}

export function buildBootstrapChangesFromSnapshot(snapshot: SnapshotRecord) {
  return Object.values(snapshot.notes || {})
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
    .map((note, index) => ({
      operation_id: `snapshot_${snapshot.latest_cursor}_${String(index + 1).padStart(6, '0')}_${note.note_id}`,
      device_id: 'snapshot',
      entity_id: note.note_id,
      type: note.scope === 'trash' ? 'note.trash' : 'note.create',
      timestamp: note.updated_at || snapshot.generated_at,
      base_revision: 0,
      cursor: snapshot.latest_cursor,
      payload: {
        revision: note.revision,
        filename: note.filename,
        content: note.content,
        tags: note.tags,
        pinned: note.pinned,
        created_at: note.created_at || snapshot.generated_at,
        attachments: note.attachments,
      },
    }));
}

export function buildRemoteNoteStatesFromSnapshot(snapshot: SnapshotRecord) {
  return Object.fromEntries(
    Object.values(snapshot.notes || {}).map((note) => [note.note_id, {
      note_id: note.note_id,
      scope: note.scope,
      revision: note.revision,
    } satisfies SyncRemoteNoteState] as const),
  );
}

export function applyChangesToRemoteNoteStates(
  currentNotes: Record<string, SyncRemoteNoteState>,
  changes: SyncChange[],
): Record<string, SyncRemoteNoteState> {
  const next = { ...currentNotes };

  for (const change of changes) {
    const noteId = String(change.entity_id || '');
    if (!noteId) continue;

    if (change.type === 'note.purge') {
      delete next[noteId];
      continue;
    }

    const remoteNote = toRemoteNoteState(change, next[noteId]);
    if (remoteNote) {
      next[noteId] = remoteNote;
    }
  }

  return next;
}

export function collectReferencedBlobHashes(notes: Record<string, WebDavSnapshotNote>) {
  const hashes = new Set<string>();
  for (const note of Object.values(notes)) {
    for (const attachment of note.attachments || []) {
      if (attachment.blob_hash) hashes.add(attachment.blob_hash);
    }
  }
  return hashes;
}
