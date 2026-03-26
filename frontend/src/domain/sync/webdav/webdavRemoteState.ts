import type { SyncBootstrapState, SyncRemoteNoteState } from '../syncTransport.js';
import { buildBootstrapChangesFromSnapshot } from './webdavSnapshotState.js';
import type { BatchIndexRecord, ManifestRecord } from './webdavTypes.js';
import { readJson, readJsonDocument, webdavRequest, writeJson } from './webdavRequest.js';
import {
  areSameBatchIndex,
  areSameManifest,
  batchIndexUrl,
  batchUrl,
  formatSnapshotBootstrapCursor,
  collectAcceptedOperationsFromBatches,
  collectManifestIndexedBatches,
  manifestUrl,
  normalizeWebDavBatchIndex,
  normalizeWebDavManifest,
  normalizeWebDavRemoteNoteIndex,
  parseSnapshotBootstrapCursor,
  pendingWriteUrl,
  remoteNoteIndexUrl,
  remoteNoteRecordToIndex,
  remoteNoteStatesToRecord,
  retainRecentManifestBatches,
  snapshotFileUrl,
  snapshotUrl,
  sortBatchesByCursor,
  deduplicateBatches,
  toCursorNumber,
  toCursorString,
  type WebDavCommitOptions,
  type WebDavPendingWriteRecord,
  type WebDavRemoteState,
  type WebDavRemoteStateDocument,
  WEBDAV_REMOTE_FORMAT_VERSION,
} from './webdavRemoteContract.js';
import {
  buildRemoteNoteStatesFromRemote,
  readChangesFromBatches,
  readWebDavSnapshot,
  readWebDavSnapshotMeta,
  readWebDavSnapshotShard,
} from './webdavRemoteSnapshot.js';

export async function readWebDavManifest(baseUrl: string, headers: HeadersInit): Promise<ManifestRecord> {
  const manifest = await readJson<ManifestRecord>(manifestUrl(baseUrl), headers);
  return normalizeWebDavManifest(manifest);
}

async function readWebDavManifestDocument(baseUrl: string, headers: HeadersInit) {
  const document = await readJsonDocument<ManifestRecord>(manifestUrl(baseUrl), headers);
  return {
    manifest: normalizeWebDavManifest(document.value),
    etag: document.etag,
    status: document.status,
  };
}

export async function writeWebDavManifest(
  baseUrl: string,
  headers: HeadersInit,
  manifest: ManifestRecord,
  options: {
    ifMatch?: string | null;
  } = {},
) {
  const normalized = normalizeWebDavManifest(manifest);
  await writeJson(manifestUrl(baseUrl), headers, normalized, options);
  return normalized;
}

export async function readWebDavBatchIndex(
  baseUrl: string,
  headers: HeadersInit,
  manifestInput?: {
    batches?: unknown[];
    latest_cursor?: string;
    snapshot_cursor?: string;
    latest_snapshot?: string | null;
    updated_at?: string;
  } | null,
): Promise<BatchIndexRecord> {
  const document = await readWebDavBatchIndexDocument(baseUrl, headers, manifestInput);
  return document.batchIndex;
}

async function readWebDavBatchIndexDocument(
  baseUrl: string,
  headers: HeadersInit,
  manifestInput?: {
    batches?: unknown[];
    latest_cursor?: string;
    snapshot_cursor?: string;
    latest_snapshot?: string | null;
    updated_at?: string;
  } | null,
) {
  const rawIndexDocument = await readJsonDocument<BatchIndexRecord>(batchIndexUrl(baseUrl), headers);
  const index = normalizeWebDavBatchIndex(rawIndexDocument.value);
  const legacyBatches = collectManifestIndexedBatches(manifestInput);
  if (!legacyBatches.length) {
    return {
      batchIndex: index,
      etag: rawIndexDocument.etag,
      status: rawIndexDocument.status,
    };
  }

  const mergedBatches = sortBatchesByCursor(deduplicateBatches([
    ...index.batches,
    ...legacyBatches,
  ]));
  const legacyAcceptedOperations = collectAcceptedOperationsFromBatches(legacyBatches);
  return {
    batchIndex: normalizeWebDavBatchIndex({
      ...index,
      latest_cursor: String(Math.max(
        toCursorNumber(index.latest_cursor),
        toCursorNumber(manifestInput?.latest_cursor),
        ...mergedBatches.map((batch) => toCursorNumber(batch.latest_cursor)),
      )),
      snapshot_cursor: toCursorString(manifestInput?.snapshot_cursor ?? index.snapshot_cursor),
      latest_snapshot: manifestInput?.latest_snapshot ?? index.latest_snapshot,
      batches: mergedBatches,
      accepted_operations: {
        ...legacyAcceptedOperations,
        ...index.accepted_operations,
      },
      updated_at: manifestInput?.updated_at || index.updated_at,
    }),
    etag: rawIndexDocument.etag,
    status: rawIndexDocument.status,
  };
}

export async function writeWebDavBatchIndex(
  baseUrl: string,
  headers: HeadersInit,
  index: BatchIndexRecord,
  options: {
    ifMatch?: string | null;
  } = {},
) {
  const normalized = normalizeWebDavBatchIndex(index);
  await writeJson(batchIndexUrl(baseUrl), headers, normalized, options);
  return normalized;
}

async function readWebDavPendingWrite(baseUrl: string, headers: HeadersInit) {
  const rawPending = await readJson<WebDavPendingWriteRecord>(pendingWriteUrl(baseUrl), headers);
  if (!rawPending) return null;
  return {
    format_version: WEBDAV_REMOTE_FORMAT_VERSION,
    transaction_id: String(rawPending.transaction_id || ''),
    created_at: rawPending.created_at || new Date().toISOString(),
    previous_manifest: normalizeWebDavManifest(rawPending.previous_manifest),
    previous_batch_index: normalizeWebDavBatchIndex(rawPending.previous_batch_index),
    next_manifest: normalizeWebDavManifest(rawPending.next_manifest),
    next_batch_index: normalizeWebDavBatchIndex(rawPending.next_batch_index),
    staged_files: {
      batch_files: Array.isArray(rawPending.staged_files?.batch_files)
        ? rawPending.staged_files.batch_files.map((item) => String(item)).filter(Boolean)
        : [],
      snapshot_files: Array.isArray(rawPending.staged_files?.snapshot_files)
        ? rawPending.staged_files.snapshot_files.map((item) => String(item)).filter(Boolean)
        : [],
    },
  } satisfies WebDavPendingWriteRecord;
}

export async function writeWebDavPendingWrite(
  baseUrl: string,
  headers: HeadersInit,
  pendingWrite: WebDavPendingWriteRecord,
) {
  await writeJson(pendingWriteUrl(baseUrl), headers, pendingWrite);
}

export async function deleteWebDavPendingWrite(baseUrl: string, headers: HeadersInit) {
  const response = await webdavRequest(pendingWriteUrl(baseUrl), {
    method: 'DELETE',
    headers,
  });
  return response.status === 404 || (response.status >= 200 && response.status < 300);
}

async function readCurrentRemoteStateDocuments(
  baseUrl: string,
  headers: HeadersInit,
): Promise<WebDavRemoteStateDocument> {
  const manifestDocument = await readWebDavManifestDocument(baseUrl, headers);
  const batchIndexDocument = await readWebDavBatchIndexDocument(baseUrl, headers, manifestDocument.manifest);
  return {
    manifest: manifestDocument.manifest,
    manifestEtag: manifestDocument.etag,
    batchIndex: batchIndexDocument.batchIndex,
    batchIndexEtag: batchIndexDocument.etag,
  };
}

async function readWebDavRemoteNoteIndex(baseUrl: string, headers: HeadersInit) {
  const rawIndex = await readJson(remoteNoteIndexUrl(baseUrl), headers);
  return normalizeWebDavRemoteNoteIndex((rawIndex ?? null) as Parameters<typeof normalizeWebDavRemoteNoteIndex>[0]);
}

export async function writeWebDavRemoteNoteIndex(
  baseUrl: string,
  headers: HeadersInit,
  notes: Record<string, SyncRemoteNoteState>,
  latestCursor: string,
) {
  const normalized = remoteNoteRecordToIndex(notes, latestCursor);
  await writeJson(remoteNoteIndexUrl(baseUrl), headers, normalized);
  return normalized;
}

export async function readWebDavRemoteNoteStates(
  baseUrl: string,
  headers: HeadersInit,
  manifestInput: ManifestRecord,
) {
  const manifest = normalizeWebDavManifest(manifestInput);
  if (manifest.latest_cursor === '0') return {};

  const noteIndex = await readWebDavRemoteNoteIndex(baseUrl, headers);
  if (noteIndex.latest_cursor === manifest.latest_cursor) {
    return remoteNoteStatesToRecord(noteIndex.notes);
  }

  const remoteNotes = await buildRemoteNoteStatesFromRemote(baseUrl, headers, manifest);
  await writeWebDavRemoteNoteIndex(baseUrl, headers, remoteNotes, manifest.latest_cursor);
  return remoteNotes;
}

async function repairManifestFromBatchIndex(
  baseUrl: string,
  headers: HeadersInit,
  manifest: ManifestRecord,
  batchIndex: BatchIndexRecord,
  manifestEtag: string | null = null,
): Promise<ManifestRecord> {
  if (toCursorNumber(batchIndex.latest_cursor) <= toCursorNumber(manifest.latest_cursor)) {
    return manifest;
  }
  const activeLease = await readJson<{ device_id?: string; expires_at?: string }>(`${baseUrl}/lease.json`, headers);
  if (activeLease?.device_id && Date.parse(String(activeLease.expires_at || '')) > Date.now()) {
    return manifest;
  }
  const nextManifest = normalizeWebDavManifest({
    ...manifest,
    latest_cursor: batchIndex.latest_cursor,
    snapshot_cursor: batchIndex.snapshot_cursor,
    latest_snapshot: batchIndex.latest_snapshot,
    batches: retainRecentManifestBatches(batchIndex.batches),
    updated_at: new Date().toISOString(),
  });
  await writeWebDavManifest(baseUrl, headers, nextManifest, {
    ifMatch: manifestEtag,
  });
  return nextManifest;
}

export async function commitPendingWebDavWrite(
  baseUrl: string,
  headers: HeadersInit,
  pendingWrite: WebDavPendingWriteRecord,
  commitOptions: WebDavCommitOptions,
) {
  await writeWebDavBatchIndex(baseUrl, headers, pendingWrite.next_batch_index, {
    ifMatch: commitOptions.batchIndexEtag,
  });
  await writeWebDavManifest(baseUrl, headers, pendingWrite.next_manifest, {
    ifMatch: commitOptions.manifestEtag,
  });
}

async function deleteRemoteFile(url: string, headers: HeadersInit) {
  const response = await webdavRequest(url, { method: 'DELETE', headers });
  return response.status === 404 || (response.status >= 200 && response.status < 300);
}

async function remoteFileExists(url: string, headers: HeadersInit) {
  const headResponse = await webdavRequest(url, { method: 'HEAD', headers });
  if (headResponse.status === 404) return false;
  if (headResponse.status !== 405) return true;
  const getResponse = await webdavRequest(url, { method: 'GET', headers });
  return getResponse.status !== 404;
}

async function arePendingArtifactsReady(
  baseUrl: string,
  headers: HeadersInit,
  pendingWrite: WebDavPendingWriteRecord,
) {
  const stagedUrls = [
    ...pendingWrite.staged_files.batch_files.map((file) => batchUrl(baseUrl, file)),
    ...pendingWrite.staged_files.snapshot_files.map((file) => snapshotFileUrl(baseUrl, file)),
  ];
  for (const url of stagedUrls) {
    if (!(await remoteFileExists(url, headers))) {
      return false;
    }
  }
  return true;
}

async function cleanupPendingArtifacts(
  baseUrl: string,
  headers: HeadersInit,
  pendingWrite: WebDavPendingWriteRecord,
) {
  const stagedUrls = [
    ...pendingWrite.staged_files.batch_files.map((file) => batchUrl(baseUrl, file)),
    ...pendingWrite.staged_files.snapshot_files.map((file) => snapshotFileUrl(baseUrl, file)),
  ];
  await Promise.all(stagedUrls.map((url) => deleteRemoteFile(url, headers)));
}

async function deleteSnapshotFiles(baseUrl: string, headers: HeadersInit, snapshotName: string) {
  const snapshot = await readWebDavSnapshotMeta(baseUrl, headers, snapshotName);
  if (snapshot?.shards?.length) {
    await Promise.all(snapshot.shards.map((shard) => deleteRemoteFile(snapshotFileUrl(baseUrl, shard.file), headers)));
  }
  await deleteRemoteFile(snapshotUrl(baseUrl, snapshotName), headers);
}

export async function cleanupPrunedWebDavFiles(
  baseUrl: string,
  headers: HeadersInit,
  previousManifest: ManifestRecord,
  previousBatchIndex: BatchIndexRecord,
  nextManifest: ManifestRecord,
  nextBatchIndex: BatchIndexRecord,
) {
  const retainedBatchFiles = new Set(nextBatchIndex.batches.map((batch) => batch.file));
  const previousBatchFiles = new Set([
    ...previousManifest.batches.map((batch) => batch.file),
    ...previousBatchIndex.batches.map((batch) => batch.file),
  ]);

  await Promise.all(
    Array.from(previousBatchFiles)
      .filter((file) => file && !retainedBatchFiles.has(file))
      .map((file) => deleteRemoteFile(batchUrl(baseUrl, file), headers)),
  );

  const retainedSnapshots = new Set<string>();
  if (nextManifest.latest_snapshot) retainedSnapshots.add(nextManifest.latest_snapshot);
  if (nextBatchIndex.latest_snapshot) retainedSnapshots.add(nextBatchIndex.latest_snapshot);
  const previousSnapshots = new Set<string>();
  if (previousManifest.latest_snapshot) previousSnapshots.add(previousManifest.latest_snapshot);
  if (previousBatchIndex.latest_snapshot) previousSnapshots.add(previousBatchIndex.latest_snapshot);

  await Promise.all(
    Array.from(previousSnapshots)
      .filter((snapshotName) => snapshotName && !retainedSnapshots.has(snapshotName))
      .map((snapshotName) => deleteSnapshotFiles(baseUrl, headers, snapshotName)),
  );
}

async function recoverPendingWebDavWrite(
  baseUrl: string,
  headers: HeadersInit,
): Promise<WebDavRemoteState | null> {
  const pendingWrite = await readWebDavPendingWrite(baseUrl, headers);
  if (!pendingWrite) return null;

  const activeLease = await readJson<{ device_id?: string; expires_at?: string }>(`${baseUrl}/lease.json`, headers);
  if (activeLease?.device_id && Date.parse(String(activeLease.expires_at || '')) > Date.now()) {
    return null;
  }

  const currentManifestDocument = await readWebDavManifestDocument(baseUrl, headers);
  const currentBatchIndexDocument = await readWebDavBatchIndexDocument(baseUrl, headers, currentManifestDocument.manifest);
  const currentManifest = currentManifestDocument.manifest;
  const currentBatchIndex = currentBatchIndexDocument.batchIndex;
  const previousManifestMatches = areSameManifest(currentManifest, pendingWrite.previous_manifest);
  const previousBatchIndexMatches = areSameBatchIndex(currentBatchIndex, pendingWrite.previous_batch_index);
  const nextManifestMatches = areSameManifest(currentManifest, pendingWrite.next_manifest);
  const nextBatchIndexMatches = areSameBatchIndex(currentBatchIndex, pendingWrite.next_batch_index);

  if (
    toCursorNumber(currentManifest.latest_cursor) > toCursorNumber(pendingWrite.next_manifest.latest_cursor)
    || toCursorNumber(currentBatchIndex.latest_cursor) > toCursorNumber(pendingWrite.next_batch_index.latest_cursor)
  ) {
    await cleanupPendingArtifacts(baseUrl, headers, pendingWrite);
    await deleteWebDavPendingWrite(baseUrl, headers);
    return {
      manifest: currentManifest,
      batchIndex: currentBatchIndex,
    };
  }

  if (previousManifestMatches && previousBatchIndexMatches) {
    if (!(await arePendingArtifactsReady(baseUrl, headers, pendingWrite))) {
      await cleanupPendingArtifacts(baseUrl, headers, pendingWrite);
      await deleteWebDavPendingWrite(baseUrl, headers);
      return {
        manifest: currentManifest,
        batchIndex: currentBatchIndex,
      };
    }
    await commitPendingWebDavWrite(baseUrl, headers, pendingWrite, {
      manifestEtag: currentManifestDocument.etag,
      batchIndexEtag: currentBatchIndexDocument.etag,
    });
  } else if (previousManifestMatches && nextBatchIndexMatches) {
    await writeWebDavManifest(baseUrl, headers, pendingWrite.next_manifest, {
      ifMatch: currentManifestDocument.etag,
    });
  } else if (!nextManifestMatches || !nextBatchIndexMatches) {
    throw new Error('WebDAV 检测到未完成写入且远端状态已经变化，已停止自动恢复');
  }

  await cleanupPrunedWebDavFiles(
    baseUrl,
    headers,
    pendingWrite.previous_manifest,
    pendingWrite.previous_batch_index,
    pendingWrite.next_manifest,
    pendingWrite.next_batch_index,
  );
  await deleteWebDavPendingWrite(baseUrl, headers);

  return {
    manifest: pendingWrite.next_manifest,
    batchIndex: pendingWrite.next_batch_index,
  };
}

export async function readResolvedRemoteStateDocuments(
  baseUrl: string,
  headers: HeadersInit,
): Promise<WebDavRemoteStateDocument> {
  const recoveredState = await recoverPendingWebDavWrite(baseUrl, headers);
  if (recoveredState) {
    return readCurrentRemoteStateDocuments(baseUrl, headers);
  }

  const currentState = await readCurrentRemoteStateDocuments(baseUrl, headers);
  const repairedManifest = await repairManifestFromBatchIndex(
    baseUrl,
    headers,
    currentState.manifest,
    currentState.batchIndex,
    currentState.manifestEtag,
  );
  if (!areSameManifest(repairedManifest, currentState.manifest)) {
    return readCurrentRemoteStateDocuments(baseUrl, headers);
  }
  return {
    ...currentState,
    manifest: repairedManifest,
  };
}

export async function readWebDavRemoteState(
  baseUrl: string,
  headers: HeadersInit,
): Promise<WebDavRemoteState> {
  const { manifest, batchIndex } = await readResolvedRemoteStateDocuments(baseUrl, headers);
  return {
    manifest,
    batchIndex,
  };
}

function shouldPullFromSnapshot(manifest: ManifestRecord, cursor: string | null) {
  if (!manifest.latest_snapshot) return false;
  const normalizedCursor = toCursorNumber(cursor);
  if (normalizedCursor === 0) return true;
  if (!manifest.batches.length) return normalizedCursor < toCursorNumber(manifest.snapshot_cursor);
  const earliestRetainedCursor = toCursorNumber(manifest.batches[0]?.started_after_cursor);
  return normalizedCursor < earliestRetainedCursor;
}

export async function pullWebDavChanges(
  baseUrl: string,
  headers: HeadersInit,
  cursor: string | null,
  manifestInput?: ManifestRecord | null,
) {
  const manifest = manifestInput ? normalizeWebDavManifest(manifestInput) : (await readWebDavRemoteState(baseUrl, headers)).manifest;
  if (manifest.latest_cursor === '0') {
    return { changes: [], latestCursor: '0', manifest };
  }

  const snapshotBootstrap = parseSnapshotBootstrapCursor(cursor);
  const shouldBootstrapFromSnapshot = Boolean(snapshotBootstrap) || shouldPullFromSnapshot(manifest, cursor);
  if (shouldBootstrapFromSnapshot) {
    const snapshotName = snapshotBootstrap?.snapshotName || manifest.latest_snapshot;
    if (snapshotName) {
      const snapshotMeta = await readWebDavSnapshotMeta(baseUrl, headers, snapshotName);
      if (snapshotMeta) {
        if (Array.isArray(snapshotMeta.shards) && snapshotMeta.shards.length > 0) {
          const shardIndex = snapshotBootstrap?.shardIndex || 0;
          const shard = snapshotMeta.shards[shardIndex];
          if (shard) {
            const notes = await readWebDavSnapshotShard(baseUrl, headers, snapshotName, shard);
            return {
              changes: buildBootstrapChangesFromSnapshot({
                ...snapshotMeta,
                notes,
              }),
              latestCursor: shardIndex + 1 < snapshotMeta.shards.length
                ? formatSnapshotBootstrapCursor(snapshotName, shardIndex + 1)
                : snapshotMeta.latest_cursor,
              manifest,
            };
          }
          return {
            changes: [],
            latestCursor: snapshotMeta.latest_cursor,
            manifest,
          };
        }

        const snapshot = await readWebDavSnapshot(baseUrl, headers, {
          ...manifest,
          latest_snapshot: snapshotName,
        });
        if (snapshot?.notes) {
          const snapshotCursor = toCursorNumber(snapshot.latest_cursor);
          const pendingBatches = manifest.batches.filter((batch) => toCursorNumber(batch.latest_cursor) > snapshotCursor);
          const changes = pendingBatches.length
            ? await readChangesFromBatches(baseUrl, headers, pendingBatches, snapshotCursor)
            : [];
          return {
            changes: [
              ...buildBootstrapChangesFromSnapshot(snapshot),
              ...changes,
            ],
            latestCursor: manifest.latest_cursor,
            manifest,
          };
        }
      }
    }
  }

  const minCursor = toCursorNumber(cursor);
  const pendingBatches = manifest.batches.filter((batch) => toCursorNumber(batch.latest_cursor) > minCursor);
  const changes = await readChangesFromBatches(baseUrl, headers, pendingBatches, minCursor);
  return {
    changes,
    latestCursor: manifest.latest_cursor,
    manifest,
  };
}

export async function inspectWebDavRemoteState(
  baseUrl: string,
  headers: HeadersInit,
  remoteStateInput?: {
    manifest: ManifestRecord;
    batchIndex: BatchIndexRecord;
  } | null,
): Promise<SyncBootstrapState> {
  const { manifest } = remoteStateInput || await readWebDavRemoteState(baseUrl, headers);
  const notes = await readWebDavRemoteNoteStates(baseUrl, headers, manifest);
  return {
    status: manifest.latest_cursor === '0' ? 'not_started' : 'completed',
    fingerprint: null,
    remoteNotes: Object.values(notes),
  };
}
