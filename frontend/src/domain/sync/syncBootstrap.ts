import { listCurrentNotes as listLocalNotes, listCurrentTrash as listLocalTrashNotes } from '../appStore/noteQueries.js';
import { enqueueExistingLocalNotesForSync } from './noteSyncOutbox.js';
import type { SyncTarget } from './mutationLogStorage.js';
import { getSyncCursorStateKey, getSyncStateValue, setSyncStateValue, getSyncStateRecords } from './syncStateStorage.js';
import { scopedSyncKey } from './syncTargetIdentity.js';
import type { SyncChange, SyncRemoteNoteState, SyncTransport } from './syncTransport.js';
import { shouldUseBackendAppStore } from '../runtime/appStoreRuntime.js';
import { readAppChangeToken } from '../appStore/backendAppEvents.js';

function collectRemoteNoteIds(changes: SyncChange[]) {
  const remoteNotes = new Map<string, SyncRemoteNoteState>();
  for (const change of changes) {
    const noteId = String(change.entity_id || '');
    if (!noteId) continue;
    const revision = Number(change.payload?.revision);
    if (change.type === 'note.purge') {
      remoteNotes.set(noteId, { note_id: noteId, scope: 'purged', revision: Number.isFinite(revision) ? revision : 1 });
      continue;
    }
    remoteNotes.set(noteId, {
      note_id: noteId,
      scope: change.type === 'note.trash' ? 'trash' : 'active',
      revision: Number.isFinite(revision) ? revision : 1,
    });
  }
  return remoteNotes;
}

async function collectLocalNoteIds() {
  const [activeNotes, trashNotes] = await Promise.all([
    listLocalNotes(),
    listLocalTrashNotes(),
  ]);
  return new Set([
    ...activeNotes.map((note) => note.note_id),
    ...trashNotes.map((note) => note.note_id),
  ]);
}

export async function inspectRemoteSyncState(
  target: SyncTarget,
  transport: SyncTransport,
  queuedNoteIds: ReadonlySet<string> = new Set(),
  targetId?: string,
) {
  const localNoteIds = await collectLocalNoteIds();
  const deletedIds = targetId ? await readWorkspaceDeletedIds(targetId) : new Set<string>();
  if (transport.inspectBootstrap) {
    const bootstrap = await transport.inspectBootstrap();
    const remoteNotes = new Map(bootstrap.remoteNotes.map((note) => [note.note_id, note] as const));
    const isCurrentStore = Boolean(target === 'server' && bootstrap.store_id && shouldUseBackendAppStore()
      && (await readAppChangeToken()).store_id === bootstrap.store_id);
    return {
      isCurrentStore,
      latestCursor: bootstrap.latest_cursor,
      remoteNotes,
      seededCount: isCurrentStore ? 0 : await enqueueExistingLocalNotesForSync(target, remoteNotes, queuedNoteIds, targetId),
      missingLocalNoteIds: bootstrap.remoteNotes
        .filter(note => note.scope !== 'purged').map((note) => note.note_id)
        .filter((noteId) => noteId && !localNoteIds.has(noteId) && !deletedIds.has(noteId)),
    };
  }

  const remoteState = await transport.pull(null);
  const remoteNotes = collectRemoteNoteIds(remoteState.changes || []);
  return {
    isCurrentStore: false,
    latestCursor: undefined,
    remoteNotes,
    seededCount: await enqueueExistingLocalNotesForSync(target, remoteNotes, queuedNoteIds, targetId),
    missingLocalNoteIds: Array.from(remoteNotes.values()).filter(note => note.scope !== 'purged').map(note => note.note_id).filter((noteId) => !localNoteIds.has(noteId)),
  };
}

export async function readWorkspaceDeletedIds(targetId: string) {
  const prefix = scopedSyncKey(targetId, 'deleted:');
  return new Set((await getSyncStateRecords(prefix)).map(row => decodeURIComponent(row.key.slice(prefix.length))));
}

export async function pullAllRemoteChanges(
  transport: SyncTransport,
  target: SyncTarget,
  options: {
    cursorOverride?: string | null;
    targetId?: string;
  } = {},
) {
  const changes: SyncChange[] = [];
  const cursorKey = getSyncCursorStateKey(target, options.targetId);
  const hasCursorOverride = Object.prototype.hasOwnProperty.call(options, 'cursorOverride');
  let cursor = hasCursorOverride ? options.cursorOverride ?? null : await getSyncStateValue(cursorKey);
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

export async function consumeRemoteChanges(
  transport: SyncTransport,
  target: SyncTarget,
  options: {
    cursorOverride?: string | null;
    targetId?: string;
    onBatch: (changes: SyncChange[], meta: { cursor: string | null; nextCursor: string }) => Promise<void>;
  },
) {
  const cursorKey = getSyncCursorStateKey(target, options.targetId);
  const hasCursorOverride = Object.prototype.hasOwnProperty.call(options, 'cursorOverride');
  let cursor = hasCursorOverride ? options.cursorOverride ?? null : await getSyncStateValue(cursorKey);
  let latestCursor = cursor || '0';

  while (true) {
    const pullResult = await transport.pull(cursor);
    const batchChanges = pullResult.changes || [];
    const nextCursor = String(pullResult.latest_cursor || cursor || '0');

    if (batchChanges.length === 0) {
      latestCursor = nextCursor;
      if (nextCursor && nextCursor !== cursor) {
        await setSyncStateValue(cursorKey, nextCursor);
      }
      break;
    }

    if (nextCursor === cursor) {
      throw new Error('同步拉取游标未推进，已停止以避免死循环');
    }

    await options.onBatch(batchChanges, { cursor, nextCursor });
    latestCursor = nextCursor;
    await setSyncStateValue(cursorKey, nextCursor);
    cursor = nextCursor;
  }

  return {
    latest_cursor: latestCursor,
  };
}
