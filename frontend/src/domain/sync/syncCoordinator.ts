import { getOrCreateDeviceId } from '../../utils/db.js';
import { addConflict } from './conflictStorage.js';
import {
  claimLegacyMutationTargets,
  getMutationLog,
  removeMutation,
  type SyncTarget,
} from './mutationLogStorage.js';
import { getSyncStateValue, setSyncStateValue } from './syncStateStorage.js';
import { applyChangesLocally } from './localSyncApply.js';
import {
  initializeSyncState,
  refreshSyncPendingCounts,
  setSyncState,
  setSyncStatus,
  subscribeToSyncState,
} from './syncStatusBus.js';
import { prepareOutboundChanges, hydrateInboundAttachments } from './syncAttachmentRuntime.js';
import { handleSyncFailure, handleSyncSuccess, clearScheduledSync } from './syncScheduler.js';
import { buildSyncTransport, getSyncMode, getSyncTargetLabel } from './syncTransportBuilder.js';
import type { SyncListener } from './syncTypes.js';
import { registerSyncWindowEvents as registerSyncBrowserEvents } from './syncWindowEvents.js';

let flushInFlight: Promise<void> | null = null;

export function onSyncStatusChange(fn: SyncListener): () => void {
  void initializeSyncState(getSyncTargetLabel());
  return subscribeToSyncState(fn);
}

export async function flushPendingQueue(): Promise<void> {
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    const syncMode = getSyncMode();
    const queueTarget = syncMode === 'local' ? undefined : syncMode as SyncTarget;
    if (queueTarget) {
      await claimLegacyMutationTargets(queueTarget);
    }
    const queue = await getMutationLog(queueTarget);
    setSyncState({ target: getSyncTargetLabel() });

    if (syncMode === 'local') {
      setSyncState({
        status: navigator.onLine ? 'online' : 'offline',
        error: '',
      });
      await refreshSyncPendingCounts(queue.length);
      clearScheduledSync();
      return;
    }

    const transport = buildSyncTransport();
    if (!transport) {
      setSyncState({
        status: 'offline',
        error: '同步配置不完整',
      });
      await refreshSyncPendingCounts(queue.length);
      clearScheduledSync();
      return;
    }

    setSyncState({
      status: 'syncing',
      error: '',
    });
    await refreshSyncPendingCounts(queue.length);

    try {
      const localOperationIds = new Set(queue.map((item) => item.operation_id));
      const outboundChanges = await prepareOutboundChanges(queue, transport);
      const pushResult = await transport.push(outboundChanges);

      for (const accepted of ((pushResult.accepted || []) as Array<{ operation_id: string }>)) {
        const match = queue.find((item) => item.operation_id === accepted.operation_id);
        if (match?.id) {
          await removeMutation(match.id);
        }
      }

      for (const conflict of ((pushResult.conflicts || []) as Array<Record<string, unknown> & {
        operation_id?: string;
        note_id?: string;
        reason?: string;
      }>)) {
        const match = queue.find((item) => item.operation_id === conflict.operation_id);
        if (match?.id) {
          await removeMutation(match.id);
        }
        await addConflict(syncMode as 'server' | 'webdav', {
          note_id: String(conflict.note_id || match?.entity_id || ''),
          operation_id: String(conflict.operation_id || ''),
          reason: String(conflict.reason || 'remote_conflict'),
          ...conflict,
        });
      }

      const cursorKey = syncMode === 'server' ? 'server_cursor' : 'webdav_cursor';
      const previousCursor = await getSyncStateValue(cursorKey);
      const pullResult = await transport.pull(previousCursor);
      const deviceId = await getOrCreateDeviceId();
      const inboundChanges = (pullResult.changes || []).filter((change: any) => {
        if (localOperationIds.has(change.operation_id)) return false;
        return change.device_id !== deviceId;
      });

      await hydrateInboundAttachments(inboundChanges, transport);
      const localApplyResult = await applyChangesLocally(inboundChanges);

      for (const conflict of (localApplyResult.conflicts || [])) {
        await addConflict(syncMode as 'server' | 'webdav', {
          note_id: String(conflict.note_id || ''),
          operation_id: String(conflict.operation_id || ''),
          reason: String(conflict.reason || 'local_apply_conflict'),
          ...conflict,
        });
      }

      if (pullResult.latest_cursor) {
        await setSyncStateValue(cursorKey, String(pullResult.latest_cursor));
      }

      const nowIso = new Date().toISOString();
      if (syncMode === 'server') {
        await setSyncStateValue('server_last_sync_at', nowIso);
        setSyncState({ serverLastSyncAt: nowIso });
      } else {
        await setSyncStateValue('webdav_last_sync_at', nowIso);
        setSyncState({ webdavLastSyncAt: nowIso });
      }

      setSyncStatus('online');
      await refreshSyncPendingCounts((await getMutationLog(queueTarget)).length);
      handleSyncSuccess(requestSyncNow);
    } catch (error) {
      setSyncState({
        status: 'offline',
        error: error instanceof Error ? error.message : '同步失败',
      });
      await refreshSyncPendingCounts((await getMutationLog(queueTarget)).length);
      handleSyncFailure(requestSyncNow);
    }
  })();

  try {
    await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}

export function isOnline(): boolean {
  return navigator.onLine;
}

export function requestSyncNow(): void {
  if (!navigator.onLine) return;
  clearScheduledSync();
  void flushPendingQueue();
}

export function registerSyncWindowEvents(): void {
  registerSyncBrowserEvents({
    flushPendingQueue,
    requestSyncNow,
  });
}
