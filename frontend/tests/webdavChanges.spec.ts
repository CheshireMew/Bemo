import assert from 'node:assert/strict';

import { normalizeWebDavManifest } from '../src/domain/sync/webdav/webdavRemoteLayout.js';

function testManifestDefaultsAreStable() {
  const manifest = normalizeWebDavManifest(null);
  assert.equal(manifest.latest_cursor, '0');
  assert.equal(manifest.snapshot_cursor, '0');
  assert.equal(manifest.latest_snapshot, null);
  assert.deepEqual(manifest.batches, []);
}

function testManifestNormalizationSortsAndCleansBatches() {
  const manifest = normalizeWebDavManifest({
    format_version: 1,
    latest_cursor: '9',
    snapshot_cursor: '8',
    latest_snapshot: 'snapshot_00000008.json',
    batches: [
      {
        batch_id: 'batch_00000009_00000009',
        file: 'batch_00000009_00000009.json',
        started_after_cursor: '8',
        latest_cursor: '9',
        change_count: 1,
      },
      {
        batch_id: 'batch_00000005_00000008',
        file: 'batch_00000005_00000008.json',
        started_after_cursor: '4',
        latest_cursor: '8',
        change_count: 4,
      },
    ],
    updated_at: '2026-03-18T00:00:00.000Z',
  });

  assert.equal(manifest.batches[0]?.batch_id, 'batch_00000005_00000008');
  assert.equal(manifest.batches[1]?.batch_id, 'batch_00000009_00000009');
}

testManifestDefaultsAreStable();
testManifestNormalizationSortsAndCleansBatches();

console.log('webdavChanges.spec passed');
