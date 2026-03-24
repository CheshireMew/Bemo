import { listLocalNotes, listLocalTrashNotes } from '../notes/localNoteQueries.js';
import type { SyncTarget } from './mutationLogStorage.js';
import { enqueueDeviceChange } from './mutationLogRuntime.js';
import { readSyncConfigSnapshot } from './syncConfig.js';

type QueuedNoteChangeType =
  | 'note.create'
  | 'note.update'
  | 'note.patch'
  | 'note.trash'
  | 'note.restore'
  | 'note.purge';

export async function enqueueRemoteNoteChange(input: {
  entityId: string;
  type: QueuedNoteChangeType;
  baseRevision: number;
  payload: Record<string, unknown>;
}): Promise<boolean> {
  const syncConfig = readSyncConfigSnapshot();
  if (syncConfig.mode === 'local') return false;
  await enqueueDeviceChange({
    target: syncConfig.mode,
    entityId: input.entityId,
    type: input.type,
    baseRevision: input.baseRevision,
    payload: input.payload,
  });

  return true;
}

export async function enqueueExistingLocalNotesForSync(
  target: SyncTarget,
  existingNoteIds: ReadonlySet<string> = new Set(),
): Promise<number> {
  const [notes, trash] = await Promise.all([
    listLocalNotes(),
    listLocalTrashNotes(),
  ]);
  if (!notes.length && !trash.length) return 0;

  const queuedNoteIds = new Set<string>();

  for (const note of notes) {
    if (queuedNoteIds.has(note.note_id) || existingNoteIds.has(note.note_id)) continue;
    queuedNoteIds.add(note.note_id);

    await enqueueDeviceChange({
      target,
      entityId: note.note_id,
      type: 'note.create',
      baseRevision: 0,
      payload: {
        filename: note.filename,
        content: note.content,
        tags: note.tags,
        pinned: note.pinned,
        created_at: new Date(note.created_at * 1000).toISOString(),
        revision: note.revision,
      },
    });
  }

  for (const note of trash) {
    if (queuedNoteIds.has(note.note_id) || existingNoteIds.has(note.note_id)) continue;
    queuedNoteIds.add(note.note_id);

    await enqueueDeviceChange({
      target,
      entityId: note.note_id,
      type: 'note.trash',
      baseRevision: note.revision,
      payload: {
        filename: note.filename,
        content: note.content,
        tags: note.tags,
        pinned: note.pinned,
        created_at: new Date(note.created_at * 1000).toISOString(),
        revision: note.revision,
      },
    });
  }

  return queuedNoteIds.size;
}
