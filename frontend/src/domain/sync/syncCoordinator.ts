import { addConflict, getConflicts } from './conflictStorage.js';
import {
  claimLegacyMutationTargets,
  type SyncTarget,
} from './mutationLogStorage.js';
import {
  getSyncCursorStateKey,
  getSyncLastSyncStateKey,
  getSyncStateValue,
  setSyncStateValue,
  migrateLegacySyncProgress,
  removeSyncStateValue,
} from './syncStateStorage.js';
import { applyChangesToCurrentStore, markSyncOperationsApplied, reconcileAcceptedSyncRevision } from '../appStore/syncReplicaAdapter.js';
import { getPendingChanges as getMutationLog, acknowledgeChange, bindLegacySyncTarget } from './syncQueue.js';
import {
  initializeSyncState,
  refreshSyncPendingCounts,
  setSyncState,
  setSyncStatus,
  reportSyncError,
  subscribeToSyncState,
  getSyncState,
} from './syncStatusBus.js';
import { prepareOutboundChanges, hydrateInboundAttachments } from './syncAttachmentRuntime.js';
import { handleSyncFailure, handleSyncSuccess, clearScheduledSync } from './syncScheduler.js';
import { buildSyncTransport } from './syncTransportBuilder.js';
import { getSyncTargetLabel, readSyncConfigSnapshot } from './syncConfig.js';
import type { SyncListener, SyncRunResult } from './syncTypes.js';
import { getSyncTargetId, scopedSyncKey } from './syncTargetIdentity.js';
import { noteStateFingerprint, readSyncBaselines, recordSyncBaseline } from './syncBaseline.js';
import { listCurrentNotes, listCurrentTrash } from '../appStore/noteQueries.js';
import { registerSyncWindowEvents as registerSyncBrowserEvents } from './syncWindowEvents.js';
import { consumeRemoteChanges, inspectRemoteSyncState, readWorkspaceDeletedIds } from './syncBootstrap.js';
import { prepareFirstTargetChanges } from './noteSyncOutbox.js';

let flushInFlight: Promise<SyncRunResult> | null = null;
let flushAgainAfterCurrentRun = false;
let syncPaused = 0;

export async function withSyncPaused<T>(run: () => Promise<T>, resume = true): Promise<T> {
  syncPaused++;
  clearScheduledSync();
  let completed = false;
  try {
    if (flushInFlight) await flushInFlight;
    clearScheduledSync();
    const result = await run();
    completed = true;
    return result;
  } finally {
    if (resume || !completed) syncPaused--;
    if (!syncPaused) requestSyncNow();
  }
}

function isBootstrapResumeCursor(cursor: string | null) {
  return typeof cursor === 'string' && cursor.startsWith('snapshot-bootstrap:');
}

export function onSyncStatusChange(fn: SyncListener): () => void {
  void initializeSyncState(getSyncTargetLabel(readSyncConfigSnapshot())).catch(reportSyncError);
  return subscribeToSyncState(fn);
}

export async function flushPendingQueue(): Promise<SyncRunResult> {
  if (syncPaused) return { status: 'skipped', reason: '同步已暂停' };
  if (flushInFlight) {
    flushAgainAfterCurrentRun = true;
    return flushInFlight;
  }

  flushInFlight = (async () => {
    let shouldContinueImmediately = false;
    let result: SyncRunResult = { status: 'skipped', reason: '未启用远端同步' };
    let pulled = 0, pushed = 0, conflictCount = 0;

    do {
      shouldContinueImmediately = false;
      flushAgainAfterCurrentRun = false;

      const syncConfig = readSyncConfigSnapshot();
      const syncMode = syncConfig.mode;
      const queueTarget = syncMode === 'local' ? undefined : syncMode as SyncTarget;
      const targetId = queueTarget ? getSyncTargetId(syncConfig, queueTarget) : null;
      const lastSyncKey = queueTarget ? getSyncLastSyncStateKey(queueTarget, targetId) : '';
      if (queueTarget) {
        await claimLegacyMutationTargets(queueTarget);
      }
      if (queueTarget && targetId) {
        await bindLegacySyncTarget(queueTarget, targetId);
        await migrateLegacySyncProgress(queueTarget, targetId);
      }
      let queue = await getMutationLog(queueTarget, targetId || undefined);
      // Persisted rejections survive an interrupted acknowledgement sequence.
      // Never send the tail of a rejected offline chain on its own after restart.
      if (queueTarget && targetId) {
        const rejected = new Set((await getConflicts()).filter(conflict => conflict.source === queueTarget
          && (!conflict.target_id || conflict.target_id === targetId)).map(conflict => conflict.operation_id));
        for (const change of queue) if (rejected.has(change.operation_id)) await acknowledgeChange(change);
        queue = queue.filter(change => !rejected.has(change.operation_id));
      }
      setSyncState({ target: getSyncTargetLabel(syncConfig) });

      if (syncMode === 'local') {
        setSyncState({
          status: navigator.onLine ? 'online' : 'offline',
          error: '',
        });
        await refreshSyncPendingCounts(queue.length);
        clearScheduledSync();
        return { status: 'skipped' as const, reason: '当前为本地模式，未执行远端同步' };
      }

      const transport = buildSyncTransport(syncConfig);
      if (!transport || !targetId) {
        setSyncState({
          status: 'offline',
          error: '同步配置不完整',
        });
        await refreshSyncPendingCounts(queue.length);
        clearScheduledSync();
        return { status: 'failed' as const, error: '同步配置不完整' };
      }
      const activeTarget = queueTarget as SyncTarget;
      const cursorKey = getSyncCursorStateKey(activeTarget, targetId);

      try {
        const storedCursor = await getSyncStateValue(cursorKey);
        const allPending = await getMutationLog();
        const queuedNoteIds = new Set(allPending.map((item) => item.entity_id).filter(Boolean));
        const remoteSyncState = await inspectRemoteSyncState(
          activeTarget,
          transport,
          queuedNoteIds,
          targetId,
        );
        if (remoteSyncState.seededCount > 0) {
          queue = await getMutationLog(activeTarget, targetId);
        }

        // The hosted server already committed these writes to this very app
        // store. Replaying its own history would manufacture conflicts.
        if (remoteSyncState.isCurrentStore && queue.every(change => change.storage === 'backend')) {
          for (const change of queue) await acknowledgeChange(change);
          const [notes, trash] = await Promise.all([listCurrentNotes(), listCurrentTrash()]);
          for (const [type, records] of [['note.update', notes], ['note.trash', trash]] as const) {
            for (const note of records) await recordSyncBaseline(targetId, {
              entity_id: note.note_id, type, payload: { ...note }, cursor: remoteSyncState.latestCursor,
            });
          }
          for (const note of remoteSyncState.remoteNotes.values()) {
            if (note.scope === 'purged') await recordSyncBaseline(targetId, {
              entity_id: note.note_id, type: 'note.purge', payload: { revision: note.revision }, cursor: remoteSyncState.latestCursor,
            });
          }
          const nowIso = new Date().toISOString();
          await setSyncStateValue(cursorKey, remoteSyncState.latestCursor || '0');
          await setSyncStateValue(lastSyncKey, nowIso);
          setSyncState({ completedRuns: getSyncState().completedRuns + 1, status: 'online', error: '', serverLastSyncAt: nowIso });
          await refreshSyncPendingCounts(0);
          handleSyncSuccess(requestSyncNow);
          return { status: 'completed' as const, targetId, pulled: 0, pushed: queue.length, conflicts: 0 };
        }

        setSyncState({
          status: 'syncing',
          error: '',
        });
        await refreshSyncPendingCounts(queue.length);

        const localOperationIds = new Set(queue.map((item) => item.operation_id));
        const preparedQueue = await prepareFirstTargetChanges(queue, remoteSyncState.remoteNotes, targetId);
        const uploadAndPush = async (writer: typeof transport) => writer.push(await prepareOutboundChanges(preparedQueue, writer));
        const pushResult = transport.runExclusive ? await transport.runExclusive(uploadAndPush) : await uploadAndPush(transport);

        const acknowledgedIds = new Set<string>();
        for (const accepted of (pushResult.accepted || [])) {
          const match = queue.find((item) => item.operation_id === accepted.operation_id);
          if (match) {
            if (!accepted.change) throw new Error('同步目标没有返回已接受操作的正式内容，无法确认同步结果');
            const canonical = { ...accepted.change, cursor: accepted.cursor || accepted.change.cursor };
            await reconcileAcceptedSyncRevision(canonical, match);
            await recordSyncBaseline(targetId, canonical);
            if (canonical.type === 'note.purge') await removeSyncStateValue(scopedSyncKey(targetId, `deleted:${encodeURIComponent(match.entity_id)}`));
            await markSyncOperationsApplied(targetId, [canonical]);
            await acknowledgeChange(match);
            acknowledgedIds.add(match.operation_id); pushed++;
          }
        }

        const rejectedChanges: typeof queue = [];
        for (const conflict of ((pushResult.conflicts || []) as Array<Record<string, unknown> & {
          operation_id?: string;
          note_id?: string;
          reason?: string;
        }>)) {
          const match = queue.find((item) => item.operation_id === conflict.operation_id);
          await addConflict(syncMode as 'server' | 'webdav', {
            note_id: String(conflict.note_id || match?.entity_id || ''),
            operation_id: String(conflict.operation_id || ''),
            reason: String(conflict.reason || 'remote_conflict'),
            target_id: targetId,
            local_snapshot: match?.payload,
            local_change: match,
            ...conflict,
          });
          if (match) { rejectedChanges.push(match); acknowledgedIds.add(match.operation_id); }
          conflictCount++;
        }
        // Record every dependency rejection before removing any source operation.
        for (const change of rejectedChanges) await acknowledgeChange(change);
        if (queue.some(item => !acknowledgedIds.has(item.operation_id))) throw new Error('同步目标未确认全部待发送操作，已保留队列等待重试');

        const shouldBootstrapPull = remoteSyncState.missingLocalNoteIds.length > 0;
        const postPushCursor = shouldBootstrapPull
          ? (isBootstrapResumeCursor(storedCursor) ? storedCursor : null)
          : storedCursor;
        const pullResult = await consumeRemoteChanges(transport, activeTarget, {
          cursorOverride: postPushCursor,
          targetId,
          onBatch: async (changes) => {
            const [active, trash, baselines, pending] = await Promise.all([
              listCurrentNotes(), listCurrentTrash(), readSyncBaselines(targetId), getMutationLog(),
            ]);
            const locals = new Map([...active, ...trash].map(note => [note.note_id, note]));
            const pendingIds = new Set(pending.map(change => change.entity_id));
            const deletedIds = await readWorkspaceDeletedIds(targetId);
            const inboundChanges = (changes || []).filter(change => {
              const baseline = baselines.get(change.entity_id || '');
              return !localOperationIds.has(change.operation_id || '')
                && !deletedIds.has(change.entity_id || '')
                && !(baseline?.cursor && change.cursor && Number(change.cursor) <= Number(baseline.cursor));
            }).map(change => {
              const local = locals.get(change.entity_id || '');
              const baseline = baselines.get(change.entity_id || '');
              return { ...change, preserve_local: Boolean(local && (pendingIds.has(local.note_id)
                || (baseline ? noteStateFingerprint(local) !== noteStateFingerprint(baseline) : change.device_id === 'snapshot'))) };
            });
            if (!inboundChanges.length) return;

            const hydratedChanges = await hydrateInboundAttachments(inboundChanges, transport);
            const localApplyResult = await applyChangesToCurrentStore(hydratedChanges, targetId);
            pulled += localApplyResult.applied.length;

            for (const conflict of (localApplyResult.conflicts || [])) {
              await addConflict(syncMode as 'server' | 'webdav', {
                note_id: String(conflict.note_id || ''),
                operation_id: String(conflict.operation_id || ''),
                reason: String(conflict.reason || 'local_apply_conflict'),
                target_id: targetId,
                ...conflict,
              });
              conflictCount++;
            }
            for (const change of hydratedChanges) await recordSyncBaseline(targetId, change);
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

        const remainingQueue = await getMutationLog(queueTarget, targetId);
        setSyncState({ completedRuns: getSyncState().completedRuns + 1 });
        setSyncStatus('online');
        await refreshSyncPendingCounts(remainingQueue.length);
        shouldContinueImmediately = remainingQueue.length > 0 || flushAgainAfterCurrentRun;
        if (!shouldContinueImmediately) {
          handleSyncSuccess(requestSyncNow);
        }
        result = { status: 'completed', targetId, pulled, pushed, conflicts: conflictCount };
      } catch (error) {
        setSyncState({
          status: 'offline',
          error: error instanceof Error ? error.message : '同步失败',
        });
        reportSyncError(error);
        handleSyncFailure(requestSyncNow, error);
        return { status: 'failed' as const, error: error instanceof Error ? error.message : '同步失败' };
      }
    } while (shouldContinueImmediately && !syncPaused);
    return result;
  })();

  try {
    return await flushInFlight;
  } catch (error) {
    reportSyncError(error);
    handleSyncFailure(requestSyncNow, error);
    return { status: 'failed', error: error instanceof Error ? error.message : '同步失败' };
  } finally {
    flushInFlight = null;
  }
}

export function requestSyncNow(): void {
  if (syncPaused || !navigator.onLine) return;
  clearScheduledSync();
  void flushPendingQueue();
}

export function registerSyncWindowEvents(): void {
  registerSyncBrowserEvents({
    flushPendingQueue,
    requestSyncNow,
  });
}
