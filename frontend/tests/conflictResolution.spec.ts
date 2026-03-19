import assert from 'node:assert/strict';

import {
  buildKeepLocalResyncPayload,
  buildRemoteRecreationInput,
  canAcceptRemoteDeleteConflict,
  canKeepLocalConflict,
  canRecreateFromRemoteConflict,
  getConflictCopyFilename,
  getRemoteRevision,
  isRemoteDeleteConflict,
} from '../src/domain/sync/conflictResolution.js';
import type { NoteMeta } from '../src/domain/notes/notesTypes.js';

function createNote(overrides: Partial<NoteMeta> = {}): NoteMeta {
  return {
    note_id: 'note-1',
    revision: 4,
    filename: '2026-03-18-note.md',
    title: 'Canonical Note',
    created_at: 1,
    updated_at: 2,
    content: 'canonical',
    tags: ['a'],
    pinned: false,
    ...overrides,
  };
}

function testConflictCapabilities() {
  assert.equal(canKeepLocalConflict('revision_conflict'), true);
  assert.equal(canKeepLocalConflict('local_note_not_found'), false);
  assert.equal(canRecreateFromRemoteConflict('local_note_not_found'), true);
  assert.equal(canRecreateFromRemoteConflict('revision_conflict'), false);
  assert.equal(canAcceptRemoteDeleteConflict({
    note_id: 'note-1',
    reason: 'revision_conflict',
    detail: {
      remote_snapshot: {
        deleted: true,
      },
    },
  }), true);
  assert.equal(canAcceptRemoteDeleteConflict({
    note_id: 'note-1',
    reason: 'revision_conflict',
    detail: {},
  }), false);
}

function testConflictCopyFilenameFallsBackToDetail() {
  assert.equal(getConflictCopyFilename({
    note_id: 'note-1',
    reason: 'revision_conflict',
    detail: {
      conflict_copy_filename: 'copy.md',
    },
  }), 'copy.md');
}

function testRemoteRevisionReadsStructuredSnapshot() {
  assert.equal(getRemoteRevision({
    remote_snapshot: {
      revision: 8,
    },
  }), 8);
  assert.equal(getRemoteRevision({}), null);
}

function testRemoteDeleteDetectionReadsSnapshotFlag() {
  assert.equal(isRemoteDeleteConflict({
    remote_snapshot: {
      deleted: true,
    },
  }), true);
  assert.equal(isRemoteDeleteConflict({
    remote_snapshot: {
      deleted: false,
    },
  }), false);
}

function testBuildKeepLocalResyncPayloadUsesConflictCopyContent() {
  const canonical = createNote();
  const conflictCopy = createNote({
    note_id: 'copy-1',
    title: '冲突副本 - Updated Locally',
    content: 'updated local body',
    tags: ['x', 'y'],
  });

  const payload = buildKeepLocalResyncPayload({
    noteId: canonical.note_id,
    canonical,
    conflictCopy,
    remoteRevision: 10,
  });

  assert.deepEqual(payload, {
    entityId: 'note-1',
    type: 'note.update',
    baseRevision: 10,
    payload: {
      filename: '2026-03-18-note.md',
      content: 'updated local body',
      tags: ['x', 'y'],
    },
    updatedNote: {
      content: 'updated local body',
      title: 'Updated Locally',
      tags: ['x', 'y'],
    },
  });
}

function testBuildRemoteRecreationInputMapsRemotePayload() {
  const result = buildRemoteRecreationInput({
    note_id: 'remote-note',
    reason: 'local_note_not_found',
    detail: {
      remote_change: {
        type: 'note.update',
        payload: {
          revision: 7,
          filename: 'remote.md',
          content: 'remote content',
          tags: ['remote'],
          pinned: true,
          created_at: '2026-03-18T00:00:00.000Z',
        },
      },
    },
  });

  assert.deepEqual(result, {
    note_id: 'remote-note',
    revision: 7,
    filename: 'remote.md',
    content: 'remote content',
    tags: ['remote'],
    pinned: true,
    created_at: '2026-03-18T00:00:00.000Z',
  });
}

testConflictCapabilities();
testConflictCopyFilenameFallsBackToDetail();
testRemoteRevisionReadsStructuredSnapshot();
testRemoteDeleteDetectionReadsSnapshotFlag();
testBuildKeepLocalResyncPayloadUsesConflictCopyContent();
testBuildRemoteRecreationInputMapsRemotePayload();

console.log('conflictResolution.spec passed');
