import { ref } from 'vue';
import { clearConflict, getConflict, getConflicts } from '../domain/sync/conflictStorage.js';
import { enqueueRemoteNoteChange } from '../domain/sync/noteSyncOutbox.js';
import {
  buildKeepLocalResyncPayload,
  buildRemoteRecreationInput,
  canAcceptRemoteDeleteConflict,
  getConflictCopyFilename,
  getRemoteRevision,
  requireActiveConflictTarget,
} from '../domain/sync/conflictResolution.js';
import {
  createLocalNoteFromSync,
} from '../domain/notes/localNoteCreation.js';
import { updateLocalNoteById } from '../domain/notes/localNoteMutations.js';
import {
  findLocalNoteByFilename,
  findLocalNoteById,
} from '../domain/notes/localNoteQueries.js';
import { fetchNotes } from './notes.js';
import { requestSyncNow } from '../domain/sync/syncCoordinator.js';
import { shouldUseBackendAppStore } from '../domain/runtime/appStoreRuntime.js';
import { acceptRemoteDeleteState, editBackendReplica } from '../domain/appStore/syncReplicaAdapter.js';
import { readSyncConfigSnapshot } from '../domain/sync/syncConfig.js';
import { getOrCreateDeviceId } from '../domain/storage/deviceIdentity.js';
import type { ChangeRecord } from '../domain/sync/mutationLogStorage.js';
import { getSyncTargetId } from '../domain/sync/syncTargetIdentity.js';
import { recordSyncBaseline } from '../domain/sync/syncBaseline.js';
import { acknowledgeChange } from '../domain/sync/syncQueue.js';
import type { PendingChange } from '../domain/sync/syncQueue.js';

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
  const conflict = await getConflict(id);
  const rejected = conflict?.detail.local_change as PendingChange | undefined;
  if (rejected?.operation_id) await acknowledgeChange(rejected);
  await clearConflict(id);
  conflicts.value = conflicts.value.filter((item) => item.id !== id);
}

export async function acceptConflictResult(id: number) {
  await dismissConflict(id);
}

export async function keepLocalAndResync(id: number) {
  const conflict = await getConflict(id);
  if (!conflict) return;
  requireActiveConflictTarget(conflict);

  const conflictCopyFilename = getConflictCopyFilename(conflict);
  const conflictCopyId = typeof conflict.detail.conflict_copy_note_id === 'string' ? conflict.detail.conflict_copy_note_id : '';
  const noteId = conflict.note_id;
  const remoteBaseRevision = getRemoteRevision(conflict.detail);
  const localSnapshot = conflict.detail.local_snapshot as Record<string, unknown> | undefined;
  const localPinned = typeof localSnapshot?.pinned === 'boolean' ? localSnapshot.pinned : undefined;

  if (conflict.reason === 'revision_conflict' && conflictCopyFilename) {
    if (shouldUseBackendAppStore()) {
      const sync = readSyncConfigSnapshot();
      const deviceId = await getOrCreateDeviceId();
      const outbox: ChangeRecord[] = [];
      await editBackendReplica(async (store, active) => {
        outbox.length = 0;
        const canonical = active.get(noteId);
        const matching = [...active.values()].filter(note => note.filename === conflictCopyFilename);
        const conflictCopy = conflictCopyId ? active.get(conflictCopyId) : matching.length === 1 ? matching[0] : undefined;
        if (!canonical || !conflictCopy) throw new Error('未找到冲突副本或原始笔记');
        const resolution = buildKeepLocalResyncPayload({ noteId, canonical, conflictCopy, remoteRevision: remoteBaseRevision, localPinned });
        const updated = await store.updateLocalNoteById(noteId, current => ({ ...current,
          ...resolution.updatedNote, revision: current.revision + 1, updated_at: Math.floor(Date.now() / 1000) }));
        if (sync.mode !== 'local' && updated) outbox.push({ operation_id: `op_${crypto.randomUUID()}`, device_id: deviceId,
          entity_id: noteId, target: sync.mode, target_id: getSyncTargetId(sync) || undefined, type: 'note.update', base_revision: resolution.baseRevision,
          timestamp: new Date().toISOString(), createdAt: Date.now(), payload: { ...resolution.payload, revision: updated.revision } });
      }, { outbox });
      if (outbox.length) requestSyncNow();
      await fetchNotes();
      await dismissConflict(id);
      return;
    }
    const [conflictCopy, canonical] = await Promise.all([
      conflictCopyId ? findLocalNoteById(conflictCopyId) : findLocalNoteByFilename(conflictCopyFilename),
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
      localPinned,
    });

    await updateLocalNoteById(noteId, (current) => ({
      ...current,
      content: resolution.updatedNote.content,
      title: resolution.updatedNote.title,
      tags: [...resolution.updatedNote.tags],
      pinned: resolution.updatedNote.pinned,
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
  requireActiveConflictTarget(conflict);
  if (conflict.reason !== 'local_note_not_found') {
    throw new Error('当前冲突不支持按远端重建');
  }

  if (shouldUseBackendAppStore()) {
    await editBackendReplica(async (store, active) => {
      if (!active.has(conflict.note_id)) await store.applyRemoteActiveState(conflict.note_id, buildRemoteRecreationInput(conflict));
    });
    await fetchNotes();
    await dismissConflict(id);
    return;
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
  requireActiveConflictTarget(conflict);
  if (!canAcceptRemoteDeleteConflict(conflict)) {
    throw new Error('当前冲突不支持接受远端删除');
  }

  const snapshot = conflict.detail.remote_snapshot as Record<string, unknown>;
  const payload = await acceptRemoteDeleteState(conflict.note_id, snapshot);
  const targetId = getSyncTargetId(readSyncConfigSnapshot());
  if (targetId) await recordSyncBaseline(targetId, { entity_id: conflict.note_id,
    type: snapshot.purged ? 'note.purge' : 'note.trash', payload });

  await fetchNotes();
  await dismissConflict(id);
}
