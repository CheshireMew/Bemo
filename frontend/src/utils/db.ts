export * from '../domain/notes/notesStorage.js';
export * from '../domain/notes/trashStorage.js';
export * from '../domain/sync/mutationLogStorage.js';
export * from '../domain/sync/syncStateStorage.js';
export * from '../domain/sync/conflictStorage.js';
export * from '../domain/attachments/blobStorage.js';
export * from '../domain/attachments/attachmentRefStorage.js';

import {
  enqueueChange as enqueueMutationChange,
  type ChangeRecord,
  type NoteMutationType,
  type SyncTarget,
} from '../domain/sync/mutationLogStorage.js';
import { getSyncStateValue, setSyncStateValue } from '../domain/sync/syncStateStorage.js';

export function createOfflineNoteId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `local_${Date.now()}_${random}`;
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getSyncStateValue('device_id');
  if (existing) return existing;
  const next = `device_${Math.random().toString(36).slice(2, 12)}`;
  await setSyncStateValue('device_id', next);
  return next;
}

export async function enqueueChange(input: {
  target: SyncTarget;
  entityId: string;
  type: NoteMutationType;
  baseRevision?: number | null;
  payload: Record<string, unknown>;
}): Promise<ChangeRecord> {
  const deviceId = await getOrCreateDeviceId();
  return enqueueMutationChange({
    ...input,
    deviceId,
  });
}
