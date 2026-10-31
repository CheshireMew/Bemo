import { getOrCreateDeviceId } from '../storage/deviceIdentity.js';
import { readSyncConfigSnapshot } from './syncConfig.js';
import { getSyncTargetId } from './syncTargetIdentity.js';

export async function getSyncContextHeaders(): Promise<Record<string, string>> {
  const sync = readSyncConfigSnapshot();
  return sync.mode === 'local' ? {} : { 'X-Bemo-Sync-Context': JSON.stringify({
    target: sync.mode, target_id: getSyncTargetId(sync), device_id: await getOrCreateDeviceId(),
  }) };
}
