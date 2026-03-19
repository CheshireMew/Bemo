import assert from 'node:assert/strict';

import { claimMutationLogTargets, filterMutationLogByTarget, type ChangeRecord } from '../src/utils/db.js';
import {
  hasConcurrentPatchConflict,
  hasConcurrentUpdateConflict,
  shouldKeepDeleteAsConflict,
} from '../src/domain/sync/localSyncApply.js';

function createChange(overrides: Partial<ChangeRecord> = {}): ChangeRecord {
  return {
    operation_id: 'op-1',
    device_id: 'device-1',
    entity_id: 'note-1',
    target: 'server',
    type: 'note.update',
    base_revision: 1,
    timestamp: '2026-03-18T00:00:00.000Z',
    payload: {},
    createdAt: 1,
    ...overrides,
  };
}

function testMutationLogFilteringKeepsTargetsIsolated() {
  const entries = [
    createChange({ operation_id: 'op-webdav', target: 'webdav', createdAt: 3 }),
    createChange({ operation_id: 'op-server-2', target: 'server', createdAt: 2 }),
    createChange({ operation_id: 'op-server-1', target: 'server', createdAt: 1 }),
  ];

  assert.deepEqual(
    filterMutationLogByTarget(entries, 'server').map((item) => item.operation_id),
    ['op-server-1', 'op-server-2'],
  );
  assert.deepEqual(
    filterMutationLogByTarget(entries, 'webdav').map((item) => item.operation_id),
    ['op-webdav'],
  );
}

function testClaimMutationLogTargetsMigratesLegacyEntries() {
  const entries = [
    createChange({ operation_id: 'op-legacy', target: undefined, createdAt: 1 }),
    createChange({ operation_id: 'op-server', target: 'server', createdAt: 2 }),
  ];

  const migrated = claimMutationLogTargets(entries, 'webdav');
  assert.equal(migrated[0]?.target, 'webdav');
  assert.equal(migrated[1]?.target, 'server');
}

function testUpdateConflictDetectsTagOnlyDivergence() {
  const local = {
    revision: 5,
    content: 'same body',
    tags: ['local', 'draft'],
  };

  assert.equal(
    hasConcurrentUpdateConflict(local, 4, {
      content: 'same body',
      tags: ['remote', 'draft'],
    }),
    true,
  );
  assert.equal(
    hasConcurrentUpdateConflict(local, 5, {
      content: 'same body',
      tags: ['remote', 'draft'],
    }),
    false,
  );
}

function testDeleteConflictProtectsNewerLocalRevision() {
  assert.equal(shouldKeepDeleteAsConflict(6, 5), true);
  assert.equal(shouldKeepDeleteAsConflict(5, 5), false);
  assert.equal(shouldKeepDeleteAsConflict(6, null), false);
}

function testPatchConflictProtectsNewerLocalMetadata() {
  const local = {
    revision: 7,
    content: 'same body',
    tags: ['local'],
    pinned: true,
  };

  assert.equal(
    hasConcurrentPatchConflict(local, 6, {
      tags: ['remote'],
    }),
    true,
  );
  assert.equal(
    hasConcurrentPatchConflict(local, 6, {
      pinned: false,
    }),
    true,
  );
  assert.equal(
    hasConcurrentPatchConflict(local, 7, {
      tags: ['remote'],
    }),
    false,
  );
}

testMutationLogFilteringKeepsTargetsIsolated();
testClaimMutationLogTargetsMigratesLegacyEntries();
testUpdateConflictDetectsTagOnlyDivergence();
testDeleteConflictProtectsNewerLocalRevision();
testPatchConflictProtectsNewerLocalMetadata();

console.log('syncIntegrity.spec passed');
