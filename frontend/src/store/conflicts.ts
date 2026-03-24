import { ref } from 'vue';
import { clearConflict, getConflict, getConflicts } from '../domain/sync/conflictStorage.js';
import { enqueueRemoteNoteChange } from '../domain/sync/noteSyncOutbox.js';
import {
  buildKeepLocalResyncPayload,
  buildRemoteRecreationInput,
  canAcceptRemoteDeleteConflict,
  getConflictCopyFilename,
  getRemoteRevision,
} from '../domain/sync/conflictResolution.js';
import {
  createLocalNoteFromSync,
} from '../domain/notes/localNoteCreation';
import { moveLocalNoteToTrashById } from '../domain/notes/localTrashMutations';
import { updateLocalNoteById } from '../domain/notes/localNoteMutations';
import {
  findLocalNoteByFilename,
  findLocalNoteById,
} from '../domain/notes/localNoteQueries';
import { fetchNotes } from './notes';
import { requestSyncNow } from '../domain/sync/syncCoordinator.js';

export interface ConflictItem {
  id: number;
  source: 'server' | 'webdav';
  note_id: string;
  operation_id: string;
  reason: string;
  createdAt: number;
  actionLabel: string;
  localFilename: string;
  conflictCopyFilename: string;
  detail: Record<string, unknown>;
}

export const conflicts = ref<ConflictItem[]>([]);

export async function fetchConflicts() {
  const rows = await getConflicts();
  conflicts.value = rows.map((row) => ({
    id: row.id!,
    source: row.source,
    note_id: row.note_id,
    operation_id: row.operation_id,
    reason: row.reason,
    createdAt: row.createdAt,
    actionLabel: row.action_label || '',
    localFilename: row.local_filename || '',
    conflictCopyFilename: row.conflict_copy_filename || '',
    detail: row.detail,
  }));
}

export async function dismissConflict(id: number) {
  await clearConflict(id);
  conflicts.value = conflicts.value.filter((item) => item.id !== id);
}

export async function acceptConflictResult(id: number) {
  await dismissConflict(id);
}

export async function keepLocalAndResync(id: number) {
  const conflict = await getConflict(id);
  if (!conflict) return;

  const conflictCopyFilename = getConflictCopyFilename(conflict);
  const noteId = conflict.note_id;
  const remoteBaseRevision = getRemoteRevision(conflict.detail);

  if (conflict.reason === 'revision_conflict' && conflictCopyFilename) {
    const [conflictCopy, canonical] = await Promise.all([
      findLocalNoteByFilename(conflictCopyFilename),
      findLocalNoteById(noteId),
    ]);
    if (!conflictCopy || !canonical) {
      throw new Error('未找到冲突副本或原始笔记');
    }

    const resolution = buildKeepLocalResyncPayload({
      noteId,
      canonical,
      conflictCopy,
      remoteRevision: remoteBaseRevision,
    });

    await updateLocalNoteById(noteId, (current) => ({
      ...current,
      content: resolution.updatedNote.content,
      title: resolution.updatedNote.title,
      tags: [...resolution.updatedNote.tags],
      revision: current.revision + 1,
      updated_at: Math.floor(Date.now() / 1000),
    }));

    const queued = await enqueueRemoteNoteChange(resolution);
    if (queued) {
      requestSyncNow();
    }
    await fetchNotes();
    await dismissConflict(id);
    return;
  }

  throw new Error('当前冲突不支持“保留本地并重试”');
}

export async function recreateFromRemoteConflict(id: number) {
  const conflict = await getConflict(id);
  if (!conflict) return;
  if (conflict.reason !== 'local_note_not_found') {
    throw new Error('当前冲突不支持按远端重建');
  }

  const existing = await findLocalNoteById(conflict.note_id);
  if (!existing) {
    await createLocalNoteFromSync(buildRemoteRecreationInput(conflict));
  }

  await fetchNotes();
  await dismissConflict(id);
}

export async function acceptRemoteDeleteConflict(id: number) {
  const conflict = await getConflict(id);
  if (!conflict) return;
  if (!canAcceptRemoteDeleteConflict(conflict)) {
    throw new Error('当前冲突不支持接受远端删除');
  }

  const existing = await findLocalNoteById(conflict.note_id);
  if (existing) {
    await moveLocalNoteToTrashById(conflict.note_id);
  }

  await fetchNotes();
  await dismissConflict(id);
}
