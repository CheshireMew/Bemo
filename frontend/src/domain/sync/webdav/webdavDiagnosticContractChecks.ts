import type { SyncRemoteNoteState } from '../syncTransport.js';
import { collectRemoteBlobHashes } from './webdavRemoteBlobs.js';
import { buildSnapshotStateFromRemote } from './webdavRemoteSnapshot.js';
import { normalizeWebDavBatchIndex, normalizeWebDavManifest } from './webdavRemoteContract.js';
import type { BatchIndexRecord, ManifestRecord, SnapshotRecord, WebDavBatchRecord } from './webdavTypes.js';
import { readJson } from './webdavRequest.js';
import {
  batchUrl,
  compareRemoteNotes,
  dedupeBatches,
  normalizeRemoteNoteIndex,
  pushCheck,
  snapshotShardUrl,
  snapshotUrl,
  toCursorNumber,
  type DiagnosticCheck,
  type RemoteNoteIndexRecord,
} from './webdavDiagnosticShared.js';
import { buildRemoteNoteStatesFromSnapshot } from './webdavSnapshotState.js';

type RemoteContractState = {
  manifestRaw: ManifestRecord | null;
  batchIndexRaw: BatchIndexRecord | null;
  noteIndexRaw: RemoteNoteIndexRecord | null;
  manifest: ManifestRecord;
  batchIndex: BatchIndexRecord;
};

export async function runWebDavRemoteContractChecks(input: {
  checks: DiagnosticCheck[];
  baseUrl: string;
  headers: HeadersInit;
}) {
  const { checks, baseUrl, headers } = input;
  const state = await readRemoteContractState(baseUrl, headers, checks);
  const { manifest, batchIndex, noteIndexRaw } = state;

  pushManifestContractCheck(checks, state);
  await pushBatchIntegrityCheck(checks, baseUrl, headers, manifest, batchIndex);
  const snapshotMeta = await pushSnapshotIntegrityCheck(checks, baseUrl, headers, manifest, batchIndex);
  const { rebuiltRemoteNotes, referencedBlobHashes } = await pushNoteIndexCheck({
    checks,
    baseUrl,
    headers,
    manifest,
    noteIndexRaw,
    snapshotMeta,
  });

  return {
    manifest,
    batchIndex,
    rebuiltRemoteNotes,
    referencedBlobHashes,
    snapshotMeta,
  };
}

async function readRemoteContractState(
  baseUrl: string,
  headers: HeadersInit,
  checks: DiagnosticCheck[],
): Promise<RemoteContractState> {
  try {
    const manifestRaw = await readJson<ManifestRecord>(`${baseUrl}/manifest.json`, headers);
    const batchIndexRaw = await readJson<BatchIndexRecord>(`${baseUrl}/batch-index.json`, headers);
    const noteIndexRaw = await readJson<RemoteNoteIndexRecord>(`${baseUrl}/notes-index.json`, headers);
    const manifest = normalizeWebDavManifest(manifestRaw);
    const batchIndex = normalizeWebDavBatchIndex(batchIndexRaw);

    pushMetadataCheck(checks, manifestRaw, batchIndexRaw, noteIndexRaw, manifest);
    return {
      manifestRaw,
      batchIndexRaw,
      noteIndexRaw,
      manifest,
      batchIndex,
    };
  } catch (error) {
    throw {
      phase: 'metadata',
      error,
    };
  }
}

function pushMetadataCheck(
  checks: DiagnosticCheck[],
  manifestRaw: ManifestRecord | null,
  batchIndexRaw: BatchIndexRecord | null,
  noteIndexRaw: RemoteNoteIndexRecord | null,
  manifest: ManifestRecord,
) {
  const metadataFacts = [
    `manifest：${manifestRaw ? '存在' : '缺失'}`,
    `batch-index：${batchIndexRaw ? '存在' : '缺失'}`,
    `notes-index：${noteIndexRaw ? '存在' : '缺失'}`,
    `最新游标：${manifest.latest_cursor}`,
  ];
  const presentCount = [manifestRaw, batchIndexRaw, noteIndexRaw].filter(Boolean).length;
  pushCheck(checks, {
    id: 'metadata',
    title: '远端元数据文件',
    phase: 'contract',
    status: presentCount === 0
      ? 'pass'
      : presentCount === 3
        ? 'pass'
        : 'warn',
    detail: presentCount === 0
      ? '远端还是空库，首次同步会自动生成元数据。'
      : presentCount === 3
        ? '远端元数据文件齐全。'
        : '远端元数据不是完整同一批，虽然通常还能恢复，但会放大一次同步成本。',
    facts: metadataFacts,
  });
}

function pushManifestContractCheck(checks: DiagnosticCheck[], state: RemoteContractState) {
  const { manifestRaw, batchIndexRaw, noteIndexRaw, manifest, batchIndex } = state;
  const manifestIssues: string[] = [];
  if (manifestRaw && manifestRaw.format_version !== 2) {
    manifestIssues.push(`manifest 版本是 ${manifestRaw.format_version}，当前客户端期望 2`);
  }
  if (batchIndexRaw && batchIndexRaw.format_version !== 2) {
    manifestIssues.push(`batch-index 版本是 ${batchIndexRaw.format_version}，当前客户端期望 2`);
  }
  if (noteIndexRaw && Number(noteIndexRaw.format_version || 0) !== 0 && Number(noteIndexRaw.format_version || 0) !== 2) {
    manifestIssues.push(`notes-index 版本是 ${noteIndexRaw.format_version}，当前客户端期望 2`);
  }
  if (toCursorNumber(manifest.snapshot_cursor) > toCursorNumber(manifest.latest_cursor)) {
    manifestIssues.push('manifest 的 snapshot_cursor 大于 latest_cursor');
  }
  if (toCursorNumber(batchIndex.snapshot_cursor) > toCursorNumber(batchIndex.latest_cursor)) {
    manifestIssues.push('batch-index 的 snapshot_cursor 大于 latest_cursor');
  }
  if (toCursorNumber(manifest.latest_cursor) > toCursorNumber(batchIndex.latest_cursor)) {
    manifestIssues.push('manifest 的 latest_cursor 比 batch-index 更靠前，这不应该发生');
  }

  const contractWarnings: string[] = [];
  if (toCursorNumber(batchIndex.latest_cursor) > toCursorNumber(manifest.latest_cursor)) {
    contractWarnings.push('manifest 落后于 batch-index，下一轮同步可能会触发一次自修复');
  }
  if (!manifest.latest_snapshot && toCursorNumber(manifest.snapshot_cursor) > 0) {
    manifestIssues.push('manifest 记录了 snapshot_cursor，但没有 latest_snapshot');
  }
  if (!batchIndex.latest_snapshot && toCursorNumber(batchIndex.snapshot_cursor) > 0) {
    manifestIssues.push('batch-index 记录了 snapshot_cursor，但没有 latest_snapshot');
  }

  pushCheck(checks, {
    id: 'manifest-contract',
    title: '游标与版本 contract',
    phase: 'contract',
    status: manifestIssues.length ? 'fail' : contractWarnings.length ? 'warn' : 'pass',
    detail: manifestIssues.length
      ? manifestIssues.join('；')
      : contractWarnings.length
        ? contractWarnings.join('；')
        : '游标、快照指针和版本号保持一致。',
    facts: [
      `manifest latest_cursor：${manifest.latest_cursor}`,
      `batch-index latest_cursor：${batchIndex.latest_cursor}`,
      `manifest snapshot_cursor：${manifest.snapshot_cursor}`,
      `batch-index snapshot_cursor：${batchIndex.snapshot_cursor}`,
    ],
  });
}

async function pushBatchIntegrityCheck(
  checks: DiagnosticCheck[],
  baseUrl: string,
  headers: HeadersInit,
  manifest: ManifestRecord,
  batchIndex: BatchIndexRecord,
) {
  const retainedBatches = dedupeBatches([
    ...manifest.batches,
    ...batchIndex.batches,
  ]);
  const batchIssues: string[] = [];
  const batchFacts: string[] = [];
  let previousLatestCursor: number | null = null;

  for (const batch of retainedBatches) {
    const startedAfter = toCursorNumber(batch.started_after_cursor);
    const latestCursor = toCursorNumber(batch.latest_cursor);
    if (latestCursor <= startedAfter) {
      batchIssues.push(`${batch.file} 的 latest_cursor 没有真正推进`);
    }
    if (previousLatestCursor !== null && startedAfter !== previousLatestCursor) {
      batchIssues.push(`${batch.file} 前存在游标断层，预期从 ${previousLatestCursor} 开始，实际从 ${startedAfter} 开始`);
    }
    previousLatestCursor = latestCursor;

    const payload = await readJson<WebDavBatchRecord>(batchUrl(baseUrl, batch.file), headers);
    if (!payload) {
      batchIssues.push(`${batch.file} 在索引中存在，但远端文件缺失`);
      continue;
    }
    if (payload.batch_id !== batch.batch_id) {
      batchIssues.push(`${batch.file} 的 batch_id 与索引不一致`);
    }
    if (toCursorNumber(payload.started_after_cursor) !== startedAfter || toCursorNumber(payload.latest_cursor) !== latestCursor) {
      batchIssues.push(`${batch.file} 的游标范围与索引不一致`);
    }
    if ((payload.changes || []).length !== Number(batch.change_count || 0)) {
      batchIssues.push(`${batch.file} 的 change_count 与实际条目数不一致`);
    }
  }

  if (toCursorNumber(manifest.latest_cursor) > 0 && !manifest.latest_snapshot && retainedBatches.length > 0) {
    const earliestStart = toCursorNumber(retainedBatches[0].started_after_cursor);
    if (earliestStart > 0) {
      batchIssues.push('远端没有可用快照，但保留的 batch 不是从 0 开始，新设备无法完整引导');
    }
  }

  const batchesAfterSnapshot = retainedBatches.filter((batch) => (
    toCursorNumber(batch.latest_cursor) > toCursorNumber(manifest.snapshot_cursor)
  ));
  if (manifest.latest_snapshot && batchesAfterSnapshot.length > 0) {
    const firstBatch = batchesAfterSnapshot[0];
    if (toCursorNumber(firstBatch.started_after_cursor) !== toCursorNumber(manifest.snapshot_cursor)) {
      batchIssues.push('快照之后保留的第一批 batch 不是从 snapshot_cursor 接续，首次引导会丢变更');
    }
  }

  if (retainedBatches.length) {
    batchFacts.push(`保留 batch 数量：${retainedBatches.length}`);
    batchFacts.push(`最早 batch 起点：${retainedBatches[0].started_after_cursor}`);
    batchFacts.push(`最晚 batch 终点：${retainedBatches[retainedBatches.length - 1].latest_cursor}`);
  }

  pushCheck(checks, {
    id: 'batches',
    title: '保留 batch 完整性',
    phase: 'contract',
    status: batchIssues.length ? 'fail' : 'pass',
    detail: batchIssues.length
      ? batchIssues.join('；')
      : retainedBatches.length
        ? '保留 batch 文件都能读到，游标链路连续。'
        : '当前没有保留 batch，远端要么还是空库，要么已经完全收口到快照。',
    facts: batchFacts,
  });
}

async function pushSnapshotIntegrityCheck(
  checks: DiagnosticCheck[],
  baseUrl: string,
  headers: HeadersInit,
  manifest: ManifestRecord,
  batchIndex: BatchIndexRecord,
) {
  let snapshotMeta: SnapshotRecord | null = null;
  const snapshotIssues: string[] = [];
  if (manifest.latest_snapshot || batchIndex.latest_snapshot) {
    const snapshotName = String(manifest.latest_snapshot || batchIndex.latest_snapshot || '');
    snapshotMeta = await readJson<SnapshotRecord>(snapshotUrl(baseUrl, snapshotName), headers);
    if (!snapshotMeta) {
      snapshotIssues.push(`最新快照 ${snapshotName} 在索引中存在，但远端文件缺失`);
    } else {
      pushSnapshotCountIssues(snapshotIssues, manifest, batchIndex, snapshotMeta);
      await pushSnapshotShardIssues(snapshotIssues, baseUrl, headers, snapshotMeta);
    }
  }

  pushCheck(checks, {
    id: 'snapshot',
    title: '快照与分片完整性',
    phase: 'contract',
    status: snapshotIssues.length ? 'fail' : 'pass',
    detail: snapshotIssues.length
      ? snapshotIssues.join('；')
      : manifest.latest_snapshot || batchIndex.latest_snapshot
        ? '快照文件和分片都能正常读取。'
        : '远端当前没有快照，首次引导会直接依赖保留 batch 或空库状态。',
    facts: snapshotMeta
      ? [
        `快照文件：${String(manifest.latest_snapshot || batchIndex.latest_snapshot || '')}`,
        `快照游标：${snapshotMeta.latest_cursor}`,
        `分片数量：${Array.isArray(snapshotMeta.shards) ? snapshotMeta.shards.length : 0}`,
        `笔记数量：${String(snapshotMeta.note_count || Object.keys(snapshotMeta.notes || {}).length)}`,
      ]
      : undefined,
  });
  return snapshotMeta;
}

function pushSnapshotCountIssues(
  snapshotIssues: string[],
  manifest: ManifestRecord,
  batchIndex: BatchIndexRecord,
  snapshotMeta: SnapshotRecord,
) {
  if (toCursorNumber(snapshotMeta.latest_cursor) !== toCursorNumber(manifest.snapshot_cursor || batchIndex.snapshot_cursor)) {
    snapshotIssues.push('快照文件记录的 latest_cursor 与 snapshot_cursor 不一致');
  }
}

async function pushSnapshotShardIssues(
  snapshotIssues: string[],
  baseUrl: string,
  headers: HeadersInit,
  snapshotMeta: SnapshotRecord,
) {
  if (Array.isArray(snapshotMeta.shards) && snapshotMeta.shards.length > 0) {
    let shardNoteCount = 0;
    for (const shard of snapshotMeta.shards) {
      const shardPayload = await readJson<SnapshotRecord>(snapshotShardUrl(baseUrl, shard.file), headers);
      if (!shardPayload?.notes) {
        snapshotIssues.push(`分片 ${shard.file} 缺失或内容不可解析`);
        continue;
      }
      const actualCount = Object.keys(shardPayload.notes).length;
      shardNoteCount += actualCount;
      if (actualCount !== Number(shard.note_count || 0)) {
        snapshotIssues.push(`分片 ${shard.file} 的 note_count 与实际条目数不一致`);
      }
    }
    if (Number(snapshotMeta.note_count || shardNoteCount) !== shardNoteCount) {
      snapshotIssues.push('快照总 note_count 与分片实际笔记数不一致');
    }
    return;
  }

  const actualCount = Object.keys(snapshotMeta.notes || {}).length;
  if (Number(snapshotMeta.note_count || actualCount) !== actualCount) {
    snapshotIssues.push('快照 note_count 与实际笔记数不一致');
  }
}

async function pushNoteIndexCheck(input: {
  checks: DiagnosticCheck[];
  baseUrl: string;
  headers: HeadersInit;
  manifest: ManifestRecord;
  noteIndexRaw: RemoteNoteIndexRecord | null;
  snapshotMeta: SnapshotRecord | null;
}) {
  const { checks, baseUrl, headers, manifest, noteIndexRaw, snapshotMeta } = input;
  let rebuiltRemoteNotes: Record<string, SyncRemoteNoteState> = {};
  let referencedBlobHashes = new Set<string>();

  try {
    const snapshotState = await buildSnapshotStateFromRemote(baseUrl, headers, manifest);
    rebuiltRemoteNotes = buildRemoteNoteStatesFromSnapshot({
      format_version: 2,
      latest_cursor: manifest.latest_cursor,
      generated_at: snapshotMeta?.generated_at || new Date().toISOString(),
      notes: snapshotState,
    });
    referencedBlobHashes = collectRemoteBlobHashes(snapshotState);

    const noteIndex = normalizeRemoteNoteIndex(noteIndexRaw);
    const noteIndexIssues = collectNoteIndexIssues(noteIndex, manifest, rebuiltRemoteNotes);
    pushCheck(checks, {
      id: 'note-index',
      title: '远端笔记索引一致性',
      phase: 'contract',
      status: noteIndexIssues.length
        ? 'warn'
        : noteIndex.notes.length === 0 && Object.keys(rebuiltRemoteNotes).length > 0
          ? 'warn'
          : 'pass',
      detail: noteIndexIssues.length
        ? noteIndexIssues.join('；')
        : noteIndex.notes.length === 0 && Object.keys(rebuiltRemoteNotes).length > 0
          ? 'notes-index 还没建立或已被清空，下一次 inspect 会重建它。'
          : 'notes-index 与远端真实状态一致。',
      facts: [
        `真实远端笔记数：${Object.keys(rebuiltRemoteNotes).length}`,
        `notes-index 笔记数：${noteIndex.notes.length}`,
        `引用附件数：${referencedBlobHashes.size}`,
      ],
    });
  } catch (error) {
    pushCheck(checks, {
      id: 'note-index',
      title: '远端笔记索引一致性',
      phase: 'contract',
      status: 'fail',
      detail: error instanceof Error ? error.message : '无法重建远端笔记索引',
    });
  }

  return { rebuiltRemoteNotes, referencedBlobHashes };
}

function collectNoteIndexIssues(
  noteIndex: ReturnType<typeof normalizeRemoteNoteIndex>,
  manifest: ManifestRecord,
  rebuiltRemoteNotes: Record<string, SyncRemoteNoteState>,
) {
  const mismatches = compareRemoteNotes(
    rebuiltRemoteNotes,
    Object.fromEntries(noteIndex.notes.map((note) => [note.note_id, note] as const)),
  );
  const issues: string[] = [];
  if (manifest.latest_cursor !== noteIndex.latestCursor && noteIndex.notes.length > 0) {
    issues.push('notes-index 的 latest_cursor 落后于真实远端游标');
  }
  if (mismatches.length > 0) {
    issues.push(`notes-index 与真实远端状态不一致，受影响笔记 ${mismatches.length} 条`);
  }
  return issues;
}
