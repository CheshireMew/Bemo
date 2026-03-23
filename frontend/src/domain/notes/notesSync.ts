import { enqueueChange } from '../sync/mutationLogStorage.js';
import { getOrCreateDeviceId } from '../../utils/db.js';
import { requestSyncNow } from '../../utils/sync.js';
import { settings } from '../../store/settings.js';
import { listLocalNotes, listLocalTrashNotes } from './localNotesRepository.js';
import type { SyncTarget } from '../sync/mutationLogStorage.js';

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
}): Promise<void> {
  if (settings.sync.mode === 'local') return;

  const deviceId = await getOrCreateDeviceId();
  await enqueueChange({
    target: settings.sync.mode,
    deviceId,
    entityId: input.entityId,
    type: input.type,
    baseRevision: input.baseRevision,
    payload: input.payload,
  });
  requestSyncNow();
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

  const deviceId = await getOrCreateDeviceId();
  const queuedNoteIds = new Set<string>();

  for (const note of notes) {
    if (queuedNoteIds.has(note.note_id) || existingNoteIds.has(note.note_id)) continue;
    queuedNoteIds.add(note.note_id);

    await enqueueChange({
      target,
      deviceId,
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

    await enqueueChange({
      target,
      deviceId,
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
