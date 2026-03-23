import {
  createLocalConflictCopy,
  createLocalNoteFromSync,
  createLocalTrashNoteFromSync,
  findLocalNoteById,
  findLocalTrashNoteById,
  moveLocalNoteToTrashById,
  purgeLocalNoteById,
  restoreLocalTrashNote,
  updateLocalNoteById,
  updateLocalTrashNoteById,
} from '../notes/localNotesRepository.js';
import type { NoteMeta } from '../notes/notesTypes.js';

type SyncChange = {
  operation_id?: string;
  entity_id?: string;
  type?: string;
  base_revision?: number | null;
  payload?: Record<string, unknown>;
};

type ConflictComparableNote = {
  revision: number;
  content: string;
  tags: string[];
};

type RemoteNotePayload = {
  filename?: string;
  content: string;
  tags: string[];
  pinned: boolean;
  revision: number;
  created_at?: string;
};

function toNumber(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function deriveTitle(content: string, fallback: string) {
  const next = String(content || '').trim().split('\n')[0].replace(/^#+\s*/, '').trim().slice(0, 40);
  return next || fallback;
}

function normalizeTags(tags: unknown) {
  return Array.isArray(tags) ? tags.map((tag) => String(tag)) : [];
}

function normalizeRemoteNotePayload(payload: Record<string, unknown>, fallbackRevision = 1): RemoteNotePayload {
  return {
    filename: typeof payload.filename === 'string' ? payload.filename : undefined,
    content: String(payload.content || ''),
    tags: normalizeTags(payload.tags),
    pinned: Boolean(payload.pinned),
    revision: toNumber(payload.revision, fallbackRevision),
    created_at: typeof payload.created_at === 'string' ? payload.created_at : undefined,
  };
}

function requireAppliedNote(note: NoteMeta | null, scope: 'active' | 'trash', noteId: string) {
  if (!note) {
    throw new Error(`Failed to apply remote ${scope} state for note ${noteId}`);
  }
  return note;
}

export function hasConcurrentUpdateConflict(
  local: ConflictComparableNote,
  baseRevision: number | null,
  payload: Record<string, unknown>,
) {
  if (baseRevision === null || local.revision <= baseRevision) {
    return false;
  }

  const remoteContent = String(payload.content || '');
  const remoteTags = normalizeTags(payload.tags);
  const contentChanged = local.content !== remoteContent;
  const tagsChanged = local.tags.length !== remoteTags.length
    || local.tags.some((tag, index) => tag !== remoteTags[index]);

  return contentChanged || tagsChanged;
}

export function shouldKeepDeleteAsConflict(localRevision: number, baseRevision: number | null) {
  return baseRevision !== null && localRevision > baseRevision;
}

export function hasConcurrentPatchConflict(
  local: Pick<ConflictComparableNote, 'revision' | 'tags'> & { pinned?: boolean },
  baseRevision: number | null,
  payload: Record<string, unknown>,
) {
  if (baseRevision === null || local.revision <= baseRevision) {
    return false;
  }

  if (payload.pinned !== undefined && Boolean(payload.pinned) !== Boolean(local.pinned)) {
    return true;
  }

  if (Array.isArray(payload.tags)) {
    const remoteTags = normalizeTags(payload.tags);
    const tagsChanged = local.tags.length !== remoteTags.length
      || local.tags.some((tag, index) => tag !== remoteTags[index]);
    if (tagsChanged) {
      return true;
    }
  }

  return false;
}

async function applyRemoteActiveState(noteId: string, payload: Record<string, unknown>, current?: NoteMeta | null) {
  const remote = normalizeRemoteNotePayload(payload, current?.revision ?? 1);

  if (current) {
    const updated = await updateLocalNoteById(noteId, (local) => ({
      ...local,
      filename: remote.filename || local.filename,
      content: remote.content,
      title: deriveTitle(remote.content, local.title),
      tags: remote.tags,
      pinned: remote.pinned,
      revision: Math.max(local.revision + 1, remote.revision),
      updated_at: Math.floor(Date.now() / 1000),
    }));
    return requireAppliedNote(updated, 'active', noteId);
  }

  return createLocalNoteFromSync({
    note_id: noteId,
    revision: remote.revision,
    filename: remote.filename,
    content: remote.content,
    tags: remote.tags,
    pinned: remote.pinned,
    created_at: remote.created_at,
  });
}

async function applyRemoteTrashState(noteId: string, payload: Record<string, unknown>, current?: NoteMeta | null) {
  const remote = normalizeRemoteNotePayload(payload, current?.revision ?? 1);

  if (current) {
    const updated = await updateLocalTrashNoteById(noteId, (local) => ({
      ...local,
      filename: remote.filename || local.filename,
      content: remote.content,
      title: deriveTitle(remote.content, local.title),
      tags: remote.tags,
      pinned: remote.pinned,
      revision: Math.max(local.revision + 1, remote.revision),
      updated_at: Math.floor(Date.now() / 1000),
    }));
    return requireAppliedNote(updated, 'trash', noteId);
  }

  return createLocalTrashNoteFromSync({
    note_id: noteId,
    revision: remote.revision,
    filename: remote.filename,
    content: remote.content,
    tags: remote.tags,
    pinned: remote.pinned,
    created_at: remote.created_at,
  });
}

export async function applyChangesLocally(changes: SyncChange[]) {
  const applied: Array<Record<string, unknown>> = [];
  const conflicts: Array<Record<string, unknown>> = [];

  for (const change of changes) {
    const type = String(change.type || '');
    const noteId = String(change.entity_id || '');
    const operationId = String(change.operation_id || '');
    const payload = change.payload || {};
    const baseRevision = change.base_revision ?? null;

    if (type === 'note.create') {
      const existing = await findLocalNoteById(noteId);
      if (existing) {
        applied.push({ status: 'applied', note_id: noteId, filename: existing.filename });
        continue;
      }

      const trash = await findLocalTrashNoteById(noteId);
      if (trash) {
        const restored = await restoreLocalTrashNote(trash.filename);
        const updated = await applyRemoteActiveState(noteId, payload, restored);
        applied.push({ status: 'applied', note_id: noteId, filename: updated.filename });
        continue;
      }

      const created = await applyRemoteActiveState(noteId, payload);
      applied.push({ status: 'applied', note_id: noteId, filename: created.filename });
      continue;
    }

    const local = await findLocalNoteById(noteId);
    const localTrash = await findLocalTrashNoteById(noteId);

    if (type === 'note.update') {
      if (!local) {
        conflicts.push({
          status: 'conflict',
          note_id: noteId,
          operation_id: operationId,
          reason: 'local_note_not_found',
          action_label: '可按远端内容重建，或忽略此冲突',
          remote_change: {
            type,
            base_revision: baseRevision,
            payload,
          },
          remote_snapshot: {
            filename: typeof payload.filename === 'string' ? payload.filename : '',
            content: typeof payload.content === 'string' ? payload.content : '',
            tags: normalizeTags(payload.tags),
            pinned: Boolean(payload.pinned),
            revision: toNumber(payload.revision, 1),
            created_at: typeof payload.created_at === 'string' ? payload.created_at : '',
          },
        });
        continue;
      }

      const remoteContent = String(payload.content || '');
      if (hasConcurrentUpdateConflict(local, baseRevision, payload)) {
        const conflictCopy = await createLocalConflictCopy(local);
        const updated = await applyRemoteActiveState(noteId, payload, local);
        conflicts.push({
          status: 'conflict',
          note_id: noteId,
          operation_id: operationId,
          reason: 'revision_conflict',
          action_label: '保留本地副本或接受远端版本',
          local_filename: local.filename,
          local_snapshot: {
            filename: local.filename,
            title: local.title,
            content: local.content,
            tags: local.tags,
            revision: local.revision,
          },
          remote_snapshot: {
            content: remoteContent,
            tags: normalizeTags(payload.tags),
            revision: toNumber(payload.revision, local.revision + 1),
          },
          conflict_copy_note_id: conflictCopy.note_id,
          conflict_copy_filename: conflictCopy.filename,
          applied_filename: updated?.filename || local.filename,
        });
        continue;
      }

      const updated = await applyRemoteActiveState(noteId, payload, local);
      applied.push({ status: 'applied', note_id: noteId, filename: updated?.filename || local.filename });
      continue;
    }

    if (type === 'note.patch') {
      if (!local) {
        conflicts.push({
          status: 'conflict',
          note_id: noteId,
          operation_id: operationId,
          reason: 'local_note_not_found',
          action_label: '该属性更新缺少本地活动笔记',
          remote_change: {
            type,
            base_revision: baseRevision,
            payload,
          },
        });
        continue;
      }

      if (hasConcurrentPatchConflict(local, baseRevision, payload)) {
        const conflictCopy = await createLocalConflictCopy(local);
        const updated = await updateLocalNoteById(noteId, (current) => ({
          ...current,
          pinned: payload.pinned !== undefined ? Boolean(payload.pinned) : current.pinned,
          tags: Array.isArray(payload.tags) ? normalizeTags(payload.tags) : current.tags,
          revision: Math.max(current.revision + 1, toNumber(payload.revision, current.revision + 1)),
          updated_at: Math.floor(Date.now() / 1000),
        }));
        conflicts.push({
          status: 'conflict',
          note_id: noteId,
          operation_id: operationId,
          reason: 'revision_conflict',
          action_label: '保留本地副本或接受远端属性',
          local_filename: local.filename,
          local_snapshot: {
            filename: local.filename,
            title: local.title,
            content: local.content,
            tags: local.tags,
            pinned: local.pinned,
            revision: local.revision,
          },
          remote_snapshot: {
            tags: Array.isArray(payload.tags) ? normalizeTags(payload.tags) : local.tags,
            pinned: payload.pinned !== undefined ? Boolean(payload.pinned) : local.pinned,
            revision: toNumber(payload.revision, local.revision + 1),
          },
          conflict_copy_note_id: conflictCopy.note_id,
          conflict_copy_filename: conflictCopy.filename,
          applied_filename: updated?.filename || local.filename,
        });
        continue;
      }

      const updated = await updateLocalNoteById(noteId, (current) => ({
        ...current,
        pinned: payload.pinned !== undefined ? Boolean(payload.pinned) : current.pinned,
        tags: Array.isArray(payload.tags) ? normalizeTags(payload.tags) : current.tags,
        revision: Math.max(current.revision + 1, toNumber(payload.revision, current.revision + 1)),
        updated_at: Math.floor(Date.now() / 1000),
      }));
      applied.push({ status: 'applied', note_id: noteId, filename: updated?.filename || local.filename });
      continue;
    }

    if (type === 'note.trash' || type === 'note.delete') {
      if (local) {
        if (shouldKeepDeleteAsConflict(local.revision, baseRevision)) {
          const conflictCopy = await createLocalConflictCopy(local);
          conflicts.push({
            status: 'conflict',
            note_id: noteId,
            operation_id: operationId,
            reason: 'revision_conflict',
            action_label: '保留本地并重试，或手动移入回收站以接受远端状态',
            local_filename: local.filename,
            local_snapshot: {
              filename: local.filename,
              title: local.title,
              content: local.content,
              tags: local.tags,
              revision: local.revision,
            },
            remote_snapshot: {
              trashed: true,
              revision: toNumber(payload.revision, local.revision + 1),
            },
            conflict_copy_note_id: conflictCopy.note_id,
            conflict_copy_filename: conflictCopy.filename,
          });
          continue;
        }

        const moved = await moveLocalNoteToTrashById(noteId);
        const existingTrash = await findLocalTrashNoteById(noteId);
        const updatedTrash = type === 'note.delete' && Object.keys(payload).length === 0
          ? requireAppliedNote(existingTrash ?? moved, 'trash', noteId)
          : await applyRemoteTrashState(noteId, payload, existingTrash);
        applied.push({ status: 'applied', note_id: noteId, filename: updatedTrash?.filename || local.filename });
        continue;
      }

      if (localTrash) {
        const updated = type === 'note.delete' && Object.keys(payload).length === 0
          ? localTrash
          : await applyRemoteTrashState(noteId, payload, localTrash);
        applied.push({ status: 'applied', note_id: noteId, filename: updated?.filename || localTrash.filename });
        continue;
      }

      if (type === 'note.delete') {
        applied.push({
          status: 'applied',
          note_id: noteId,
          operation_id: operationId,
          noop: true,
        });
        continue;
      }

      const created = await applyRemoteTrashState(noteId, payload);
      applied.push({ status: 'applied', note_id: noteId, filename: created.filename });
      continue;
    }

    if (type === 'note.restore') {
      if (localTrash) {
        const restored = await restoreLocalTrashNote(localTrash.filename);
        const updated = await applyRemoteActiveState(noteId, payload, restored);
        applied.push({ status: 'applied', note_id: noteId, filename: updated.filename });
        continue;
      }

      if (local) {
        const updated = await applyRemoteActiveState(noteId, payload, local);
        applied.push({ status: 'applied', note_id: noteId, filename: updated.filename });
        continue;
      }

      const created = await applyRemoteActiveState(noteId, payload);
      applied.push({ status: 'applied', note_id: noteId, filename: created.filename });
      continue;
    }

    if (type === 'note.purge') {
      const purged = await purgeLocalNoteById(noteId);
      applied.push({
        status: 'applied',
        note_id: noteId,
        filename: purged?.filename || '',
        purged: Boolean(purged),
      });
      continue;
    }

    conflicts.push({
      status: 'conflict',
      note_id: noteId,
      operation_id: operationId,
      reason: 'unsupported_change_type',
      action_label: '该变更类型暂不支持自动处理',
      remote_change: {
        type,
        base_revision: baseRevision,
        payload,
      },
    });
  }

  return { applied, conflicts };
}
