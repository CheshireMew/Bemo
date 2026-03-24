import { getOrCreateDeviceId } from '../storage/deviceIdentity.js';
import {
  enqueueChange,
  type ChangeRecord,
  type NoteMutationType,
  type SyncTarget,
} from './mutationLogStorage.js';

export async function enqueueDeviceChange(input: {
  target: SyncTarget;
  entityId: string;
  type: NoteMutationType;
  baseRevision?: number | null;
  payload: Record<string, unknown>;
}): Promise<ChangeRecord> {
  const deviceId = await getOrCreateDeviceId();
  return enqueueChange({
    ...input,
    deviceId,
  });
}
