import { ref } from 'vue';
import { onSyncStatusChange, flushPendingQueue, type SyncStatus } from '../utils/sync';

export const syncStatus = ref<SyncStatus>('online');
export const pendingCount = ref(0);
export const syncTarget = ref('本地');
export const syncError = ref('');
export const serverLastSyncAt = ref('');
export const webdavLastSyncAt = ref('');

export function initSync(onComplete?: () => void) {
  onSyncStatusChange((state) => {
    syncStatus.value = state.status;
    pendingCount.value = state.pendingCount;
    syncTarget.value = state.target;
    syncError.value = state.error;
    serverLastSyncAt.value = state.serverLastSyncAt;
    webdavLastSyncAt.value = state.webdavLastSyncAt;
    if (state.status === 'online' && state.pendingCount === 0 && onComplete) {
      onComplete();
    }
  });

  flushPendingQueue().catch(() => {});
}
