import type { ChangeRecord, SyncTarget } from './mutationLogStorage.js';
import { getPendingChanges as getMutationLog } from './syncQueue.js';
import { getSyncTargetLabel, readSyncConfigSnapshot } from './syncConfig.js';
import { refreshSyncPendingCounts, setSyncState, reportSyncError } from './syncStatusBus.js';
import {
  clearScheduledSync,
  maybeSyncOnForeground,
  resetRetryDelay,
  scheduleNextSync,
  shouldPauseBackgroundSync,
} from './syncScheduler.js';

let hasRegisteredWindowEvents = false;

export function registerSyncWindowEvents(input: {
  flushPendingQueue: () => Promise<void>;
  requestSyncNow: () => void;
}) {
  if (hasRegisteredWindowEvents || typeof window === 'undefined') return;
  hasRegisteredWindowEvents = true;

  window.addEventListener('online', () => {
    const syncConfig = readSyncConfigSnapshot();
    setSyncState({
      status: 'online',
      target: getSyncTargetLabel(syncConfig),
    });
    resetRetryDelay();
    scheduleNextSync(input.requestSyncNow);
    void refreshSyncPendingCounts(0).then(() => input.flushPendingQueue()).catch(reportSyncError);
  });

  window.addEventListener('offline', () => {
    const syncConfig = readSyncConfigSnapshot();
    setSyncState({
      status: 'offline',
      target: getSyncTargetLabel(syncConfig),
    });
    clearScheduledSync();
    const syncMode = syncConfig.mode;
    const queueTarget = syncMode === 'local' ? undefined : syncMode as SyncTarget;
    void getMutationLog(queueTarget).then((queue: ChangeRecord[]) => refreshSyncPendingCounts(queue.length)).catch(reportSyncError);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      maybeSyncOnForeground(input.requestSyncNow);
      return;
    }
    clearScheduledSync();
  });

  window.addEventListener('focus', () => {
    maybeSyncOnForeground(input.requestSyncNow);
  });

  window.addEventListener('pageshow', () => {
    maybeSyncOnForeground(input.requestSyncNow);
  });

  if (navigator.onLine && !shouldPauseBackgroundSync()) {
    scheduleNextSync(input.requestSyncNow);
  }
}
