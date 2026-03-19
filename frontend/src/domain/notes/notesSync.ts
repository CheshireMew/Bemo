import { enqueueChange } from '../sync/mutationLogStorage.js';
import { getOrCreateDeviceId } from '../../utils/db.js';
import { requestSyncNow } from '../../utils/sync.js';
import { settings } from '../../store/settings.js';

type QueuedNoteChangeType = 'note.create' | 'note.update' | 'note.patch' | 'note.delete';

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
