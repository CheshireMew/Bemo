import assert from 'node:assert/strict';

import { getAttachmentBlob, getDraftAttachmentBlob, getAllAttachmentRefs } from '../src/utils/db.js';
import {
  buildLocalAttachmentPath,
  clearDraftAttachmentSession,
  createDraftAttachmentSessionKey,
  createLocalAttachmentFilename,
  promoteDraftAttachmentsForContent,
  pruneDraftAttachmentsForContent,
  saveLocalAttachmentFile,
} from '../src/utils/localAttachments.js';
import { installMemoryIndexedDb } from './memoryIndexedDb.js';

installMemoryIndexedDb();

async function resetDb() {
  indexedDB.deleteDatabase('bemo-offline');
}

function testBuildLocalAttachmentPathEncodesFilename() {
  assert.equal(
    buildLocalAttachmentPath('hello world.png'),
    '/images/hello%20world.png',
  );
}

function testCreateLocalAttachmentFilenameKeepsReadableSuffix() {
  const filename = createLocalAttachmentFilename('cover image.png');
  assert.match(filename, /^\d+-[a-z0-9]{6}-cover image\.png$/);
}

async function testSaveLocalAttachmentFileStoresBlobAndReturnsImagesPath() {
  await resetDb();

  const file = new File([new Uint8Array([1, 2, 3])], 'capture.png', { type: 'image/png' });
  const saved = await saveLocalAttachmentFile(file);

  assert.match(saved.url, /^\/images\//);
  const blob = await getAttachmentBlob(saved.filename);
  assert.ok(blob);
  assert.equal(blob.type, 'image/png');
  assert.equal(blob.size, 3);
}

async function testSaveLocalAttachmentFileKeepsDraftUploadsOutOfPermanentStoreUntilPromoted() {
  await resetDb();

  const sessionKey = createDraftAttachmentSessionKey();
  const file = new File([new Uint8Array([4, 5, 6])], 'draft.png', { type: 'image/png' });
  const saved = await saveLocalAttachmentFile(file, { draftSessionKey: sessionKey });

  assert.equal(await getAttachmentBlob(saved.filename), null);
  const draftBlob = await getDraftAttachmentBlob(saved.filename);
  assert.ok(draftBlob);
  assert.equal(draftBlob.type, 'image/png');

  await promoteDraftAttachmentsForContent(sessionKey, `![draft](${saved.url})`);

  const promoted = await getAttachmentBlob(saved.filename);
  assert.ok(promoted);
  assert.equal(promoted.size, 3);
}

async function testPruneAndClearDraftAttachmentsRemoveUnusedDraftBlobs() {
  await resetDb();

  const sessionKey = createDraftAttachmentSessionKey();
  const keep = await saveLocalAttachmentFile(
    new File([new Uint8Array([1])], 'keep.png', { type: 'image/png' }),
    { draftSessionKey: sessionKey },
  );
  const drop = await saveLocalAttachmentFile(
    new File([new Uint8Array([2])], 'drop.png', { type: 'image/png' }),
    { draftSessionKey: sessionKey },
  );

  await pruneDraftAttachmentsForContent(sessionKey, `![keep](${keep.url})`);
  assert.ok(await getDraftAttachmentBlob(keep.filename));
  assert.equal(await getDraftAttachmentBlob(drop.filename), null);

  await clearDraftAttachmentSession(sessionKey);
  assert.equal(await getDraftAttachmentBlob(keep.filename), null);
}

async function testDraftPromotionDoesNotCreateAttachmentRefsUntilOwnerPersistsThem() {
  await resetDb();

  const sessionKey = createDraftAttachmentSessionKey();
  const saved = await saveLocalAttachmentFile(
    new File([new Uint8Array([1, 2])], 'draft.png', { type: 'image/png' }),
    { draftSessionKey: sessionKey },
  );

  await promoteDraftAttachmentsForContent(sessionKey, `![draft](${saved.url})`);

  assert.deepEqual(await getAllAttachmentRefs(), []);
}

testBuildLocalAttachmentPathEncodesFilename();
testCreateLocalAttachmentFilenameKeepsReadableSuffix();
await testSaveLocalAttachmentFileStoresBlobAndReturnsImagesPath();
await testSaveLocalAttachmentFileKeepsDraftUploadsOutOfPermanentStoreUntilPromoted();
await testPruneAndClearDraftAttachmentsRemoveUnusedDraftBlobs();
await testDraftPromotionDoesNotCreateAttachmentRefsUntilOwnerPersistsThem();

console.log('localAttachments.spec passed');
