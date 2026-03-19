import assert from 'node:assert/strict';

import { CHANGE_BUCKET_SIZE, getChangeBucketName } from '../src/domain/sync/webdav/webdavChanges.js';

function testBucketSizeIsStable() {
  assert.equal(CHANGE_BUCKET_SIZE, 1000);
}

function testBucketNamesGroupChangesByCursorRange() {
  assert.equal(getChangeBucketName(1), '0000');
  assert.equal(getChangeBucketName(999), '0000');
  assert.equal(getChangeBucketName(1000), '0000');
  assert.equal(getChangeBucketName(1001), '0001');
  assert.equal(getChangeBucketName(2500), '0002');
}

testBucketSizeIsStable();
testBucketNamesGroupChangesByCursorRange();

console.log('webdavChanges.spec passed');
