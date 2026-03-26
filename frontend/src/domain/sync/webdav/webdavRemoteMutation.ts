import type { SyncChange, SyncPushAcceptedChange } from '../syncTransport.js';
import { applyChangesToRemoteNoteStates, applyChangesToSnapshotState } from './webdavSnapshotState.js';
import {
  buildPendingWriteRecord,
  normalizeWebDavBatchIndex,
  normalizeWebDavManifest,
  type PlannedWebDavSnapshotWrite,
  retainAcceptedOperationsForBatches,
  WEBDAV_BATCH_RETENTION_LIMIT,
  retainRecentIndexedBatches,
  retainRecentManifestBatches,
  toCursorNumber,
} from './webdavRemoteContract.js';
import {
  buildSnapshotStateFromRemote,
  planBatchWrite,
  planWebDavSnapshotWrite,
  writeBatch,
  writePlannedWebDavSnapshot,
} from './webdavRemoteSnapshot.js';
import {
  cleanupPrunedWebDavFiles,
  commitPendingWebDavWrite,
  deleteWebDavPendingWrite,
  readResolvedRemoteStateDocuments,
  readWebDavRemoteNoteStates,
  readWebDavRemoteState,
  writeWebDavPendingWrite,
  writeWebDavRemoteNoteIndex,
} from './webdavRemoteState.js';

function splitAcceptedChanges(
  batchIndex: { accepted_operations: Record<string, string> },
  changes: SyncChange[],
) {
  const accepted = [];
  const pending = [];
  for (const change of changes) {
    const operationId = String(change.operation_id || '');
    if (!operationId) {
      pending.push(change);
      continue;
    }
    const matchedCursor = batchIndex.accepted_operations[operationId] || null;
    if (matchedCursor) {
      accepted.push({
        operation_id: operationId,
        cursor: matchedCursor,
        change,
        deduplicated: true,
      });
      continue;
    }
    pending.push(change);
  }
  return { accepted, pending };
}

export async function pushWebDavBatch(
  baseUrl: string,
  headers: HeadersInit,
  changes: SyncChange[],
) {
  const currentState = await readResolvedRemoteStateDocuments(baseUrl, headers);
  const manifest = currentState.manifest;
  const batchIndex = currentState.batchIndex;
  const { accepted: deduplicatedAccepted, pending } = splitAcceptedChanges(batchIndex, changes);
  if (!pending.length) {
    return {
      accepted: deduplicatedAccepted,
      latestCursor: manifest.latest_cursor,
      manifest,
      batchIndex,
    };
  }

  const startingCursor = Math.max(
    toCursorNumber(manifest.latest_cursor),
    toCursorNumber(batchIndex.latest_cursor),
  );
  const plannedBatch = planBatchWrite(startingCursor, pending);
  const { indexedBatch, changes: writtenChanges } = plannedBatch;
  const latestCursor = indexedBatch.latest_cursor;
  const previousRemoteNotes = await readWebDavRemoteNoteStates(baseUrl, headers, manifest);
  const nextRemoteNotes = applyChangesToRemoteNoteStates(previousRemoteNotes, writtenChanges);
  const shouldRollSnapshot = !manifest.latest_snapshot || batchIndex.batches.length >= WEBDAV_BATCH_RETENTION_LIMIT;
  const retainedBatches = shouldRollSnapshot
    ? [indexedBatch]
    : retainRecentIndexedBatches([...batchIndex.batches, indexedBatch]);
  let latestSnapshot = manifest.latest_snapshot;
  let snapshotCursor = manifest.snapshot_cursor;
  let plannedSnapshot: PlannedWebDavSnapshotWrite | null = null;

  if (shouldRollSnapshot) {
    const previousNotes = await buildSnapshotStateFromRemote(baseUrl, headers, manifest);
    const nextNotes = applyChangesToSnapshotState(previousNotes, writtenChanges);
    plannedSnapshot = planWebDavSnapshotWrite(baseUrl, latestCursor, nextNotes);
    latestSnapshot = plannedSnapshot.snapshotName;
    snapshotCursor = latestCursor;
  }

  const acceptedOperations = {
    ...batchIndex.accepted_operations,
    ...Object.fromEntries(
      writtenChanges
        .map((change) => [String(change.operation_id || ''), change.cursor] as const)
        .filter(([operationId]) => Boolean(operationId)),
    ),
  };
  const nextBatchIndex = normalizeWebDavBatchIndex({
    ...batchIndex,
    latest_cursor: latestCursor,
    snapshot_cursor: snapshotCursor,
    latest_snapshot: latestSnapshot,
    batches: retainedBatches,
    accepted_operations: retainAcceptedOperationsForBatches(acceptedOperations, retainedBatches),
    updated_at: new Date().toISOString(),
  });
  const nextManifest = normalizeWebDavManifest({
    ...manifest,
    latest_cursor: latestCursor,
    snapshot_cursor: snapshotCursor,
    latest_snapshot: latestSnapshot,
    batches: retainRecentManifestBatches(nextBatchIndex.batches),
    updated_at: new Date().toISOString(),
  });
  const pendingWrite = buildPendingWriteRecord({
    previousManifest: manifest,
    previousBatchIndex: batchIndex,
    nextManifest,
    nextBatchIndex,
    stagedFiles: {
      batchFiles: [plannedBatch.file],
      snapshotFiles: plannedSnapshot?.files || [],
    },
  });
  await writeWebDavPendingWrite(baseUrl, headers, pendingWrite);
  await writeBatch(baseUrl, headers, plannedBatch);
  if (plannedSnapshot) {
    await writePlannedWebDavSnapshot(headers, plannedSnapshot);
  }
  await commitPendingWebDavWrite(baseUrl, headers, pendingWrite, {
    manifestEtag: currentState.manifestEtag,
    batchIndexEtag: currentState.batchIndexEtag,
  });
  try {
    await writeWebDavRemoteNoteIndex(baseUrl, headers, nextRemoteNotes, latestCursor);
  } catch {
    // notes-index is a cache and can be rebuilt from snapshot/batches later
  }
  await cleanupPrunedWebDavFiles(baseUrl, headers, manifest, batchIndex, nextManifest, nextBatchIndex);
  await deleteWebDavPendingWrite(baseUrl, headers);

  return {
    accepted: [
      ...deduplicatedAccepted,
      ...writtenChanges.map((change) => ({
        operation_id: String(change.operation_id || ''),
        cursor: change.cursor,
        change,
      })),
    ],
    latestCursor,
    manifest: nextManifest,
    batchIndex: nextBatchIndex,
  };
}

export async function verifyWebDavPushResult(
  baseUrl: string,
  headers: HeadersInit,
  accepted: SyncPushAcceptedChange[],
  expectedLatestCursor: string,
) {
  const remoteState = await readWebDavRemoteState(baseUrl, headers);
  if (toCursorNumber(remoteState.batchIndex.latest_cursor) < toCursorNumber(expectedLatestCursor)) {
    throw new Error('WebDAV 远端游标未按预期推进，可能被并发写入覆盖');
  }
  const mismatchedOperations = accepted.filter((change) => {
    if (!change.operation_id || !change.cursor) return false;
    return remoteState.batchIndex.accepted_operations[change.operation_id] !== String(change.cursor);
  });
  if (mismatchedOperations.length > 0) {
    throw new Error('WebDAV 检测到并发写入冲突，当前推送结果未稳定落到远端');
  }
  return remoteState;
}
