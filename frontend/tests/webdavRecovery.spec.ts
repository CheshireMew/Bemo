import assert from 'node:assert/strict';

import { createLocalNoteFromSync, createLocalTrashNoteFromSync } from '../src/domain/notes/localNoteCreation.js';
import { listLocalNotes, listLocalTrashNotes } from '../src/domain/notes/localNoteQueries.js';
import { applyChangesLocally } from '../src/domain/sync/localSyncApply.js';
import { consumeRemoteChanges } from '../src/domain/sync/syncBootstrap.js';
import { getSyncStateValue } from '../src/domain/sync/syncStateStorage.js';
import { installMemoryIndexedDb } from './memoryIndexedDb.js';

installMemoryIndexedDb();

async function resetDb() {
  indexedDB.deleteDatabase('bemo-offline');
}

async function testReplayUpdateDoesNotCreateSecondConflictCopy() {
  await resetDb();

  await createLocalNoteFromSync({
    note_id: 'note-1',
    revision: 3,
    filename: 'note-1.md',
    content: 'remote body',
    tags: ['remote'],
    pinned: true,
    created_at: '2026-03-26T00:00:00.000Z',
  });

  const result = await applyChangesLocally([
    {
      operation_id: 'op-remote-1',
      entity_id: 'note-1',
      type: 'note.update',
      base_revision: 2,
      payload: {
        revision: 3,
        filename: 'note-1.md',
        content: 'remote body',
        tags: ['remote'],
        pinned: true,
        created_at: '2026-03-26T00:00:00.000Z',
      },
    },
  ]);

  assert.equal(result.conflicts.length, 0);
  assert.equal(result.applied.length, 1);
  assert.equal(result.applied[0]?.deduplicated, true);
  assert.equal((await listLocalNotes()).length, 1);
}

async function testReplayDeleteDoesNotReapplyTrashState() {
  await resetDb();

  await createLocalTrashNoteFromSync({
    note_id: 'note-2',
    revision: 4,
    filename: 'note-2.md',
    content: 'already trashed',
    tags: ['trash'],
    pinned: false,
    created_at: '2026-03-26T00:00:00.000Z',
  });

  const result = await applyChangesLocally([
    {
      operation_id: 'op-delete-1',
      entity_id: 'note-2',
      type: 'note.delete',
      base_revision: 3,
      payload: {},
    },
  ]);

  assert.equal(result.conflicts.length, 0);
  assert.equal(result.applied.length, 1);
  assert.equal(result.applied[0]?.deduplicated, true);
  assert.equal((await listLocalTrashNotes()).length, 1);
}

async function testConsumeRemoteChangesResumesFromPersistedShardCursor() {
  await resetDb();

  const pullCalls: Array<string | null> = [];
  const transport = {
    async pull(cursor: string | null) {
      pullCalls.push(cursor);
      if (cursor === null) {
        return {
          changes: [{
            operation_id: 'snapshot-note-1',
            entity_id: 'note-1',
            type: 'note.create',
            payload: { revision: 1, content: 'first' },
          }],
          latest_cursor: 'snapshot-bootstrap:snapshot_00000012.json:1',
        };
      }
      if (cursor === 'snapshot-bootstrap:snapshot_00000012.json:1') {
        return {
          changes: [{
            operation_id: 'snapshot-note-2',
            entity_id: 'note-2',
            type: 'note.create',
            payload: { revision: 1, content: 'second' },
          }],
          latest_cursor: '12',
        };
      }
      return {
        changes: [],
        latest_cursor: '12',
      };
    },
  };

  await assert.rejects(
    consumeRemoteChanges(transport as any, 'webdav', {
      onBatch: async (_changes, meta) => {
        if (meta.nextCursor === '12') {
          throw new Error('stop on second shard');
        }
      },
    }),
    /stop on second shard/,
  );

  assert.equal(
    await getSyncStateValue('webdav_cursor'),
    'snapshot-bootstrap:snapshot_00000012.json:1',
  );
  assert.deepEqual(pullCalls, [null, 'snapshot-bootstrap:snapshot_00000012.json:1']);

  const resumedPullCalls: Array<string | null> = [];
  await consumeRemoteChanges({
    async pull(cursor: string | null) {
      resumedPullCalls.push(cursor);
      if (cursor === 'snapshot-bootstrap:snapshot_00000012.json:1') {
        return {
          changes: [{
            operation_id: 'snapshot-note-2',
            entity_id: 'note-2',
            type: 'note.create',
            payload: { revision: 1, content: 'second' },
          }],
          latest_cursor: '12',
        };
      }
      return {
        changes: [],
        latest_cursor: '12',
      };
    },
  } as any, 'webdav', {
    onBatch: async () => {},
  });

  assert.deepEqual(resumedPullCalls, ['snapshot-bootstrap:snapshot_00000012.json:1', '12']);
  assert.equal(await getSyncStateValue('webdav_cursor'), '12');
}

await testReplayUpdateDoesNotCreateSecondConflictCopy();
await testReplayDeleteDoesNotReapplyTrashState();
await testConsumeRemoteChangesResumesFromPersistedShardCursor();

console.log('webdavRecovery.spec passed');
