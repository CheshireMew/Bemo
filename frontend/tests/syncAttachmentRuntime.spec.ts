import assert from 'node:assert/strict';

import { replaceNoteAttachmentRefsForScope } from '../src/domain/attachments/attachmentRefStorage.js';
import { prepareOutboundChanges, hydrateInboundAttachments } from '../src/domain/sync/syncAttachmentRuntime.js';
import { getAttachmentBlob, getBlobIndexRecord, putAttachmentBlob } from '../src/domain/attachments/blobStorage.js';
import { putCachedNote } from '../src/domain/notes/notesStorage.js';
import { installMemoryIndexedDb } from './memoryIndexedDb.js';

installMemoryIndexedDb();

async function resetDb() {
  indexedDB.deleteDatabase('bemo-offline');
}

async function testPrepareOutboundChangesIncludesAttachmentMetadataAndUploadsBlob() {
  await resetDb();

  const note = {
    note_id: 'note-1',
    revision: 1,
    filename: '2026-03-18/note-1.md',
    title: 'note',
    created_at: 1710000000,
    updated_at: 1710000000,
    content: '正文\n\n![cover](/images/cover.png)',
    tags: [],
    pinned: false,
  };
  await putCachedNote(note);
  await replaceNoteAttachmentRefsForScope('active', [note]);
  await putAttachmentBlob({
    filename: 'cover.png',
    blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }),
    mimeType: 'image/png',
  });

  const uploaded = new Map<string, Uint8Array>();
  const transport = {
    async hasBlob(blobHash: string) {
      return uploaded.has(blobHash);
    },
    async putBlob(blobHash: string, data: Uint8Array) {
      uploaded.set(blobHash, Uint8Array.from(data));
    },
  };

  const outbound = await prepareOutboundChanges([{
    operation_id: 'op-1',
    device_id: 'device-1',
    entity_id: 'note-1',
    target: 'server',
    type: 'note.update',
    base_revision: 1,
    timestamp: '2026-03-18T00:00:00.000Z',
    payload: {
      filename: note.filename,
      content: note.content,
      tags: [],
    },
    createdAt: 1,
  }], transport as never);

  assert.equal(outbound.length, 1);
  const attachments = outbound[0]!.payload.attachments as Array<Record<string, string>>;
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0]!.filename, 'cover.png');
  assert.equal(attachments[0]!.mime_type, 'image/png');
  assert.ok(typeof attachments[0]!.blob_hash === 'string' && attachments[0]!.blob_hash.startsWith('sha256:'));
  assert.equal(uploaded.size, 1);
}

async function testHydrateInboundAttachmentsStoresBlobAndIndex() {
  await resetDb();

  const blobHash = 'sha256:test-cover';
  const transport = {
    async getBlob(requestedHash: string) {
      assert.equal(requestedHash, blobHash);
      return new Uint8Array([9, 8, 7]);
    },
  };

  await hydrateInboundAttachments([{
    payload: {
      attachments: [{
        blob_hash: blobHash,
        filename: 'cover.png',
        mime_type: 'image/png',
      }],
    },
  }], transport as never);

  const blob = await getAttachmentBlob('cover.png');
  assert.ok(blob);
  assert.equal(blob?.type, 'image/png');
  assert.equal(blob?.size, 3);

  const index = await getBlobIndexRecord(blobHash);
  assert.ok(index);
  assert.equal(index?.filename, 'cover.png');
}

await testPrepareOutboundChangesIncludesAttachmentMetadataAndUploadsBlob();
await testHydrateInboundAttachmentsStoresBlobAndIndex();

console.log('syncAttachmentRuntime.spec passed');
