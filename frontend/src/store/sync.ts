import { ref } from 'vue';
import { onSyncStatusChange, flushPendingQueue, type SyncStatus } from '../utils/sync';

export const syncStatus = ref<SyncStatus>('online');
export const pendingCount = ref(0);

export function initSync(onComplete?: () => void) {
  // 监听同步状态
  onSyncStatusChange((status, count) => {
    syncStatus.value = status;
    pendingCount.value = count;
    // 如果重新连线并且所有离线数据同步完成，触发重载
    if (status === 'online' && count === 0 && onComplete) {
      onComplete();
    }
  });

  // 尝试刷新离线队列
  flushPendingQueue().catch(() => {});
}
