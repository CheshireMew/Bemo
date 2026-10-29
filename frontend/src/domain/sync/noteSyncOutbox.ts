import { listCurrentNotes as listLocalNotes, listCurrentTrash as listLocalTrashNotes } from '../appStore/noteQueries.js';
import type { ChangeRecord, SyncTarget } from './mutationLogStorage.js';
import { enqueueDeviceChange } from './mutationLogRuntime.js';
import { readSyncConfigSnapshot } from './syncConfig.js';
import type { SyncRemoteNoteState } from './syncTransport.js';
import { noteStateFingerprint, readSyncBaselines } from './syncBaseline.js';

type QueuedNoteChangeType =
  | 'note.create'
  | 'note.update'
  | 'note.patch'
  | 'note.trash'
  | 'note.restore'
  | 'note.purge';

export async function prepareFirstTargetChanges(queue: ChangeRecord[], remoteNotes: ReadonlyMap<string, SyncRemoteNoteState>, targetId: string) {
  const baselines = await readSyncBaselines(targetId);
  const [active, trash] = await Promise.all([listLocalNotes(), listLocalTrashNotes()]);
  const local = new Map([...active, ...trash].map(note => [note.note_id, note]));
  const seen = new Set<string>();
  return queue.map(change => {
    const first = !seen.has(change.entity_id);
    seen.add(change.entity_id);
    if (!first || remoteNotes.has(change.entity_id) || baselines.has(change.entity_id)
      || !['note.update', 'note.patch', 'note.restore'].includes(change.type)) return change;
    const note = local.get(change.entity_id);
    if (!note) return change;
    // An explicit edit at a new destination must establish that note before later edits.
    return { ...change, type: 'note.create' as const, base_revision: 0, payload: {
      filename: note.filename, content: note.content, tags: note.tags, pinned: note.pinned,
      created_at: new Date(note.created_at * 1000).toISOString(), ...change.payload,
      revision: Number(change.payload.revision) || (change.base_revision ?? 0) + 1,
    } };
  });
}

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
  targetId?: string,
): Promise<number> {
  const [notes, trash] = await Promise.all([
    listLocalNotes(),
    listLocalTrashNotes(),
  ]);
  const seededNoteIds = new Set<string>(queuedNoteIds);
  const baselines = targetId ? await readSyncBaselines(targetId) : new Map();

  for (const note of notes) {
    if (seededNoteIds.has(note.note_id)) continue;
    const remote = remoteNotes.get(note.note_id);
    const baseline = baselines.get(note.note_id);
    if (baseline?.scope === 'purged') continue;
    if (baseline && baseline.scope === 'active' && noteStateFingerprint(baseline) === noteStateFingerprint(note)) continue;
    if (!baseline && remote) continue;
    seededNoteIds.add(note.note_id);

    await enqueueDeviceChange({
      target,
      targetId,
      entityId: note.note_id,
      type: baseline
        ? (baseline.scope === 'trash' ? 'note.restore' : 'note.update')
        : 'note.create',
      baseRevision: baseline ? baseline.revision : 0,
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
    const baseline = baselines.get(note.note_id);
    if (baseline?.scope === 'purged') continue;
    if (baseline && baseline.scope === 'trash' && noteStateFingerprint(baseline) === noteStateFingerprint(note)) continue;
    if (!baseline && remote) continue;
    seededNoteIds.add(note.note_id);

    await enqueueDeviceChange({
      target,
      targetId,
      entityId: note.note_id,
      type: 'note.trash',
      baseRevision: baseline ? baseline.revision : 0,
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

  const localIds = new Set([...notes, ...trash].map(note => note.note_id));
  for (const baseline of baselines.values()) {
    if (baseline.scope === 'purged' || localIds.has(baseline.note_id) || seededNoteIds.has(baseline.note_id)) continue;
    // A local deletion while sync was disabled still uses its last synchronized base.
    seededNoteIds.add(baseline.note_id);
    await enqueueDeviceChange({ target, targetId, entityId: baseline.note_id, type: 'note.purge',
      baseRevision: baseline.revision, payload: { revision: baseline.revision + 1 } });
  }

  return Math.max(0, seededNoteIds.size - queuedNoteIds.size);
}
