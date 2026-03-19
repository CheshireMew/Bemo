import type { NoteMeta } from '../notes/notesTypes.js';

export type ConflictDetail = Record<string, unknown>;

export type ConflictRecordLike = {
  note_id: string;
  reason: string;
  conflict_copy_filename?: string;
  detail: ConflictDetail;
};

export function canKeepLocalConflict(reason: string) {
  return reason === 'revision_conflict';
}

export function canRecreateFromRemoteConflict(reason: string) {
  return reason === 'local_note_not_found';
}

export function isRemoteDeleteConflict(detail: ConflictDetail) {
  const remoteSnapshot = detail.remote_snapshot;
  if (!remoteSnapshot || typeof remoteSnapshot !== 'object') {
    return false;
  }
  return Boolean((remoteSnapshot as Record<string, unknown>).deleted);
}

export function canAcceptRemoteDeleteConflict(conflict: ConflictRecordLike) {
  return conflict.reason === 'revision_conflict' && isRemoteDeleteConflict(conflict.detail);
}

export function getConflictCopyFilename(conflict: ConflictRecordLike) {
  if (typeof conflict.conflict_copy_filename === 'string' && conflict.conflict_copy_filename) {
    return conflict.conflict_copy_filename;
  }
  return typeof conflict.detail.conflict_copy_filename === 'string' ? conflict.detail.conflict_copy_filename : '';
}

export function getRemoteRevision(detail: ConflictDetail) {
  const remoteSnapshot = detail.remote_snapshot;
  if (!remoteSnapshot || typeof remoteSnapshot !== 'object') {
    return null;
  }
  const revision = Number((remoteSnapshot as Record<string, unknown>).revision);
  return Number.isFinite(revision) ? revision : null;
}

export function buildKeepLocalResyncPayload(input: {
  noteId: string;
  canonical: NoteMeta;
  conflictCopy: NoteMeta;
  remoteRevision: number | null;
}) {
  return {
    entityId: input.noteId,
    type: 'note.update' as const,
    baseRevision: input.remoteRevision ?? input.canonical.revision,
    payload: {
      filename: input.canonical.filename,
      content: input.conflictCopy.content,
      tags: [...input.conflictCopy.tags],
    },
    updatedNote: {
      content: input.conflictCopy.content,
      title: input.conflictCopy.title.replace(/^冲突副本\s*-\s*/, '') || input.canonical.title,
      tags: [...input.conflictCopy.tags],
    },
  };
}

export function buildRemoteRecreationInput(conflict: ConflictRecordLike) {
  const remoteChange = conflict.detail.remote_change;
  if (!remoteChange || typeof remoteChange !== 'object') {
    throw new Error('缺少远端变更内容');
  }

  const change = remoteChange as Record<string, unknown>;
  const type = String(change.type || '');
  const payload = change.payload && typeof change.payload === 'object'
    ? change.payload as Record<string, unknown>
    : {};

  if (type !== 'note.create' && type !== 'note.update') {
    throw new Error('当前冲突不支持按远端重建');
  }

  return {
    note_id: conflict.note_id,
    revision: Number(payload.revision ?? 1),
    filename: typeof payload.filename === 'string' ? payload.filename : undefined,
    content: typeof payload.content === 'string' ? payload.content : '',
    tags: Array.isArray(payload.tags) ? payload.tags.map((tag) => String(tag)) : [],
    pinned: Boolean(payload.pinned),
    created_at: typeof payload.created_at === 'string' ? payload.created_at : undefined,
  };
}
