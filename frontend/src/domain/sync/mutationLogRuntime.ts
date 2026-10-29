import { getOrCreateDeviceId } from '../storage/deviceIdentity.js';
import { getSyncTargetId } from './syncTargetIdentity.js';
import { readSyncConfigSnapshot } from './syncConfig.js';
import {
  enqueueChange,
  type ChangeRecord,
  type NoteMutationType,
  type SyncTarget,
} from './mutationLogStorage.js';

export async function enqueueDeviceChange(input: {
  target: SyncTarget;
  targetId?: string | null;
  entityId: string;
  type: NoteMutationType;
  baseRevision?: number | null;
  payload: Record<string, unknown>;
}): Promise<ChangeRecord> {
  const deviceId = await getOrCreateDeviceId();
  return enqueueChange({
    ...input,
    targetId: input.targetId === undefined ? getSyncTargetId(readSyncConfigSnapshot(), input.target) : input.targetId,
    deviceId,
  });
}
