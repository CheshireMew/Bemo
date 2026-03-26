import type { SyncChange, SyncRemoteNoteState } from '../syncTransport.js';
import type {
  BatchIndexRecord,
  ManifestRecord,
  SnapshotRecord,
  WebDavBatchChange,
  WebDavBatchRecord,
  WebDavIndexedBatchRecord,
  WebDavManifestBatchRecord,
} from './webdavTypes.js';

export const WEBDAV_REMOTE_FORMAT_VERSION = 2;
export const WEBDAV_BATCH_RETENTION_LIMIT = 12;
export const WEBDAV_SNAPSHOT_SHARD_TARGET_BYTES = 4 * 1024 * 1024;
export const WEBDAV_SNAPSHOT_SHARD_MAX_NOTES = 200;

export type WebDavRemoteState = {
  manifest: ManifestRecord;
  batchIndex: BatchIndexRecord;
};

export type WebDavRemoteStateDocument = {
  manifest: ManifestRecord;
  manifestEtag: string | null;
  batchIndex: BatchIndexRecord;
  batchIndexEtag: string | null;
};

export type WebDavCommitOptions = {
  manifestEtag: string | null;
  batchIndexEtag: string | null;
};

export type WebDavPendingWriteRecord = {
  format_version: number;
  transaction_id: string;
  created_at: string;
  previous_manifest: ManifestRecord;
  previous_batch_index: BatchIndexRecord;
  next_manifest: ManifestRecord;
  next_batch_index: BatchIndexRecord;
  staged_files: {
    batch_files: string[];
    snapshot_files: string[];
  };
};

export type WebDavRemoteNoteIndexRecord = {
  format_version: number;
  latest_cursor: string;
  notes: SyncRemoteNoteState[];
  updated_at: string;
};

export type PlannedWebDavBatchWrite = {
  indexedBatch: WebDavIndexedBatchRecord;
  manifestBatch: WebDavManifestBatchRecord;
  changes: WebDavBatchChange[];
  file: string;
  payload: WebDavBatchRecord;
};

export type PlannedWebDavSnapshotWrite = {
  snapshotName: string;
  files: string[];
  writes: Array<{
    url: string;
    payload: SnapshotRecord;
  }>;
};

export function manifestUrl(baseUrl: string) {
  return `${baseUrl}/manifest.json`;
}

export function batchIndexUrl(baseUrl: string) {
  return `${baseUrl}/batch-index.json`;
}

export function remoteNoteIndexUrl(baseUrl: string) {
  return `${baseUrl}/notes-index.json`;
}

export function pendingWriteUrl(baseUrl: string) {
  return `${baseUrl}/pending-write.json`;
}

export function snapshotUrl(baseUrl: string, snapshotName: string) {
  return `${baseUrl}/snapshots/${snapshotName}`;
}

export function snapshotShardUrl(baseUrl: string, snapshotName: string, fileName: string) {
  return `${baseUrl}/snapshots/${fileName || `${snapshotName}.part_0001.json`}`;
}

export function snapshotFileUrl(baseUrl: string, fileName: string) {
  return `${baseUrl}/snapshots/${fileName}`;
}

export function batchUrl(baseUrl: string, fileName: string) {
  return `${baseUrl}/batches/${fileName}`;
}

export function formatSnapshotBootstrapCursor(snapshotName: string, shardIndex: number) {
  return `snapshot-bootstrap:${encodeURIComponent(snapshotName)}:${shardIndex}`;
}

export function parseSnapshotBootstrapCursor(cursor: string | null | undefined) {
  const normalized = String(cursor || '');
  const match = normalized.match(/^snapshot-bootstrap:([^:]+):(\d+)$/);
  if (!match) return null;
  return {
    snapshotName: decodeURIComponent(match[1]),
    shardIndex: Math.max(0, Number(match[2] || 0)),
  };
}

export function toCursorString(value: string | number | null | undefined) {
  const normalized = Number(value || '0');
  return String(Number.isFinite(normalized) && normalized > 0 ? normalized : 0);
}

export function toCursorNumber(value: string | number | null | undefined) {
  return Number(toCursorString(value));
}

export function uniqueOperationIds(changes: SyncChange[]) {
  const seen = new Set<string>();
  const operationIds: string[] = [];
  for (const change of changes) {
    const operationId = String(change.operation_id || '');
    if (!operationId || seen.has(operationId)) continue;
    seen.add(operationId);
    operationIds.push(operationId);
  }
  return operationIds;
}

export function buildBatchId(startCursor: number, endCursor: number) {
  return `batch_${String(startCursor).padStart(8, '0')}_${String(endCursor).padStart(8, '0')}`;
}

export function normalizeManifestBatchRecord(batch: WebDavManifestBatchRecord): WebDavManifestBatchRecord {
  return {
    batch_id: String(batch.batch_id || ''),
    file: String(batch.file || ''),
    started_after_cursor: toCursorString(batch.started_after_cursor),
    latest_cursor: toCursorString(batch.latest_cursor),
    change_count: Math.max(0, Number(batch.change_count || 0)),
  };
}

export function normalizeIndexedBatchRecord(batch: WebDavIndexedBatchRecord): WebDavIndexedBatchRecord {
  return {
    ...normalizeManifestBatchRecord(batch),
    operation_ids: Array.isArray(batch.operation_ids)
      ? batch.operation_ids.map((item) => String(item)).filter(Boolean)
      : [],
  };
}

export function buildEmptyManifest(): ManifestRecord {
  return {
    format_version: WEBDAV_REMOTE_FORMAT_VERSION,
    latest_cursor: '0',
    snapshot_cursor: '0',
    latest_snapshot: null,
    batches: [],
    updated_at: new Date().toISOString(),
  };
}

export function buildEmptyBatchIndex(): BatchIndexRecord {
  return {
    format_version: WEBDAV_REMOTE_FORMAT_VERSION,
    latest_cursor: '0',
    snapshot_cursor: '0',
    latest_snapshot: null,
    batches: [],
    accepted_operations: {},
    updated_at: new Date().toISOString(),
  };
}

export function buildEmptyRemoteNoteIndex(): WebDavRemoteNoteIndexRecord {
  return {
    format_version: WEBDAV_REMOTE_FORMAT_VERSION,
    latest_cursor: '0',
    notes: [],
    updated_at: new Date().toISOString(),
  };
}

export function buildPendingWriteRecord(input: {
  previousManifest: ManifestRecord;
  previousBatchIndex: BatchIndexRecord;
  nextManifest: ManifestRecord;
  nextBatchIndex: BatchIndexRecord;
  stagedFiles: {
    batchFiles: string[];
    snapshotFiles: string[];
  };
}): WebDavPendingWriteRecord {
  return {
    format_version: WEBDAV_REMOTE_FORMAT_VERSION,
    transaction_id: `pending_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    created_at: new Date().toISOString(),
    previous_manifest: normalizeWebDavManifest(input.previousManifest),
    previous_batch_index: normalizeWebDavBatchIndex(input.previousBatchIndex),
    next_manifest: normalizeWebDavManifest(input.nextManifest),
    next_batch_index: normalizeWebDavBatchIndex(input.nextBatchIndex),
    staged_files: {
      batch_files: Array.from(new Set(input.stagedFiles.batchFiles.map((item) => String(item)).filter(Boolean))),
      snapshot_files: Array.from(new Set(input.stagedFiles.snapshotFiles.map((item) => String(item)).filter(Boolean))),
    },
  };
}

export function sortBatchesByCursor<T extends { started_after_cursor: string }>(batches: T[]) {
  return batches.sort((left, right) => (
    toCursorNumber(left.started_after_cursor) - toCursorNumber(right.started_after_cursor)
  ));
}

export function deduplicateBatches<T extends { batch_id: string }>(batches: T[]) {
  const byId = new Map<string, T>();
  for (const batch of batches) {
    if (!batch.batch_id) continue;
    byId.set(batch.batch_id, batch);
  }
  return Array.from(byId.values());
}

export function manifestBatchToIndexedBatch(batch: WebDavManifestBatchRecord): WebDavIndexedBatchRecord {
  return {
    ...normalizeManifestBatchRecord(batch),
    operation_ids: Array.isArray(batch.operation_ids)
      ? batch.operation_ids.map((item) => String(item)).filter(Boolean)
      : [],
  };
}

export function indexedBatchToManifestBatch(batch: WebDavIndexedBatchRecord): WebDavManifestBatchRecord {
  return normalizeManifestBatchRecord(batch);
}

export function normalizeWebDavRemoteNoteIndex(index: WebDavRemoteNoteIndexRecord | null): WebDavRemoteNoteIndexRecord {
  if (!index) return buildEmptyRemoteNoteIndex();
  return {
    format_version: WEBDAV_REMOTE_FORMAT_VERSION,
    latest_cursor: toCursorString(index.latest_cursor),
    notes: Array.isArray(index.notes)
      ? index.notes
        .map((note) => ({
          note_id: String(note?.note_id || ''),
          scope: (note?.scope === 'trash' ? 'trash' : 'active') as 'active' | 'trash',
          revision: Math.max(1, Number(note?.revision || 1)),
        }))
        .filter((note) => note.note_id)
        .sort((left, right) => left.note_id.localeCompare(right.note_id))
      : [],
    updated_at: index.updated_at || new Date().toISOString(),
  };
}

export function remoteNoteStatesToRecord(notes: SyncRemoteNoteState[]) {
  return Object.fromEntries(notes.map((note) => [note.note_id, note] as const));
}

export function remoteNoteRecordToIndex(
  notes: Record<string, SyncRemoteNoteState>,
  latestCursor: string,
): WebDavRemoteNoteIndexRecord {
  return normalizeWebDavRemoteNoteIndex({
    format_version: WEBDAV_REMOTE_FORMAT_VERSION,
    latest_cursor: latestCursor,
    notes: Object.values(notes),
    updated_at: new Date().toISOString(),
  });
}

export function retainRecentManifestBatches(batches: WebDavIndexedBatchRecord[]) {
  return batches
    .slice(Math.max(0, batches.length - WEBDAV_BATCH_RETENTION_LIMIT))
    .map((batch) => indexedBatchToManifestBatch(batch));
}

export function retainRecentIndexedBatches(batches: WebDavIndexedBatchRecord[]) {
  const normalizedBatches = sortBatchesByCursor(deduplicateBatches(batches));
  return normalizedBatches.slice(Math.max(0, normalizedBatches.length - WEBDAV_BATCH_RETENTION_LIMIT));
}

export function areSameManifest(left: ManifestRecord, right: ManifestRecord) {
  return JSON.stringify(normalizeWebDavManifest(left)) === JSON.stringify(normalizeWebDavManifest(right));
}

export function areSameBatchIndex(left: BatchIndexRecord, right: BatchIndexRecord) {
  return JSON.stringify(normalizeWebDavBatchIndex(left)) === JSON.stringify(normalizeWebDavBatchIndex(right));
}

export function collectManifestIndexedBatches(manifest: { batches?: unknown[] } | null | undefined) {
  if (!Array.isArray(manifest?.batches)) return [];
  return sortBatchesByCursor(
    deduplicateBatches(
      manifest.batches
        .map((batch) => manifestBatchToIndexedBatch(batch as WebDavManifestBatchRecord))
        .filter((batch) => batch.batch_id && batch.file),
    ),
  );
}

export function collectAcceptedOperationsFromBatches(batches: WebDavIndexedBatchRecord[]) {
  const acceptedOperations: Record<string, string> = {};
  for (const batch of batches) {
    batch.operation_ids.forEach((operationId, offset) => {
      if (!operationId) return;
      acceptedOperations[operationId] = String(toCursorNumber(batch.started_after_cursor) + offset + 1);
    });
  }
  return acceptedOperations;
}

export function retainAcceptedOperationsForBatches(
  acceptedOperations: Record<string, string>,
  batches: WebDavIndexedBatchRecord[],
) {
  const retained = new Set<string>(batches.flatMap((batch) => batch.operation_ids));
  return Object.fromEntries(
    Object.entries(acceptedOperations)
      .filter(([operationId]) => retained.has(operationId)),
  );
}

export function normalizeWebDavManifest(manifest: ManifestRecord | null): ManifestRecord {
  if (!manifest) return buildEmptyManifest();
  return {
    format_version: WEBDAV_REMOTE_FORMAT_VERSION,
    latest_cursor: toCursorString(manifest.latest_cursor),
    snapshot_cursor: toCursorString(manifest.snapshot_cursor ?? manifest.latest_cursor),
    latest_snapshot: manifest.latest_snapshot ? String(manifest.latest_snapshot) : null,
    batches: Array.isArray(manifest.batches)
      ? sortBatchesByCursor(
        manifest.batches
          .map((batch) => normalizeManifestBatchRecord(batch))
          .filter((batch) => batch.file && batch.batch_id),
      )
      : [],
    updated_at: manifest.updated_at || new Date().toISOString(),
  };
}

export function normalizeWebDavBatchIndex(index: BatchIndexRecord | null): BatchIndexRecord {
  if (!index) return buildEmptyBatchIndex();
  const acceptedOperations = typeof index.accepted_operations === 'object' && index.accepted_operations
    ? Object.fromEntries(
      Object.entries(index.accepted_operations)
        .map(([operationId, cursor]) => [String(operationId), toCursorString(cursor)])
        .filter(([operationId]) => Boolean(operationId)),
    )
    : {};
  return {
    format_version: WEBDAV_REMOTE_FORMAT_VERSION,
    latest_cursor: toCursorString(index.latest_cursor),
    snapshot_cursor: toCursorString(index.snapshot_cursor ?? index.latest_cursor),
    latest_snapshot: index.latest_snapshot ? String(index.latest_snapshot) : null,
    batches: Array.isArray(index.batches)
      ? sortBatchesByCursor(
        deduplicateBatches(
          index.batches
            .map((batch) => normalizeIndexedBatchRecord(batch))
            .filter((batch) => batch.file && batch.batch_id),
        ),
      )
      : [],
    accepted_operations: acceptedOperations,
    updated_at: index.updated_at || new Date().toISOString(),
  };
}
