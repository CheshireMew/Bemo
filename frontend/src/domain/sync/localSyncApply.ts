import {
  createLocalConflictCopy,
} from '../notes/localNoteCreation.js';
import {
  moveLocalNoteToTrashById,
  purgeLocalNoteById,
  restoreLocalTrashNote,
} from '../notes/localTrashMutations.js';
import { updateLocalNoteById } from '../notes/localNoteMutations.js';
import {
  findLocalNoteById,
  findLocalTrashNoteById,
} from '../notes/localNoteQueries.js';
import type { NoteMeta } from '../notes/notesTypes.js';
import { normalizeNoteContentPayload, normalizeNoteTags } from '../notes/noteContract.js';
import {
  applyRemoteActiveState,
  applyRemoteTrashState,
} from './localSyncNoteState.js';
import {
  hasConcurrentPatchConflict,
  hasConcurrentUpdateConflict,
  shouldKeepDeleteAsConflict,
} from './localSyncConflicts.js';

type SyncChange = {
  operation_id?: string;
  device_id?: string;
  entity_id?: string;
  type?: string;
  base_revision?: number | null;
  payload?: Record<string, unknown>;
};

function toNumber(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function tagsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

function hasAppliedActiveState(note: NoteMeta, payload: Record<string, unknown>) {
  const remote = normalizeNoteContentPayload(payload, note.revision);
  return note.revision >= remote.revision
    && note.content === remote.content
    && tagsEqual(note.tags, remote.tags)
    && note.pinned === Boolean(remote.pinned ?? note.pinned);
}

function hasAppliedPatchState(note: NoteMeta, payload: Record<string, unknown>) {
  const remoteRevision = toNumber(payload.revision, note.revision);
  if (note.revision < remoteRevision) return false;
  if (payload.pinned !== undefined && note.pinned !== Boolean(payload.pinned)) {
    return false;
  }
  if (Array.isArray(payload.tags) && !tagsEqual(note.tags, normalizeNoteTags(payload.tags))) {
    return false;
  }
  return true;
}

function hasAppliedTrashState(note: NoteMeta, payload: Record<string, unknown>, type: string) {
  if (type === 'note.delete' && Object.keys(payload).length === 0) {
    return true;
  }
  const remote = normalizeNoteContentPayload(payload, note.revision);
  return note.revision >= remote.revision
    && note.content === remote.content
    && tagsEqual(note.tags, remote.tags)
    && note.pinned === Boolean(remote.pinned ?? note.pinned);
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
        if (hasAppliedActiveState(existing, payload)) {
          applied.push({ status: 'applied', note_id: noteId, filename: existing.filename, deduplicated: true });
          continue;
        }
        if (change.device_id === 'snapshot') {
          const updated = await applyRemoteActiveState(noteId, payload, existing);
          applied.push({ status: 'applied', note_id: noteId, filename: updated.filename });
          continue;
        }
        applied.push({ status: 'applied', note_id: noteId, filename: existing.filename });
        continue;
      }

      const trash = await findLocalTrashNoteById(noteId);
      if (trash) {
        const restored = await restoreLocalTrashNote(trash.note_id);
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
            tags: normalizeNoteTags(payload.tags),
            pinned: Boolean(payload.pinned),
            revision: toNumber(payload.revision, 1),
            created_at: typeof payload.created_at === 'string' ? payload.created_at : '',
          },
        });
        continue;
      }

      if (hasAppliedActiveState(local, payload)) {
        applied.push({ status: 'applied', note_id: noteId, filename: local.filename, deduplicated: true });
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
            tags: normalizeNoteTags(payload.tags),
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

      if (hasAppliedPatchState(local, payload)) {
        applied.push({ status: 'applied', note_id: noteId, filename: local.filename, deduplicated: true });
        continue;
      }

      if (hasConcurrentPatchConflict(local, baseRevision, payload)) {
        const conflictCopy = await createLocalConflictCopy(local);
        const updated = await updateLocalNoteById(noteId, (current) => ({
          ...current,
          pinned: payload.pinned !== undefined ? Boolean(payload.pinned) : current.pinned,
          tags: Array.isArray(payload.tags) ? normalizeNoteTags(payload.tags) : current.tags,
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
            tags: Array.isArray(payload.tags) ? normalizeNoteTags(payload.tags) : local.tags,
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
        tags: Array.isArray(payload.tags) ? normalizeNoteTags(payload.tags) : current.tags,
        revision: Math.max(current.revision + 1, toNumber(payload.revision, current.revision + 1)),
        updated_at: Math.floor(Date.now() / 1000),
      }));
      applied.push({ status: 'applied', note_id: noteId, filename: updated?.filename || local.filename });
      continue;
    }

    if (type === 'note.trash' || type === 'note.delete') {
      if (localTrash && hasAppliedTrashState(localTrash, payload, type)) {
        applied.push({ status: 'applied', note_id: noteId, filename: localTrash.filename, deduplicated: true });
        continue;
      }

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

        await moveLocalNoteToTrashById(noteId);
        const existingTrash = await findLocalTrashNoteById(noteId);
        const updatedTrash = type === 'note.delete' && Object.keys(payload).length === 0
          ? (() => {
            if (!existingTrash) {
              throw new Error(`Failed to apply remote trash state for note ${noteId}`);
            }
            return existingTrash;
          })()
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
      if (local && hasAppliedActiveState(local, payload)) {
        applied.push({ status: 'applied', note_id: noteId, filename: local.filename, deduplicated: true });
        continue;
      }

      if (localTrash) {
        const restored = await restoreLocalTrashNote(localTrash.note_id);
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

export {
  hasConcurrentPatchConflict,
  hasConcurrentUpdateConflict,
  shouldKeepDeleteAsConflict,
} from './localSyncConflicts.js';
