import { claimLegacyMutationTargets, getMutationLog, getPendingCountsByTarget } from './mutationLogStorage.js';
import { getSyncLastSyncStateKey, getSyncStateValue } from './syncStateStorage.js';
import type { SyncListener, SyncState, SyncStatus } from './syncTypes.js';
import { readSyncConfigSnapshot } from './syncConfig.js';

let listeners: SyncListener[] = [];
let currentState: SyncState = {
  status: typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline',
  pendingCount: 0,
  serverPendingCount: 0,
  webdavPendingCount: 0,
  target: '本地',
  error: '',
  serverLastSyncAt: '',
  webdavLastSyncAt: '',
};

export function getSyncState(): SyncState {
  return { ...currentState };
}

export function setSyncState(next: Partial<SyncState>) {
  currentState = { ...currentState, ...next };
}

export function setSyncStatus(status: SyncStatus) {
  currentState = { ...currentState, status };
}

export function notifySyncListeners(pendingCount = currentState.pendingCount) {
  currentState = { ...currentState, pendingCount };
  const snapshot = getSyncState();
  listeners.forEach((fn) => fn(snapshot));
}

export async function refreshSyncPendingCounts(currentPendingCount = currentState.pendingCount) {
  const syncConfig = readSyncConfigSnapshot();
  if (syncConfig.mode === 'server' || syncConfig.mode === 'webdav') {
    await claimLegacyMutationTargets(syncConfig.mode);
  }
  const pendingCounts = await getPendingCountsByTarget();
  currentState = {
    ...currentState,
    pendingCount: currentPendingCount,
    serverPendingCount: pendingCounts.server,
    webdavPendingCount: pendingCounts.webdav,
  };
  notifySyncListeners(currentPendingCount);
}

export async function initializeSyncState(target: string) {
  const syncConfig = readSyncConfigSnapshot();
  if (syncConfig.mode === 'server' || syncConfig.mode === 'webdav') {
    await claimLegacyMutationTargets(syncConfig.mode);
  }
  const [queue, pendingCounts, serverLastSyncAt, webdavLastSyncAt] = await Promise.all([
    getMutationLog(),
    getPendingCountsByTarget(),
    getSyncStateValue(getSyncLastSyncStateKey('server')),
    getSyncStateValue(getSyncLastSyncStateKey('webdav')),
  ]);

  currentState = {
    ...currentState,
    target,
    pendingCount: queue.length,
    serverPendingCount: pendingCounts.server,
    webdavPendingCount: pendingCounts.webdav,
    serverLastSyncAt: serverLastSyncAt || '',
    webdavLastSyncAt: webdavLastSyncAt || '',
  };
  notifySyncListeners(queue.length);
}

export function subscribeToSyncState(fn: SyncListener): () => void {
  listeners.push(fn);
  fn(getSyncState());
  return () => {
    listeners = listeners.filter((item) => item !== fn);
  };
}
