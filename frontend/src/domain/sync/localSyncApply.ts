import {
  createLocalConflictCopy,
  createLocalNoteFromSync,
  findLocalNoteById,
  moveLocalNoteToTrashById,
  updateLocalNoteById,
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
      const created = await createLocalNoteFromSync({
        note_id: noteId,
        revision: toNumber(payload.revision, 1),
        filename: typeof payload.filename === 'string' ? payload.filename : undefined,
        content: String(payload.content || ''),
        tags: normalizeTags(payload.tags),
        pinned: Boolean(payload.pinned),
        created_at: typeof payload.created_at === 'string' ? payload.created_at : undefined,
      });
      applied.push({ status: 'applied', note_id: noteId, filename: created.filename });
      continue;
    }

    const local = await findLocalNoteById(noteId);
    if (!local) {
      if (type === 'note.delete') {
        applied.push({
          status: 'applied',
          note_id: noteId,
          operation_id: operationId,
          noop: true,
        });
        continue;
      }

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
          tags: Array.isArray(payload.tags) ? payload.tags.map((tag) => String(tag)) : [],
          pinned: Boolean(payload.pinned),
          revision: toNumber(payload.revision, 1),
          created_at: typeof payload.created_at === 'string' ? payload.created_at : '',
        },
      });
      continue;
    }

    if (type === 'note.update') {
      const remoteContent = String(payload.content || '');
      if (hasConcurrentUpdateConflict(local, baseRevision, payload)) {
        const conflictCopy = await createLocalConflictCopy(local);
        const updated = await updateLocalNoteById(noteId, (current: NoteMeta) => ({
          ...current,
          content: remoteContent,
          title: deriveTitle(remoteContent, current.title),
          tags: Array.isArray(payload.tags) ? normalizeTags(payload.tags) : current.tags,
          revision: Math.max(current.revision + 1, toNumber(payload.revision, current.revision + 1)),
          updated_at: Math.floor(Date.now() / 1000),
        }));
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
            tags: Array.isArray(payload.tags) ? normalizeTags(payload.tags) : local.tags,
            revision: toNumber(payload.revision, local.revision + 1),
          },
          conflict_copy_note_id: conflictCopy.note_id,
          conflict_copy_filename: conflictCopy.filename,
          applied_filename: updated?.filename || local.filename,
        });
        continue;
      }

      const updated = await updateLocalNoteById(noteId, (current: NoteMeta) => ({
        ...current,
        content: remoteContent,
        title: deriveTitle(remoteContent, current.title),
        tags: Array.isArray(payload.tags) ? normalizeTags(payload.tags) : current.tags,
        revision: Math.max(current.revision + 1, toNumber(payload.revision, current.revision + 1)),
        updated_at: Math.floor(Date.now() / 1000),
      }));
      applied.push({ status: 'applied', note_id: noteId, filename: updated?.filename || local.filename });
      continue;
    }

    if (type === 'note.patch') {
      if (hasConcurrentPatchConflict(local, baseRevision, payload)) {
        const conflictCopy = await createLocalConflictCopy(local);
        const updated = await updateLocalNoteById(noteId, (current: NoteMeta) => ({
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

      const updated = await updateLocalNoteById(noteId, (current: NoteMeta) => ({
        ...current,
        pinned: payload.pinned !== undefined ? Boolean(payload.pinned) : current.pinned,
        tags: Array.isArray(payload.tags) ? normalizeTags(payload.tags) : current.tags,
        revision: Math.max(current.revision + 1, toNumber(payload.revision, current.revision + 1)),
        updated_at: Math.floor(Date.now() / 1000),
      }));
      applied.push({ status: 'applied', note_id: noteId, filename: updated?.filename || local.filename });
      continue;
    }

    if (type === 'note.delete') {
      if (shouldKeepDeleteAsConflict(local.revision, baseRevision)) {
        const conflictCopy = await createLocalConflictCopy(local);
        conflicts.push({
          status: 'conflict',
          note_id: noteId,
          operation_id: operationId,
          reason: 'revision_conflict',
          action_label: '保留本地并重试，或手动删除本地笔记以接受远端删除',
          local_filename: local.filename,
          local_snapshot: {
            filename: local.filename,
            title: local.title,
            content: local.content,
            tags: local.tags,
            revision: local.revision,
          },
          remote_snapshot: {
            deleted: true,
            revision: toNumber(baseRevision, local.revision),
          },
          conflict_copy_note_id: conflictCopy.note_id,
          conflict_copy_filename: conflictCopy.filename,
        });
        continue;
      }

      const moved = await moveLocalNoteToTrashById(noteId);
      applied.push({ status: 'applied', note_id: noteId, filename: moved?.filename || local.filename });
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
