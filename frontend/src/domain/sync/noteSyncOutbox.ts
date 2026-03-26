import { listLocalNotes, listLocalTrashNotes } from '../notes/localNoteQueries.js';
import type { SyncTarget } from './mutationLogStorage.js';
import { enqueueDeviceChange } from './mutationLogRuntime.js';
import { readSyncConfigSnapshot } from './syncConfig.js';
import type { SyncRemoteNoteState } from './syncTransport.js';

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
  remoteNotes: ReadonlyMap<string, SyncRemoteNoteState> = new Map(),
  queuedNoteIds: ReadonlySet<string> = new Set(),
): Promise<number> {
  const [notes, trash] = await Promise.all([
    listLocalNotes(),
    listLocalTrashNotes(),
  ]);
  if (!notes.length && !trash.length) return 0;

  const seededNoteIds = new Set<string>(queuedNoteIds);

  for (const note of notes) {
    if (seededNoteIds.has(note.note_id)) continue;
    const remote = remoteNotes.get(note.note_id);
    if (remote && remote.scope === 'active' && remote.revision >= note.revision) continue;
    seededNoteIds.add(note.note_id);

    await enqueueDeviceChange({
      target,
      entityId: note.note_id,
      type: remote
        ? (remote.scope === 'trash' ? 'note.restore' : 'note.update')
        : 'note.create',
      baseRevision: remote ? remote.revision : 0,
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
    if (seededNoteIds.has(note.note_id)) continue;
    const remote = remoteNotes.get(note.note_id);
    if (remote && remote.scope === 'trash' && remote.revision >= note.revision) continue;
    seededNoteIds.add(note.note_id);

    await enqueueDeviceChange({
      target,
      entityId: note.note_id,
      type: 'note.trash',
      baseRevision: remote ? remote.revision : 0,
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

  return Math.max(0, seededNoteIds.size - queuedNoteIds.size);
}
