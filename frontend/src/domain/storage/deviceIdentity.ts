import { getSyncStateValue, setSyncStateValue } from '../sync/syncStateStorage.js';

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
