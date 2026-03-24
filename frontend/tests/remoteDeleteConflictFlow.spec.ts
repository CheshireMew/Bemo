import assert from 'node:assert/strict';

import { applyChangesLocally } from '../src/domain/sync/localSyncApply.js';
import { createLocalNoteFromSync } from '../src/domain/notes/localNoteCreation.js';
import { moveLocalNoteToTrashById } from '../src/domain/notes/localTrashMutations.js';
import {
  listLocalNotes,
  listLocalTrashNotes,
} from '../src/domain/notes/localNoteQueries.js';
import { installMemoryIndexedDb } from './memoryIndexedDb.js';

installMemoryIndexedDb();

async function resetDb() {
  indexedDB.deleteDatabase('bemo-offline');
}

async function testRemoteDeleteConflictCanBeAcceptedWithoutLosingConflictCopy() {
  await resetDb();

  await createLocalNoteFromSync({
    note_id: 'note-1',
    revision: 5,
    filename: '2026-03-18-note.md',
    content: 'local body',
    tags: ['local'],
    pinned: false,
    created_at: '2026-03-18T00:00:00.000Z',
  });

  const result = await applyChangesLocally([
    {
      operation_id: 'remote-delete-1',
      entity_id: 'note-1',
      type: 'note.delete',
      base_revision: 4,
      payload: {},
    },
  ]);

  assert.equal(result.applied.length, 0);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0]?.reason, 'revision_conflict');
  assert.deepEqual(result.conflicts[0]?.remote_snapshot, {
    trashed: true,
    revision: 6,
  });

  const activeBeforeAccept = await listLocalNotes();
  assert.equal(activeBeforeAccept.length, 2);
  assert.equal(activeBeforeAccept.some((note) => note.note_id === 'note-1'), true);

  const conflictCopy = activeBeforeAccept.find((note) => note.note_id !== 'note-1');
  assert.ok(conflictCopy);
  assert.match(conflictCopy.title, /^冲突副本/);

  await moveLocalNoteToTrashById('note-1');

  const activeAfterAccept = await listLocalNotes();
  const trashAfterAccept = await listLocalTrashNotes();

  assert.equal(activeAfterAccept.some((note) => note.note_id === 'note-1'), false);
  assert.equal(activeAfterAccept.some((note) => note.note_id === conflictCopy.note_id), true);
  assert.equal(trashAfterAccept.some((note) => note.note_id === 'note-1'), true);
}

await testRemoteDeleteConflictCanBeAcceptedWithoutLosingConflictCopy();

console.log('remoteDeleteConflictFlow.spec passed');
