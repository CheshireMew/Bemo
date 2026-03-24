import { enqueueExistingLocalNotesForSync } from './noteSyncOutbox.js';
import type { SyncTarget } from './mutationLogStorage.js';
import {
  getSyncCursorStateKey,
  getSyncLocalSeedStateKey,
  getSyncStateValue,
  setSyncStateValue,
} from './syncStateStorage.js';
import {
  getSyncTargetSeedFingerprint,
  type SyncConfigSnapshot,
} from './syncConfig.js';
import type { SyncTransport } from './syncTransport.js';

function collectRemoteNoteIds(changes: Array<{ entity_id?: string; type?: string }>) {
  const remoteNoteIds = new Set<string>();
  for (const change of changes) {
    const noteId = String(change.entity_id || '');
    if (!noteId) continue;
    if (change.type === 'note.purge') {
      remoteNoteIds.delete(noteId);
      continue;
    }
    remoteNoteIds.add(noteId);
  }
  return remoteNoteIds;
}

export async function seedLocalHistoryIfNeeded(
  target: SyncTarget,
  transport: SyncTransport,
  syncConfig: SyncConfigSnapshot,
) {
  if (target === 'webdav' && transport.inspectBootstrap) {
    const bootstrap = await transport.inspectBootstrap();
    const currentFingerprint = getSyncTargetSeedFingerprint(target, syncConfig);
    if (
      bootstrap.status === 'completed'
      && bootstrap.fingerprint === currentFingerprint
    ) {
      return 0;
    }

    const remoteNoteIds = new Set(bootstrap.remoteNoteIds);
    return enqueueExistingLocalNotesForSync(target, remoteNoteIds);
  }

  const seedKey = getSyncLocalSeedStateKey(target);
  const currentFingerprint = getSyncTargetSeedFingerprint(target, syncConfig);
  const seededFingerprint = await getSyncStateValue(seedKey);
  if (seededFingerprint === currentFingerprint) {
    return 0;
  }

  const remoteState = await transport.pull(null);
  const remoteNoteIds = collectRemoteNoteIds(remoteState.changes || []);
  const bootstrappedCount = await enqueueExistingLocalNotesForSync(target, remoteNoteIds);

  await setSyncStateValue(seedKey, currentFingerprint);

  return bootstrappedCount;
}

export async function pullAllRemoteChanges(
  transport: SyncTransport,
  target: SyncTarget,
) {
  const changes: any[] = [];
  const cursorKey = getSyncCursorStateKey(target);
  let cursor = await getSyncStateValue(cursorKey);
  let latestCursor = cursor || '0';

  while (true) {
    const pullResult = await transport.pull(cursor);
    const batchChanges = pullResult.changes || [];
    const nextCursor = String(pullResult.latest_cursor || cursor || '0');

    changes.push(...batchChanges);
    latestCursor = nextCursor;

    if (batchChanges.length === 0) {
      break;
    }

    if (nextCursor === cursor) {
      throw new Error('同步拉取游标未推进，已停止以避免死循环');
    }

    cursor = nextCursor;
  }

  return {
    changes,
    latest_cursor: latestCursor,
  };
}
