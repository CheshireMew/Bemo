import { getOrCreateDeviceId } from '../storage/deviceIdentity.js';
import { addConflict } from './conflictStorage.js';
import {
  claimLegacyMutationTargets,
  getMutationLog,
  removeMutation,
  type SyncTarget,
} from './mutationLogStorage.js';
import {
  getSyncCursorStateKey,
  getSyncLastSyncStateKey,
  getSyncStateValue,
  setSyncStateValue,
} from './syncStateStorage.js';
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
import { buildSyncTransport } from './syncTransportBuilder.js';
import { getSyncTargetLabel, readSyncConfigSnapshot } from './syncConfig.js';
import type { SyncListener } from './syncTypes.js';
import { registerSyncWindowEvents as registerSyncBrowserEvents } from './syncWindowEvents.js';
import { consumeRemoteChanges, inspectRemoteSyncState } from './syncBootstrap.js';

let flushInFlight: Promise<void> | null = null;
let flushAgainAfterCurrentRun = false;

function isBootstrapResumeCursor(cursor: string | null) {
  return typeof cursor === 'string' && cursor.startsWith('snapshot-bootstrap:');
}

export function onSyncStatusChange(fn: SyncListener): () => void {
  void initializeSyncState(getSyncTargetLabel(readSyncConfigSnapshot()));
  return subscribeToSyncState(fn);
}

export async function flushPendingQueue(): Promise<void> {
  if (flushInFlight) {
    flushAgainAfterCurrentRun = true;
    return flushInFlight;
  }

  flushInFlight = (async () => {
    let shouldContinueImmediately = false;

    do {
      shouldContinueImmediately = false;
      flushAgainAfterCurrentRun = false;

      const syncConfig = readSyncConfigSnapshot();
      const syncMode = syncConfig.mode;
      const queueTarget = syncMode === 'local' ? undefined : syncMode as SyncTarget;
      const lastSyncKey = queueTarget ? getSyncLastSyncStateKey(queueTarget) : '';
      if (queueTarget) {
        await claimLegacyMutationTargets(queueTarget);
      }
      let queue = await getMutationLog(queueTarget);
      setSyncState({ target: getSyncTargetLabel(syncConfig) });

      if (syncMode === 'local') {
        setSyncState({
          status: navigator.onLine ? 'online' : 'offline',
          error: '',
        });
        await refreshSyncPendingCounts(queue.length);
        clearScheduledSync();
        return;
      }

      const transport = buildSyncTransport(syncConfig);
      if (!transport) {
        setSyncState({
          status: 'offline',
          error: '同步配置不完整',
        });
        await refreshSyncPendingCounts(queue.length);
        clearScheduledSync();
        return;
      }
      const activeTarget = queueTarget as SyncTarget;
      const cursorKey = getSyncCursorStateKey(activeTarget);

      try {
        const storedCursor = await getSyncStateValue(cursorKey);
        const queuedNoteIds = new Set(queue.map((item) => item.entity_id).filter(Boolean));
        const remoteSyncState = await inspectRemoteSyncState(
          activeTarget,
          transport,
          queuedNoteIds,
        );
        if (remoteSyncState.seededCount > 0) {
          queue = await getMutationLog(activeTarget);
        }

        setSyncState({
          status: queue.length > 0 ? 'syncing' : 'online',
          error: '',
        });
        await refreshSyncPendingCounts(queue.length);

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

        const shouldBootstrapPull = remoteSyncState.missingLocalNoteIds.length > 0;
        const postPushCursor = shouldBootstrapPull
          ? (isBootstrapResumeCursor(storedCursor) ? storedCursor : null)
          : String(pushResult.latest_cursor || await getSyncStateValue(cursorKey) || '').trim() || null;
        const deviceId = await getOrCreateDeviceId();
        const pullResult = await consumeRemoteChanges(transport, activeTarget, {
          cursorOverride: postPushCursor ?? undefined,
          onBatch: async (changes) => {
            const inboundChanges = (changes || []).filter((change: any) => {
              if (localOperationIds.has(change.operation_id)) return false;
              return change.device_id !== deviceId;
            });
            if (!inboundChanges.length) return;

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
          },
        });

        if (pullResult.latest_cursor) {
          await setSyncStateValue(cursorKey, String(pullResult.latest_cursor));
        }

        const nowIso = new Date().toISOString();
        if (syncMode === 'server') {
          await setSyncStateValue(lastSyncKey, nowIso);
          setSyncState({ serverLastSyncAt: nowIso });
        } else {
          await setSyncStateValue(lastSyncKey, nowIso);
          setSyncState({ webdavLastSyncAt: nowIso });
        }

        const remainingQueue = await getMutationLog(queueTarget);
        setSyncStatus('online');
        await refreshSyncPendingCounts(remainingQueue.length);
        shouldContinueImmediately = remainingQueue.length > 0 || flushAgainAfterCurrentRun;
        if (!shouldContinueImmediately) {
          handleSyncSuccess(requestSyncNow);
        }
      } catch (error) {
        setSyncState({
          status: 'offline',
          error: error instanceof Error ? error.message : '同步失败',
        });
        await refreshSyncPendingCounts((await getMutationLog(queueTarget)).length);
        handleSyncFailure(requestSyncNow, error);
        return;
      }
    } while (shouldContinueImmediately);
  })();

  try {
    await flushInFlight;
  } finally {
    flushInFlight = null;
  }
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
