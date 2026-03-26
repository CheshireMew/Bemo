import { listLocalNotes, listLocalTrashNotes } from '../../notes/localNoteQueries.js';
import { getOrCreateDeviceId } from '../../storage/deviceIdentity.js';
import { createWebDavTransport } from '../webdavSyncTransport.js';
import { getSyncCursorStateKey, getSyncStateValue } from '../syncStateStorage.js';
import {
  acquireWebDavLease,
  releaseWebDavLease,
} from './webdavLease.js';
import {
  deleteWebDavBlob,
  listWebDavBlobHashes,
} from './webdavRemoteBlobs.js';
import type { BatchIndexRecord, ManifestRecord, SnapshotRecord } from './webdavTypes.js';
import { formatWebDavError } from './webdavRequest.js';
import {
  compareRemoteNotes,
  createProbeHash,
  parseBootstrapCursor,
  pushCheck,
  sameBytes,
  type DiagnosticCheck,
} from './webdavDiagnosticShared.js';
import type { SyncRemoteNoteState } from '../syncTransport.js';

export async function runWebDavLocalAndRuntimeChecks(input: {
  checks: DiagnosticCheck[];
  baseUrl: string;
  headers: HeadersInit;
  webdavUrl: string;
  username: string;
  password: string;
  basePath: string;
  manifest: ManifestRecord;
  batchIndex: BatchIndexRecord;
  rebuiltRemoteNotes: Record<string, SyncRemoteNoteState>;
  referencedBlobHashes: Set<string>;
  snapshotMeta: SnapshotRecord | null;
}) {
  const {
    checks,
    baseUrl,
    headers,
    webdavUrl,
    username,
    password,
    basePath,
    manifest,
    batchIndex,
    rebuiltRemoteNotes,
    referencedBlobHashes,
    snapshotMeta,
  } = input;

  try {
    const [activeNotes, trashNotes, storedCursor] = await Promise.all([
      listLocalNotes(),
      listLocalTrashNotes(),
      getSyncStateValue(getSyncCursorStateKey('webdav')),
    ]);
    const localIds = new Set([
      ...activeNotes.map((note) => note.note_id),
      ...trashNotes.map((note) => note.note_id),
    ]);
    const missingLocalCount = Object.keys(rebuiltRemoteNotes)
      .filter((noteId) => !localIds.has(noteId))
      .length;

    const localIssues: string[] = [];
    const localWarnings: string[] = [];
    const bootstrapCursor = parseBootstrapCursor(storedCursor);

    if (bootstrapCursor) {
      const snapshotName = String(manifest.latest_snapshot || batchIndex.latest_snapshot || '');
      if (!snapshotName || bootstrapCursor.snapshotName !== snapshotName) {
        localIssues.push('本地保存的是分片引导游标，但它指向的快照已经不存在');
      } else if (snapshotMeta?.shards?.length && bootstrapCursor.shardIndex >= snapshotMeta.shards.length) {
        localIssues.push('本地保存的分片引导游标已经越过最后一个分片');
      } else {
        localWarnings.push(`本地还停在首次引导中，下一次会从分片 ${bootstrapCursor.shardIndex + 1} 继续`);
      }
    } else if (storedCursor) {
      const localCursor = Number(storedCursor);
      if (!Number.isFinite(localCursor) || localCursor < 0) {
        localIssues.push('本地保存的同步游标不是合法数字');
      } else if (localCursor > Number(manifest.latest_cursor)) {
        localIssues.push('本地保存的同步游标已经超过远端最新游标');
      }
    } else if (Number(manifest.latest_cursor) > 0) {
      localWarnings.push('本机还没有 WebDAV 游标，下一次会走首次全量引导');
    }

    if (missingLocalCount > 0 && String(storedCursor || '') === String(manifest.latest_cursor || '0')) {
      localIssues.push(`本地游标看起来已经追平远端，但仍缺少 ${missingLocalCount} 条远端笔记`);
    } else if (missingLocalCount > 0) {
      localWarnings.push(`本地当前还缺少 ${missingLocalCount} 条远端笔记，这通常表示首次引导尚未完成`);
    }

    pushCheck(checks, {
      id: 'local-state',
      title: '本地游标与引导进度',
      phase: 'local',
      status: localIssues.length ? 'fail' : localWarnings.length ? 'warn' : 'pass',
      detail: localIssues.length
        ? localIssues.join('；')
        : localWarnings.length
          ? localWarnings.join('；')
          : '本地游标和本地笔记覆盖范围都正常。',
      facts: [
        `本地游标：${storedCursor || '未建立'}`,
        `本地活动笔记：${activeNotes.length}`,
        `本地回收站笔记：${trashNotes.length}`,
      ],
    });
  } catch (error) {
    pushCheck(checks, {
      id: 'local-state',
      title: '本地游标与引导进度',
      phase: 'local',
      status: 'fail',
      detail: error instanceof Error ? error.message : '读取本地同步状态失败',
    });
  }

  try {
    const deviceId = await getOrCreateDeviceId();
    const lease = await acquireWebDavLease(baseUrl, headers, deviceId);
    if (!lease) {
      pushCheck(checks, {
        id: 'lease',
        title: '锁文件写入与释放',
        phase: 'runtime',
        status: 'fail',
        detail: '当前无法拿到 WebDAV 锁，说明另一个设备仍在持锁，或者锁文件写回失败。',
      });
    } else {
      await releaseWebDavLease(baseUrl, headers, lease);
      pushCheck(checks, {
        id: 'lease',
        title: '锁文件写入与释放',
        phase: 'runtime',
        status: 'pass',
        detail: '锁文件可以正常读写和释放，正式 push 不会卡在 lease 路径。',
      });
    }
  } catch (error) {
    pushCheck(checks, {
      id: 'lease',
      title: '锁文件写入与释放',
      phase: 'runtime',
      status: 'fail',
      detail: formatWebDavError(error),
    });
  }

  try {
    const remoteBlobHashes = await listWebDavBlobHashes(baseUrl, headers);
    const remoteBlobSet = new Set(remoteBlobHashes);
    const referencedBlobList = Array.from(referencedBlobHashes).sort();
    const missingBlobs = referencedBlobList.filter((blobHash) => !remoteBlobSet.has(blobHash));
    const orphanBlobs = remoteBlobHashes.filter((blobHash) => !referencedBlobHashes.has(blobHash));
    pushCheck(checks, {
      id: 'blob-index',
      title: '远端附件引用完整性',
      phase: 'storage',
      status: missingBlobs.length
        ? 'fail'
        : orphanBlobs.length
          ? 'warn'
          : 'pass',
      detail: missingBlobs.length
        ? `有 ${missingBlobs.length} 个被笔记引用的附件在远端缺失。`
        : orphanBlobs.length
          ? `远端存在 ${orphanBlobs.length} 个孤儿附件，可清理但不会立刻破坏同步。`
          : '远端附件引用和实际 blob 集合一致。',
      facts: [
        `引用附件数：${referencedBlobList.length}`,
        `远端 blob 数：${remoteBlobHashes.length}`,
      ],
    });
  } catch (error) {
    pushCheck(checks, {
      id: 'blob-index',
      title: '远端附件引用完整性',
      phase: 'storage',
      status: 'warn',
      detail: `无法完整列出远端附件，因此这一步只能部分判断：${formatWebDavError(error)}`,
    });
  }

  try {
    const transport = createWebDavTransport({
      webdavUrl,
      username,
      password,
      basePath,
    });
    const probeHash = createProbeHash();
    const probeData = new TextEncoder().encode(`bemo-webdav-diagnostic:${Date.now()}`);

    try {
      await transport.putBlob(probeHash, probeData, 'text/plain');
      const existsAfterWrite = await transport.hasBlob(probeHash);
      const downloaded = await transport.getBlob(probeHash);
      const cleanupResult = await deleteWebDavBlob(baseUrl, headers, probeHash);
      const existsAfterDelete = await transport.hasBlob(probeHash);

      const probeIssues: string[] = [];
      if (!existsAfterWrite) {
        probeIssues.push('探针写入后，远端仍然报告 blob 不存在');
      }
      if (!sameBytes(downloaded, probeData)) {
        probeIssues.push('探针回读内容和写入内容不一致');
      }
      if (!cleanupResult || existsAfterDelete) {
        probeIssues.push('探针清理失败，远端残留了测试 blob');
      }

      pushCheck(checks, {
        id: 'blob-probe',
        title: '附件读写探针',
        phase: 'storage',
        status: probeIssues.length ? 'fail' : 'pass',
        detail: probeIssues.length
          ? probeIssues.join('；')
          : '附件的存在性检查、上传、下载和删除都正常。',
      });
    } finally {
      await deleteWebDavBlob(baseUrl, headers, probeHash).catch(() => undefined);
    }
  } catch (error) {
    pushCheck(checks, {
      id: 'blob-probe',
      title: '附件读写探针',
      phase: 'storage',
      status: 'fail',
      detail: formatWebDavError(error),
    });
  }

  try {
    const transport = createWebDavTransport({
      webdavUrl,
      username,
      password,
      basePath,
    });
    const bootstrap = await transport.inspectBootstrap?.();
    const pullResult = await transport.pull(manifest.latest_cursor);
    const pushResult = await transport.push([]);

    const runtimeIssues: string[] = [];
    if ((pullResult.changes || []).length > 0) {
      runtimeIssues.push('从最新游标拉取时仍然返回了变更，说明 pull contract 不稳定');
    }
    if (String(pullResult.latest_cursor || '') !== String(manifest.latest_cursor || '0')) {
      runtimeIssues.push('pull 返回的 latest_cursor 与远端 manifest 不一致');
    }
    if (String(pushResult.latest_cursor || '') !== String(manifest.latest_cursor || '0')) {
      runtimeIssues.push('空 push 返回的 latest_cursor 与远端 manifest 不一致');
    }
    if (bootstrap && Object.keys(rebuiltRemoteNotes).length > 0) {
      const bootstrapNotes = Object.fromEntries(
        bootstrap.remoteNotes.map((note) => [note.note_id, note] as const),
      );
      const mismatches = compareRemoteNotes(rebuiltRemoteNotes, bootstrapNotes);
      if (mismatches.length > 0) {
        runtimeIssues.push(`inspectBootstrap 返回的远端笔记状态与真实数据不一致，受影响笔记 ${mismatches.length} 条`);
      }
    }

    pushCheck(checks, {
      id: 'transport',
      title: '实际同步入口',
      phase: 'runtime',
      status: runtimeIssues.length ? 'fail' : 'pass',
      detail: runtimeIssues.length
        ? runtimeIssues.join('；')
        : 'inspect、pull、空 push 都能按当前 contract 正常工作。',
      facts: bootstrap
        ? [
          `bootstrap 状态：${bootstrap.status}`,
          `bootstrap 远端笔记数：${bootstrap.remoteNotes.length}`,
        ]
        : undefined,
    });
  } catch (error) {
    pushCheck(checks, {
      id: 'transport',
      title: '实际同步入口',
      phase: 'runtime',
      status: 'fail',
      detail: formatWebDavError(error),
    });
  }
}
