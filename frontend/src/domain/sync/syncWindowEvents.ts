import type { ChangeRecord, SyncTarget } from './mutationLogStorage.js';
import { getMutationLog } from './mutationLogStorage.js';
import { getSyncMode, getSyncTargetLabel } from './syncTransportBuilder.js';
import { refreshSyncPendingCounts, setSyncState } from './syncStatusBus.js';
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
    setSyncState({
      status: 'online',
      target: getSyncTargetLabel(),
    });
    resetRetryDelay();
    scheduleNextSync(input.requestSyncNow);
    void refreshSyncPendingCounts(0).then(() => input.flushPendingQueue());
  });

  window.addEventListener('offline', () => {
    setSyncState({
      status: 'offline',
      target: getSyncTargetLabel(),
    });
    clearScheduledSync();
    const syncMode = getSyncMode();
    const queueTarget = syncMode === 'local' ? undefined : syncMode as SyncTarget;
    void getMutationLog(queueTarget).then((queue: ChangeRecord[]) => refreshSyncPendingCounts(queue.length));
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
