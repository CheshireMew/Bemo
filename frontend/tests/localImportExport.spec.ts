import assert from 'node:assert/strict';
import JSZip from 'jszip';

import {
  applyBackupPayload,
  buildBackupArchiveBlob,
  buildBackupPayload,
  clearAllLocalExperimentData,
  cleanupOrphanAttachments,
  importFlomoArchive,
  importBackupArchive,
  resetAppToFirstInstallState,
} from '../src/domain/importExport/localImportExport.js';
import {
  updateLocalNote,
} from '../src/domain/notes/localNoteMutations.js';
import {
  deleteLocalNote,
  permanentlyDeleteLocalTrashNote,
  restoreLocalTrashNote,
} from '../src/domain/notes/localTrashMutations.js';
import {
  getAttachmentBlob,
  getBlobIndexRecord,
  getDraftAttachmentBlob,
  putAttachmentBlob,
  putBlobIndexRecord,
  putDraftAttachmentBlob,
} from '../src/domain/attachments/blobStorage.js';
import {
  getAllAttachmentRefs,
  getAttachmentReferenceSummary,
  replaceNoteAttachmentRefsForScope,
  type AttachmentRefRecord,
} from '../src/domain/attachments/attachmentRefStorage.js';
import { getCachedNotes, putCachedNote } from '../src/domain/notes/notesStorage.js';
import { setTrashNotes } from '../src/domain/notes/trashStorage.js';
import { getConflicts } from '../src/domain/sync/conflictStorage.js';
import { getMutationLog } from '../src/domain/sync/mutationLogStorage.js';
import { enqueueDeviceChange } from '../src/domain/sync/mutationLogRuntime.js';
import { getSyncStateValue, setSyncStateValue } from '../src/domain/sync/syncStateStorage.js';
import { addConflict } from '../src/domain/sync/conflictStorage.js';
import { installMemoryIndexedDb } from './memoryIndexedDb.js';

installMemoryIndexedDb();

if (typeof localStorage === 'undefined') {
  const store = new Map<string, string>();
  Object.assign(globalThis, {
    localStorage: {
      getItem(key: string) {
        return store.has(key) ? store.get(key)! : null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
      key(index: number) {
        return Array.from(store.keys())[index] ?? null;
      },
      get length() {
        return store.size;
      },
      removeItem(key: string) {
        store.delete(key);
      },
      clear() {
        store.clear();
      },
    },
  });
}

async function resetDb() {
  indexedDB.deleteDatabase('bemo-offline');
  localStorage.clear();
}

async function testBuildBackupPayloadIncludesLocalAttachments() {
  await resetDb();
  await putCachedNote({
    note_id: 'note-1',
    revision: 1,
    filename: '2026-03-18/note-1.md',
    title: 'note',
    created_at: 1710000000,
    updated_at: 1710000000,
    content: '![cover](/images/cover.png)',
    tags: [],
    pinned: false,
  });
  await setTrashNotes([]);
  await putAttachmentBlob({
    filename: 'cover.png',
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    mimeType: 'image/png',
  });
  await putAttachmentBlob({
    filename: 'orphan.png',
    blob: new Blob([new Uint8Array([9])], { type: 'image/png' }),
    mimeType: 'image/png',
  });

  const payload = await buildBackupPayload();

  assert.equal(payload.version, 2);
  assert.equal(payload.attachments?.length, 1);
  assert.equal(payload.attachments?.[0]?.filename, 'cover.png');
  assert.deepEqual(payload.attachments?.[0]?.data, [1, 2, 3]);
}

async function testBuildBackupArchiveStoresAttachmentsOutsideJsonManifest() {
  await resetDb();
  await putCachedNote({
    note_id: 'note-1',
    revision: 1,
    filename: '2026-03-18/note-1.md',
    title: 'note',
    created_at: 1710000000,
    updated_at: 1710000000,
    content: '![cover](/images/cover.png)',
    tags: [],
    pinned: false,
  });
  await setTrashNotes([]);
  await putAttachmentBlob({
    filename: 'cover.png',
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    mimeType: 'image/png',
  });
  await putAttachmentBlob({
    filename: 'orphan.png',
    blob: new Blob([new Uint8Array([4])], { type: 'image/png' }),
    mimeType: 'image/png',
  });

  const archive = await buildBackupArchiveBlob();
  const zip = await JSZip.loadAsync(await archive.arrayBuffer());
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
  const attachment = await zip.file('attachments/cover.png')!.async('uint8array');
  const orphan = zip.file('attachments/orphan.png');

  assert.equal(manifest.version, 3);
  assert.equal(manifest.attachments.length, 1);
  assert.equal(manifest.attachments[0].path, 'attachments/cover.png');
  assert.deepEqual(Array.from(attachment), [1, 2, 3]);
  assert.equal(orphan, null);
}

async function testApplyBackupPayloadRestoresAttachmentsFromVersion2Backup() {
  await resetDb();

  const result = await applyBackupPayload({
    format: 'bemo-backup',
    version: 2,
    exported_at: '2026-03-18T00:00:00.000Z',
    notes: [{
      note_id: 'note-1',
      revision: 1,
      filename: '2026-03-18/note-1.md',
      title: 'note',
      created_at: 1710000000,
      updated_at: 1710000000,
      content: '![cover](/images/cover.png)',
      tags: [],
      pinned: false,
    }],
    trash: [],
    attachments: [{
      filename: 'cover.png',
      mime_type: 'image/png',
      data: [9, 8, 7, 6],
    }],
  });

  assert.equal(result.imported_notes, 1);
  assert.equal(result.imported_images, 1);

  const notes = await getCachedNotes();
  assert.equal(notes.length, 1);

  const blob = await getAttachmentBlob('cover.png');
  assert.ok(blob);
  assert.equal(blob.type, 'image/png');
  assert.equal(blob.size, 4);
}

async function testApplyBackupPayloadKeepsVersion1Compatibility() {
  await resetDb();

  const result = await applyBackupPayload({
    format: 'bemo-backup',
    version: 1,
    exported_at: '2026-03-18T00:00:00.000Z',
    notes: [],
    trash: [],
  });

  assert.equal(result.imported_notes, 0);
  assert.equal(result.imported_images, 0);
}

async function testImportBackupArchiveRestoresAttachmentsFromZip() {
  await resetDb();

  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({
    format: 'bemo-backup',
    version: 3,
    exported_at: '2026-03-18T00:00:00.000Z',
    notes: [{
      note_id: 'note-1',
      revision: 1,
      filename: '2026-03-18/note-1.md',
      title: 'note',
      created_at: 1710000000,
      updated_at: 1710000000,
      content: '![cover](/images/cover.png)',
      tags: [],
      pinned: false,
    }],
    trash: [],
    attachments: [{
      filename: 'cover.png',
      mime_type: 'image/png',
      path: 'attachments/cover.png',
    }],
  }));
  zip.file('attachments/cover.png', new Uint8Array([9, 8, 7, 6]));

  const file = new File(
    [await zip.generateAsync({ type: 'arraybuffer' })],
    'bemo_backup.zip',
    { type: 'application/zip' },
  );

  const result = await importBackupArchive(file);

  assert.equal(result.imported_notes, 1);
  assert.equal(result.imported_images, 1);

  const notes = await getCachedNotes();
  assert.equal(notes.length, 1);

  const blob = await getAttachmentBlob('cover.png');
  assert.ok(blob);
  assert.equal(blob.type, 'image/png');
  assert.equal(blob.size, 4);
}

async function testApplyBackupPayloadResetsSyncRuntimeState() {
  await resetDb();
  await setSyncStateValue('server_cursor', '123');
  await setSyncStateValue('webdav_cursor', '456');
  await setSyncStateValue('server_last_sync_at', '2026-03-18T00:00:00.000Z');
  await setSyncStateValue('webdav_last_sync_at', '2026-03-18T00:00:00.000Z');
  await addConflict('server', {
    note_id: 'note-stale',
    operation_id: 'op-stale',
    reason: 'revision_conflict',
  });
  await putCachedNote({
    note_id: 'note-local',
    revision: 1,
    filename: '2026-03-17/local.md',
    title: 'local',
    created_at: 1710000000,
    updated_at: 1710000000,
    content: 'local',
    tags: [],
    pinned: false,
  });

  const importResult = await applyBackupPayload({
    format: 'bemo-backup',
    version: 2,
    exported_at: '2026-03-18T00:00:00.000Z',
    notes: [{
      note_id: 'note-imported',
      revision: 1,
      filename: '2026-03-18/imported.md',
      title: 'imported',
      created_at: 1710000001,
      updated_at: 1710000001,
      content: 'imported',
      tags: [],
      pinned: false,
    }],
    trash: [],
    attachments: [],
  });

  assert.deepEqual(importResult.imported_note_records, []);
  assert.equal((await getMutationLog()).length, 0);
  assert.equal((await getConflicts()).length, 0);
  assert.equal(await getSyncStateValue('server_cursor'), null);
  assert.equal(await getSyncStateValue('webdav_cursor'), null);
  assert.equal(await getSyncStateValue('server_last_sync_at'), null);
  assert.equal(await getSyncStateValue('webdav_last_sync_at'), null);
  assert.deepEqual(
    (await getAllAttachmentRefs())
      .filter((item: AttachmentRefRecord) => item.scope === 'active')
      .map((item: AttachmentRefRecord) => item.filename),
    [],
  );
}

async function testCleanupOrphanImagesOnlyDeletesUnreferencedLocalAttachments() {
  await resetDb();
  await putCachedNote({
    note_id: 'note-1',
    revision: 1,
    filename: '2026-03-18/note-1.md',
    title: 'note',
    created_at: 1710000000,
    updated_at: 1710000000,
    content: '![cover](/images/keep.png)',
    tags: [],
    pinned: false,
  });
  await setTrashNotes([]);
  await putAttachmentBlob({
    filename: 'keep.png',
    blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
    mimeType: 'image/png',
  });
  await putAttachmentBlob({
    filename: 'orphan.png',
    blob: new Blob([new Uint8Array([2, 3])], { type: 'image/png' }),
    mimeType: 'image/png',
  });
  await putBlobIndexRecord({
    blobHash: 'sha256:keep',
    filename: 'keep.png',
    mimeType: 'image/png',
    size: 1,
  });
  await putBlobIndexRecord({
    blobHash: 'sha256:orphan',
    filename: 'orphan.png',
    mimeType: 'image/png',
    size: 2,
  });

  const result = await cleanupOrphanAttachments();

  assert.equal(result.deleted_count, 1);
  assert.deepEqual(result.deleted_files, ['orphan.png']);
  assert.ok(await getAttachmentBlob('keep.png'));
  assert.equal(await getAttachmentBlob('orphan.png'), null);
  assert.ok(await getBlobIndexRecord('sha256:keep'));
  assert.equal(await getBlobIndexRecord('sha256:orphan'), null);
}

async function testCleanupOrphanImagesKeepsDraftAndPendingMutationAttachments() {
  await resetDb();
  localStorage.setItem('bemo.editor.draft:compose', JSON.stringify({
    content: '![draft](/images/draft.png)',
  }));
  localStorage.setItem('bemo.editor.draft:note:abc', JSON.stringify({
    content: '![draft-note](/images/draft-note.png)',
  }));
  await putDraftAttachmentBlob({
    sessionKey: 'draft-session',
    filename: 'draft.png',
    blob: new Blob([new Uint8Array([7])], { type: 'image/png' }),
    mimeType: 'image/png',
  });
  await putDraftAttachmentBlob({
    sessionKey: 'draft-note-session',
    filename: 'draft-note.png',
    blob: new Blob([new Uint8Array([6])], { type: 'image/png' }),
    mimeType: 'image/png',
  });
  await putAttachmentBlob({
    filename: 'queued.png',
    blob: new Blob([new Uint8Array([8])], { type: 'image/png' }),
    mimeType: 'image/png',
  });
  await putAttachmentBlob({
    filename: 'orphan.png',
    blob: new Blob([new Uint8Array([9])], { type: 'image/png' }),
    mimeType: 'image/png',
  });
  await enqueueDeviceChange({
    target: 'server',
    entityId: 'note-queued',
    type: 'note.create',
    baseRevision: 0,
    payload: {
      content: '![queued](/images/queued.png)',
    },
  });

  const result = await cleanupOrphanAttachments();

  assert.equal(result.deleted_count, 1);
  assert.deepEqual(result.deleted_files, ['orphan.png']);
  assert.ok(await getDraftAttachmentBlob('draft.png'));
  assert.ok(await getDraftAttachmentBlob('draft-note.png'));
  assert.ok(await getAttachmentBlob('queued.png'));
  localStorage.removeItem('bemo.editor.draft:compose');
  localStorage.removeItem('bemo.editor.draft:note:abc');
}

async function testApplyBackupPayloadRebuildsAttachmentRefs() {
  await resetDb();

  await applyBackupPayload({
    format: 'bemo-backup',
    version: 2,
    exported_at: '2026-03-18T00:00:00.000Z',
    notes: [{
      note_id: 'note-1',
      revision: 1,
      filename: '2026-03-18/note-1.md',
      title: 'note',
      created_at: 1710000000,
      updated_at: 1710000000,
      content: '![cover](/images/cover.png)',
      tags: [],
      pinned: false,
    }],
    trash: [{
      note_id: 'note-2',
      revision: 1,
      filename: '2026-03-17/note-2.md',
      title: 'trash',
      created_at: 1710000000,
      updated_at: 1710000000,
      content: '![trash](/images/trash.png)',
      tags: [],
      pinned: false,
    }],
    attachments: [],
  });

  const refs = await getAllAttachmentRefs();
  assert.deepEqual(
    refs.map((item: AttachmentRefRecord) => ({ filename: item.filename, scope: item.scope, note_id: item.note_id }))
      .sort((a: { filename: string }, b: { filename: string }) => a.filename.localeCompare(b.filename)),
    [
      { filename: 'cover.png', scope: 'active', note_id: 'note-1' },
      { filename: 'trash.png', scope: 'trash', note_id: 'note-2' },
    ],
  );

  const summary = await getAttachmentReferenceSummary();
  assert.equal(summary.activeAttachments, 1);
  assert.equal(summary.trashAttachments, 1);
  assert.equal(summary.totalReferencedAttachments, 2);
}

async function testImportFlomoZipRestoresNotesAndAttachments() {
  await resetDb();

  const zip = new JSZip();
  zip.file('flomo@user-20260315/柴郡Cheshire的笔记.html', `
    <html>
      <body>
        <div class="memos">
          <div class="memo">
            <div class="time">2026-03-13 05:12:36</div>
            <div class="content"><p>第一条</p><p>第二段</p></div>
            <div class="files">
              <img src="file/2025-05-13/2189739/demo.png" alt="memo image" />
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
  zip.file('flomo@user-20260315/file/2025-05-13/2189739/demo.png', new Uint8Array([1, 2, 3, 4]));

  const file = new File(
    [await zip.generateAsync({ type: 'arraybuffer' })],
    'flomo@user-20260315.zip',
    { type: 'application/zip' },
  );

  const result = await importFlomoArchive(file);

  assert.equal(result.imported_count, 1);
  assert.equal(result.imported_attachment_count, 1);

  const notes = await getCachedNotes();
  assert.equal(notes.length, 1);
  assert.match(notes[0]!.content, /第一条/);
  assert.match(notes[0]!.content, /第二段/);
  assert.match(notes[0]!.content, /!\[[^\]]+\]\(\/images\/.+\.png\)/);

  const refs = await getAllAttachmentRefs();
  assert.equal(refs.length, 1);

  const importedFilename = refs[0]!.filename;
  const blob = await getAttachmentBlob(importedFilename);
  assert.ok(blob);
  assert.equal(blob?.type, 'image/png');
  assert.equal(blob?.size, 4);
}

async function testImportFlomoZipRestoresAudioAndTranscript() {
  await resetDb();

  const zip = new JSZip();
  zip.file('flomo@user-20260315/audio.html', `
    <html>
      <body>
        <div class="memos">
          <div class="memo">
            <div class="time">2026-03-14 10:30:00</div>
            <div class="content">
              <p>语音 memo</p>
              <div class="audio-player">
                <audio controls>
                  <source src="file/2025-05-13/2189739/demo.m4a" type="audio/mp4" />
                </audio>
                <div class="audio-player__content">这里是转录文本</div>
              </div>
            </div>
            <div class="files"></div>
          </div>
        </div>
      </body>
    </html>
  `);
  zip.file('flomo@user-20260315/file/2025-05-13/2189739/demo.m4a', new Uint8Array([7, 8, 9]));

  const file = new File(
    [await zip.generateAsync({ type: 'arraybuffer' })],
    'flomo-audio.zip',
    { type: 'application/zip' },
  );

  const result = await importFlomoArchive(file);

  assert.equal(result.imported_count, 1);
  assert.equal(result.imported_attachment_count, 1);

  const notes = await getCachedNotes();
  assert.equal(notes.length, 1);
  assert.match(notes[0]!.content, /语音 memo/);
  assert.match(notes[0]!.content, /\[[^\]]+\.m4a\]\(\/images\/.+\.m4a\)/);
  assert.match(notes[0]!.content, /音频转录/);
  assert.match(notes[0]!.content, /这里是转录文本/);

  const refs = await getAllAttachmentRefs();
  assert.equal(refs.length, 1);
  const blob = await getAttachmentBlob(refs[0]!.filename);
  assert.ok(blob);
  assert.equal(blob?.type, 'audio/mp4');
}

async function testImportedFlomoNoteCanBeEditedWithoutLosingAttachmentRefs() {
  await resetDb();

  const zip = new JSZip();
  zip.file('flomo@user-20260315/notes.html', `
    <html>
      <body>
        <div class="memos">
          <div class="memo">
            <div class="time">2026-03-13 05:12:36</div>
            <div class="content"><p>原始正文</p></div>
            <div class="files">
              <img src="file/2025-05-13/2189739/demo.png" alt="memo image" />
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
  zip.file('flomo@user-20260315/file/2025-05-13/2189739/demo.png', new Uint8Array([1, 2, 3, 4]));

  const file = new File(
    [await zip.generateAsync({ type: 'arraybuffer' })],
    'flomo@user-20260315.zip',
    { type: 'application/zip' },
  );

  await importFlomoArchive(file);

  const imported = (await getCachedNotes())[0]!;
  await updateLocalNote(imported.note_id, {
    content: `${imported.content}\n\n补充一段编辑后的内容`,
    tags: [],
  });

  const notes = await getCachedNotes();
  assert.equal(notes.length, 1);
  assert.match(notes[0]!.content, /补充一段编辑后的内容/);

  const refs = await getAllAttachmentRefs();
  assert.equal(refs.length, 1);
  const blob = await getAttachmentBlob(refs[0]!.filename);
  assert.ok(blob);
}

async function testTrashRestoreAndPermanentDeleteHandleAttachmentRefsAndBlobs() {
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
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    mimeType: 'image/png',
  });
  await putBlobIndexRecord({
    blobHash: 'sha256:cover',
    filename: 'cover.png',
    mimeType: 'image/png',
    size: 3,
  });

  await deleteLocalNote('note-1');
  let refs = await getAllAttachmentRefs();
  assert.deepEqual(refs.map((item: AttachmentRefRecord) => item.scope), ['trash']);

  await restoreLocalTrashNote('note-1');
  refs = await getAllAttachmentRefs();
  assert.deepEqual(refs.map((item: AttachmentRefRecord) => item.scope), ['active']);

  await deleteLocalNote('note-1');
  await permanentlyDeleteLocalTrashNote('note-1');

  assert.equal((await getAllAttachmentRefs()).length, 0);
  assert.equal(await getAttachmentBlob('cover.png'), null);
  assert.equal(await getBlobIndexRecord('sha256:cover'), null);
}

async function testClearAllLocalExperimentDataRemovesNotesAttachmentsAndSyncState() {
  await resetDb();
  localStorage.setItem('bemo.editor.draft:compose', JSON.stringify({ content: 'draft' }));

  await putCachedNote({
    note_id: 'note-1',
    revision: 1,
    filename: '2026-03-18/note-1.md',
    title: 'note',
    created_at: 1710000000,
    updated_at: 1710000000,
    content: '![cover](/images/cover.png)',
    tags: [],
    pinned: false,
  });
  await setTrashNotes([{
    note_id: 'trash-1',
    revision: 1,
    filename: '2026-03-17/trash-1.md',
    title: 'trash',
    created_at: 1710000000,
    updated_at: 1710000000,
    content: 'trash',
    tags: [],
    pinned: false,
  }]);
  await putAttachmentBlob({
    filename: 'cover.png',
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    mimeType: 'image/png',
  });
  await putDraftAttachmentBlob({
    sessionKey: 'draft-session',
    filename: 'draft.png',
    blob: new Blob([new Uint8Array([4])], { type: 'image/png' }),
    mimeType: 'image/png',
  });
  await putBlobIndexRecord({
    blobHash: 'sha256:cover',
    filename: 'cover.png',
    mimeType: 'image/png',
    size: 3,
  });
  await enqueueDeviceChange({
    target: 'server',
    entityId: 'note-1',
    type: 'note.create',
    baseRevision: 0,
    payload: { content: 'queued' },
  });
  await setSyncStateValue('server_cursor', 'cursor-1');
  await addConflict('server', {
    note_id: 'note-1',
    operation_id: 'op-1',
    reason: 'revision_conflict',
  });

  await clearAllLocalExperimentData();

  assert.equal((await getCachedNotes()).length, 0);
  assert.equal((await getAttachmentBlob('cover.png')), null);
  assert.equal((await getDraftAttachmentBlob('draft.png')), null);
  assert.equal((await getMutationLog()).length, 0);
  assert.equal((await getConflicts()).length, 0);
  assert.equal(await getSyncStateValue('server_cursor'), null);
  assert.equal((await getAllAttachmentRefs()).length, 0);
  assert.equal(await getBlobIndexRecord('sha256:cover'), null);
  assert.equal(localStorage.getItem('bemo.editor.draft:compose'), null);
}

async function testResetAppToFirstInstallStateRemovesSettingsAndAiConversations() {
  await resetDb();
  localStorage.setItem('bemo.settings', JSON.stringify({ sync: { mode: 'server' } }));
  localStorage.setItem('bemo.ai.conversations', JSON.stringify([{ id: 'conv-1' }]));
  localStorage.setItem('theme', 'dark');
  localStorage.setItem('external-key', 'keep');

  await resetAppToFirstInstallState();

  assert.equal(localStorage.getItem('bemo.settings'), null);
  assert.equal(localStorage.getItem('bemo.ai.conversations'), null);
  assert.equal(localStorage.getItem('theme'), null);
  assert.equal(localStorage.getItem('external-key'), 'keep');
}

await testBuildBackupPayloadIncludesLocalAttachments();
await testBuildBackupArchiveStoresAttachmentsOutsideJsonManifest();
await testApplyBackupPayloadRestoresAttachmentsFromVersion2Backup();
await testApplyBackupPayloadKeepsVersion1Compatibility();
await testImportBackupArchiveRestoresAttachmentsFromZip();
await testApplyBackupPayloadResetsSyncRuntimeState();
await testCleanupOrphanImagesOnlyDeletesUnreferencedLocalAttachments();
await testCleanupOrphanImagesKeepsDraftAndPendingMutationAttachments();
await testApplyBackupPayloadRebuildsAttachmentRefs();
await testImportFlomoZipRestoresNotesAndAttachments();
await testImportFlomoZipRestoresAudioAndTranscript();
await testImportedFlomoNoteCanBeEditedWithoutLosingAttachmentRefs();
await testTrashRestoreAndPermanentDeleteHandleAttachmentRefsAndBlobs();
await testClearAllLocalExperimentDataRemovesNotesAttachmentsAndSyncState();
await testResetAppToFirstInstallStateRemovesSettingsAndAiConversations();

console.log('localImportExport.spec passed');
