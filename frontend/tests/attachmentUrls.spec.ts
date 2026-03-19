import assert from 'node:assert/strict';

import { renderMarkdownToHtml } from '../src/utils/markdownRenderer.js';
import { clearAttachmentUrlCache, resolveAttachmentUrl } from '../src/utils/attachmentUrls.js';
import {
  getAttachmentBlob,
  putAttachmentBlob,
  putDraftAttachmentBlob,
  replaceAttachmentRefsForOwner,
} from '../src/utils/db.js';
import { collectSyncAttachments, ensureLocalAttachment } from '../src/utils/syncAttachments.js';
import { installMemoryIndexedDb } from './memoryIndexedDb.js';

installMemoryIndexedDb();

let objectUrlCounter = 0;
const revokedUrls: string[] = [];

Object.assign(globalThis, {
  URL: {
    ...URL,
    createObjectURL(blob: Blob) {
      objectUrlCounter += 1;
      return `blob:local/${objectUrlCounter}/${blob.size}`;
    },
    revokeObjectURL(url: string) {
      revokedUrls.push(url);
    },
  },
});

async function resetDb() {
  indexedDB.deleteDatabase('bemo-offline');
  clearAttachmentUrlCache();
  objectUrlCounter = 0;
  revokedUrls.length = 0;
}

async function testEnsureLocalAttachmentStoresBlobInFrontendDb() {
  await resetDb();
  const bytes = new Uint8Array([1, 2, 3, 4]);
  await ensureLocalAttachment('test.png', bytes, 'sha256:test', 'image/png');

  const blob = await getAttachmentBlob('test.png');
  assert.ok(blob);
  assert.equal(blob.type, 'image/png');
  assert.equal(blob.size, 4);
}

async function testResolveAttachmentUrlPrefersLocalBlob() {
  await resetDb();
  await putAttachmentBlob({
    filename: 'cover.png',
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    mimeType: 'image/png',
  });

  const url = await resolveAttachmentUrl('/images/cover.png');
  assert.equal(url, 'blob:local/1/3');
}

async function testResolveAttachmentUrlDoesNotFallbackWithoutBackendConfig() {
  await resetDb();
  const url = await resolveAttachmentUrl('/images/missing.png');
  assert.equal(url, '');
}

async function testResolveAttachmentUrlSupportsDraftAttachmentBlobs() {
  await resetDb();
  await putDraftAttachmentBlob({
    sessionKey: 'draft-session',
    filename: 'draft.png',
    blob: new Blob([new Uint8Array([4, 5])], { type: 'image/png' }),
    mimeType: 'image/png',
  });

  const url = await resolveAttachmentUrl('/images/draft.png');
  assert.equal(url, 'blob:local/1/2');
}

async function testMarkdownRenderingUsesResolvedLocalAttachmentUrls() {
  await resetDb();
  await putAttachmentBlob({
    filename: 'inline.png',
    blob: new Blob([new Uint8Array([9, 9])], { type: 'image/png' }),
    mimeType: 'image/png',
  });

  const html = String(await renderMarkdownToHtml('![alt](/images/inline.png)'));
  assert.match(html, /src="blob:local\/1\/2#bemo-original=%2Fimages%2Finline\.png"/);
}

async function testCollectSyncAttachmentsDecodesEncodedFilenames() {
  await resetDb();
  await putAttachmentBlob({
    filename: 'hello world.png',
    blob: new Blob([new Uint8Array([5, 6, 7])], { type: 'image/png' }),
    mimeType: 'image/png',
  });

  const attachments = await collectSyncAttachments('![cover](/images/hello%20world.png)');
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0]?.filename, 'hello world.png');
  assert.equal(attachments[0]?.data.byteLength, 3);
}

async function testCollectSyncAttachmentsPrefersAttachmentRefsForKnownNote() {
  await resetDb();
  await putAttachmentBlob({
    filename: 'cover image.png',
    blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }),
    mimeType: 'image/png',
  });
  await replaceAttachmentRefsForOwner({
    ownerType: 'note',
    ownerId: 'note-1',
    noteId: 'note-1',
    scope: 'active',
    filenames: ['cover image.png'],
  });

  const attachments = await collectSyncAttachments('![cover](/images/cover%20image.png)', {
    noteId: 'note-1',
  });

  assert.equal(attachments.length, 1);
  assert.equal(attachments[0]?.filename, 'cover image.png');
  assert.equal(attachments[0]?.url, '/images/cover%20image.png');
  assert.equal(attachments[0]?.data.byteLength, 4);
}

async function testResolveAttachmentUrlRefreshesCachedObjectUrlAfterOverwrite() {
  await resetDb();
  await putAttachmentBlob({
    filename: 'cover.png',
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    mimeType: 'image/png',
  });
  const firstUrl = await resolveAttachmentUrl('/images/cover.png');

  await new Promise((resolve) => setTimeout(resolve, 2));
  await putAttachmentBlob({
    filename: 'cover.png',
    blob: new Blob([new Uint8Array([9, 9, 9, 9])], { type: 'image/png' }),
    mimeType: 'image/png',
  });
  const secondUrl = await resolveAttachmentUrl('/images/cover.png');

  assert.notEqual(firstUrl, secondUrl);
  assert.deepEqual(revokedUrls, [firstUrl]);
}

await testEnsureLocalAttachmentStoresBlobInFrontendDb();
await testResolveAttachmentUrlPrefersLocalBlob();
await testResolveAttachmentUrlDoesNotFallbackWithoutBackendConfig();
await testResolveAttachmentUrlSupportsDraftAttachmentBlobs();
await testMarkdownRenderingUsesResolvedLocalAttachmentUrls();
await testCollectSyncAttachmentsDecodesEncodedFilenames();
await testCollectSyncAttachmentsPrefersAttachmentRefsForKnownNote();
await testResolveAttachmentUrlRefreshesCachedObjectUrlAfterOverwrite();

console.log('attachmentUrls.spec passed');
