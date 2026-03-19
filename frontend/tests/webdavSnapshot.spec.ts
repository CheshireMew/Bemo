import assert from 'node:assert/strict';

import {
  applyChangesToSnapshotState,
  buildBootstrapChangesFromSnapshot,
} from '../src/domain/sync/webdav/webdavSnapshot.js';

function testSnapshotStateTracksLatestNoteState() {
  const notes = applyChangesToSnapshotState({}, [
    {
      entity_id: 'note-1',
      type: 'note.create',
      timestamp: '2026-03-18T00:00:00.000Z',
      payload: {
        revision: 1,
        filename: 'a.md',
        content: 'hello',
        tags: ['a'],
        pinned: false,
        created_at: '2026-03-18T00:00:00.000Z',
      },
    },
    {
      entity_id: 'note-1',
      type: 'note.patch',
      timestamp: '2026-03-18T00:01:00.000Z',
      payload: {
        revision: 2,
        pinned: true,
      },
    },
    {
      entity_id: 'note-1',
      type: 'note.update',
      timestamp: '2026-03-18T00:02:00.000Z',
      payload: {
        revision: 3,
        filename: 'a.md',
        content: 'hello world',
        tags: ['b'],
      },
    },
  ]);

  assert.deepEqual(notes['note-1'], {
    note_id: 'note-1',
    revision: 3,
    filename: 'a.md',
    content: 'hello world',
    tags: ['b'],
    pinned: true,
    created_at: '2026-03-18T00:00:00.000Z',
    updated_at: '2026-03-18T00:02:00.000Z',
    attachments: [],
  });
}

function testSnapshotDeleteRemovesNote() {
  const notes = applyChangesToSnapshotState({
    'note-1': {
      note_id: 'note-1',
      revision: 2,
      filename: 'a.md',
      content: 'bye',
      tags: [],
      pinned: false,
      created_at: '2026-03-18T00:00:00.000Z',
      updated_at: '2026-03-18T00:01:00.000Z',
      attachments: [],
    },
  }, [
    {
      entity_id: 'note-1',
      type: 'note.delete',
      timestamp: '2026-03-18T00:03:00.000Z',
      payload: {},
    },
  ]);

  assert.equal(notes['note-1'], undefined);
}

function testBootstrapChangesRecreateSnapshotNotes() {
  const changes = buildBootstrapChangesFromSnapshot({
    format_version: 1,
    latest_cursor: '12',
    generated_at: '2026-03-18T00:10:00.000Z',
    notes: {
      'note-1': {
        note_id: 'note-1',
        revision: 2,
        filename: 'a.md',
        content: 'first',
        tags: ['x'],
        pinned: false,
        created_at: '2026-03-18T00:00:00.000Z',
        updated_at: '2026-03-18T00:05:00.000Z',
        attachments: [{
          filename: 'cover.png',
          blob_hash: 'sha256:aaa',
          mime_type: 'image/png',
        }],
      },
      'note-2': {
        note_id: 'note-2',
        revision: 1,
        filename: 'b.md',
        content: 'second',
        tags: [],
        pinned: true,
        created_at: '2026-03-18T00:01:00.000Z',
        updated_at: '2026-03-18T00:04:00.000Z',
        attachments: [],
      },
    },
  });

  assert.equal(changes.length, 2);
  assert.equal(changes[0].type, 'note.create');
  assert.equal(changes[0].cursor, '12');
  assert.equal(changes[0].payload.attachments[0].blob_hash, 'sha256:aaa');
  assert.equal(changes[1].payload.pinned, true);
}

testSnapshotStateTracksLatestNoteState();
testSnapshotDeleteRemovesNote();
testBootstrapChangesRecreateSnapshotNotes();

console.log('webdavSnapshot.spec passed');
