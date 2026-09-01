import { ref } from 'vue';
import {
  flushPendingQueue,
  onSyncStatusChange,
  registerSyncWindowEvents,
} from '../domain/sync/syncCoordinator.js';
import type { SyncState, SyncStatus } from '../domain/sync/syncTypes.js';

export const syncStatus = ref<SyncStatus>('online');
export const pendingCount = ref(0);
export const serverPendingCount = ref(0);
export const webdavPendingCount = ref(0);
export const syncTarget = ref('本地');
export const syncError = ref('');
export const serverLastSyncAt = ref('');
export const webdavLastSyncAt = ref('');

export function initSync(onComplete?: () => void) {
  registerSyncWindowEvents();
  let previous: SyncState | null = null;
  const unsubscribe = onSyncStatusChange((state) => {
    syncStatus.value = state.status;
    pendingCount.value = state.pendingCount;
    serverPendingCount.value = state.serverPendingCount;
    webdavPendingCount.value = state.webdavPendingCount;
    syncTarget.value = state.target;
    syncError.value = state.error;
    serverLastSyncAt.value = state.serverLastSyncAt;
    webdavLastSyncAt.value = state.webdavLastSyncAt;
    const completed = previous?.status === 'syncing' && state.status === 'online';
    previous = state;
    if (completed) onComplete?.();
  });

  flushPendingQueue().catch(() => {});
  return unsubscribe;
}
