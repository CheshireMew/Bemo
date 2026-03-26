import type { ManifestRecord, SnapshotRecord, WebDavBatchChange, WebDavManifestBatchRecord, WebDavSnapshotNote } from './webdavTypes.js';
import { readJson, writeJson } from './webdavRequest.js';
import {
  batchUrl,
  buildBatchId,
  normalizeIndexedBatchRecord,
  normalizeManifestBatchRecord,
  normalizeWebDavManifest,
  snapshotShardUrl,
  snapshotUrl,
  toCursorNumber,
  uniqueOperationIds,
  WEBDAV_REMOTE_FORMAT_VERSION,
  WEBDAV_SNAPSHOT_SHARD_MAX_NOTES,
  WEBDAV_SNAPSHOT_SHARD_TARGET_BYTES,
} from './webdavRemoteContract.js';
import type { PlannedWebDavBatchWrite, PlannedWebDavSnapshotWrite } from './webdavRemoteContract.js';
import {
  applyChangesToRemoteNoteStates,
  applyChangesToSnapshotState,
  buildRemoteNoteStatesFromSnapshot,
} from './webdavSnapshotState.js';
import type { SyncChange, SyncRemoteNoteState } from '../syncTransport.js';

export async function readBatch(baseUrl: string, headers: HeadersInit, batch: WebDavManifestBatchRecord) {
  return readJson<{ changes?: WebDavBatchChange[] } & Record<string, unknown>>(batchUrl(baseUrl, batch.file), headers);
}

export function enrichChangesWithCursor(startingCursor: number, changes: SyncChange[]) {
  return changes.map((change, index) => ({
    ...change,
    cursor: String(startingCursor + index + 1),
  })) as WebDavBatchChange[];
}

export function planBatchWrite(startingCursor: number, changes: SyncChange[]): PlannedWebDavBatchWrite {
  const nextChanges = enrichChangesWithCursor(startingCursor, changes);
  const startCursor = startingCursor + 1;
  const endCursor = startingCursor + nextChanges.length;
  const batchId = buildBatchId(startCursor, endCursor);
  const file = `${batchId}.json`;
  const operationIds = uniqueOperationIds(nextChanges);
  const payload = {
    format_version: WEBDAV_REMOTE_FORMAT_VERSION,
    batch_id: batchId,
    started_after_cursor: String(startingCursor),
    latest_cursor: String(endCursor),
    generated_at: new Date().toISOString(),
    changes: nextChanges,
  };
  const manifestBatch = normalizeManifestBatchRecord({
    batch_id: batchId,
    file,
    started_after_cursor: String(startingCursor),
    latest_cursor: String(endCursor),
    change_count: nextChanges.length,
  });
  return {
    indexedBatch: normalizeIndexedBatchRecord({
      ...manifestBatch,
      operation_ids: operationIds,
    }),
    manifestBatch,
    changes: nextChanges,
    file,
    payload,
  };
}

export async function writeBatch(baseUrl: string, headers: HeadersInit, plannedBatch: PlannedWebDavBatchWrite) {
  await writeJson(batchUrl(baseUrl, plannedBatch.file), headers, plannedBatch.payload);
}

export async function readWebDavSnapshot(
  baseUrl: string,
  headers: HeadersInit,
  manifest: ManifestRecord,
): Promise<(SnapshotRecord & { notes: Record<string, WebDavSnapshotNote> }) | null> {
  if (!manifest.latest_snapshot) return null;
  const snapshot = await readJson<SnapshotRecord>(snapshotUrl(baseUrl, manifest.latest_snapshot), headers);
  if (!snapshot) return null;
  if (!Array.isArray(snapshot.shards) || snapshot.shards.length === 0) {
    return {
      ...snapshot,
      notes: snapshot.notes || {},
    };
  }

  const notes: Record<string, WebDavSnapshotNote> = {};
  for (const shard of snapshot.shards) {
    const payload = await readJson<SnapshotRecord>(snapshotShardUrl(baseUrl, manifest.latest_snapshot, shard.file), headers);
    if (!payload?.notes) continue;
    Object.assign(notes, payload.notes);
  }

  return {
    ...snapshot,
    notes,
  };
}

export async function readWebDavSnapshotMeta(
  baseUrl: string,
  headers: HeadersInit,
  snapshotName: string,
) {
  return readJson<SnapshotRecord>(snapshotUrl(baseUrl, snapshotName), headers);
}

export async function readWebDavSnapshotShard(
  baseUrl: string,
  headers: HeadersInit,
  snapshotName: string,
  shard: { file: string },
) {
  const payload = await readJson<SnapshotRecord>(snapshotShardUrl(baseUrl, snapshotName, shard.file), headers);
  return payload?.notes || {};
}

export function planWebDavSnapshotWrite(
  baseUrl: string,
  latestCursor: string,
  notes: Record<string, WebDavSnapshotNote>,
): PlannedWebDavSnapshotWrite {
  const snapshotName = `snapshot_${latestCursor.padStart(8, '0')}.json`;
  const generatedAt = new Date().toISOString();
  const entries = Object.entries(notes);
  let currentNotes: Record<string, WebDavSnapshotNote> = {};
  let currentSize = 0;
  const plannedShards: Array<{
    notes: Record<string, WebDavSnapshotNote>;
    note_count: number;
    estimated_bytes: number;
  }> = [];

  function flushShard() {
    if (Object.keys(currentNotes).length === 0) return;
    plannedShards.push({
      notes: currentNotes,
      note_count: Object.keys(currentNotes).length,
      estimated_bytes: currentSize,
    });
    currentNotes = {};
    currentSize = 0;
  }

  for (const [noteId, note] of entries) {
    const estimatedBytes = JSON.stringify([noteId, note]).length;
    const noteCount = Object.keys(currentNotes).length;
    if (
      noteCount > 0
      && (currentSize + estimatedBytes > WEBDAV_SNAPSHOT_SHARD_TARGET_BYTES || noteCount >= WEBDAV_SNAPSHOT_SHARD_MAX_NOTES)
    ) {
      flushShard();
    }
    currentNotes[noteId] = note;
    currentSize += estimatedBytes;
  }
  flushShard();

  const writes: PlannedWebDavSnapshotWrite['writes'] = [];
  const files: string[] = [];

  if (plannedShards.length > 1) {
    for (const [index, shard] of plannedShards.entries()) {
      const file = `${snapshotName}.part_${String(index + 1).padStart(4, '0')}.json`;
      files.push(file);
      writes.push({
        url: snapshotShardUrl(baseUrl, snapshotName, file),
        payload: {
          format_version: WEBDAV_REMOTE_FORMAT_VERSION,
          latest_cursor: latestCursor,
          generated_at: generatedAt,
          notes: shard.notes,
          note_count: shard.note_count,
        } satisfies SnapshotRecord,
      });
    }
  }

  const payload: SnapshotRecord = plannedShards.length <= 1
    ? {
      format_version: WEBDAV_REMOTE_FORMAT_VERSION,
      latest_cursor: latestCursor,
      generated_at: generatedAt,
      notes,
      note_count: entries.length,
    }
    : {
      format_version: WEBDAV_REMOTE_FORMAT_VERSION,
      latest_cursor: latestCursor,
      generated_at: generatedAt,
      note_count: entries.length,
      shards: plannedShards.map((shard, index) => ({
        file: `${snapshotName}.part_${String(index + 1).padStart(4, '0')}.json`,
        note_count: shard.note_count,
        estimated_bytes: shard.estimated_bytes,
      })),
    };

  files.push(snapshotName);
  writes.push({
    url: snapshotUrl(baseUrl, snapshotName),
    payload,
  });
  return {
    snapshotName,
    files,
    writes,
  };
}

export async function writePlannedWebDavSnapshot(
  headers: HeadersInit,
  plannedSnapshot: PlannedWebDavSnapshotWrite,
) {
  for (const write of plannedSnapshot.writes) {
    await writeJson(write.url, headers, write.payload);
  }
}

export async function writeWebDavSnapshot(
  baseUrl: string,
  headers: HeadersInit,
  latestCursor: string,
  notes: Record<string, WebDavSnapshotNote>,
) {
  const plannedSnapshot = planWebDavSnapshotWrite(baseUrl, latestCursor, notes);
  await writePlannedWebDavSnapshot(headers, plannedSnapshot);
  return plannedSnapshot.snapshotName;
}

export async function readChangesFromBatches(
  baseUrl: string,
  headers: HeadersInit,
  batches: WebDavManifestBatchRecord[],
  minCursor: number,
) {
  const changes: WebDavBatchChange[] = [];
  for (const batch of batches) {
    const payload = await readBatch(baseUrl, headers, batch);
    if (!payload?.changes?.length) continue;
    for (const change of payload.changes) {
      if (toCursorNumber(change.cursor) <= minCursor) continue;
      changes.push(change);
    }
  }
  return changes;
}

export async function buildSnapshotStateFromRemote(
  baseUrl: string,
  headers: HeadersInit,
  manifestInput: ManifestRecord,
): Promise<Record<string, WebDavSnapshotNote>> {
  const manifest = normalizeWebDavManifest(manifestInput);
  if (manifest.latest_cursor === '0') return {};
  const snapshot = await readWebDavSnapshot(baseUrl, headers, manifest);
  if (snapshot?.notes) {
    const snapshotCursor = toCursorNumber(snapshot.latest_cursor);
    const pendingBatches = manifest.batches.filter((batch) => toCursorNumber(batch.latest_cursor) > snapshotCursor);
    if (!pendingBatches.length) return snapshot.notes;
    const changes = await readChangesFromBatches(baseUrl, headers, pendingBatches, snapshotCursor);
    return applyChangesToSnapshotState(snapshot.notes, changes);
  }
  const changes = await readChangesFromBatches(baseUrl, headers, manifest.batches, 0);
  return applyChangesToSnapshotState({}, changes);
}

export async function buildRemoteNoteStatesFromRemote(
  baseUrl: string,
  headers: HeadersInit,
  manifestInput: ManifestRecord,
): Promise<Record<string, SyncRemoteNoteState>> {
  const manifest = normalizeWebDavManifest(manifestInput);
  if (manifest.latest_cursor === '0') return {};
  const snapshot = await readWebDavSnapshot(baseUrl, headers, manifest);
  if (snapshot?.notes) {
    const snapshotCursor = toCursorNumber(snapshot.latest_cursor);
    const pendingBatches = manifest.batches.filter((batch) => toCursorNumber(batch.latest_cursor) > snapshotCursor);
    const changes = pendingBatches.length
      ? await readChangesFromBatches(baseUrl, headers, pendingBatches, snapshotCursor)
      : [];
    return applyChangesToRemoteNoteStates(buildRemoteNoteStatesFromSnapshot(snapshot), changes);
  }

  const changes = await readChangesFromBatches(baseUrl, headers, manifest.batches, 0);
  return applyChangesToRemoteNoteStates({}, changes);
}
