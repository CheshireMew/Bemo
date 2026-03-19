import assert from 'node:assert/strict';
import JSZip from 'jszip';

import { buildMarkdownArchiveBlob, importMarkdownArchive } from '../src/domain/importExport/markdownArchive.js';
import { getAttachmentBlob, getCachedNotes, getTrashNotes, putAttachmentBlob, putCachedNote, putTrashNote } from '../src/utils/db.js';
import { installMemoryIndexedDb } from './memoryIndexedDb.js';

installMemoryIndexedDb();

async function resetDb() {
  indexedDB.deleteDatabase('bemo-offline');
}

async function unzip(blob: Blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return zip;
}

async function testArchiveIncludesNotesTrashAttachmentsAndManifest() {
  await resetDb();
  await putCachedNote({
    note_id: 'note-1',
    revision: 1,
    filename: '2026/03/18/note-1.md',
    title: 'First note',
    created_at: 1710000000,
    updated_at: 1710000300,
    content: '![cover](/images/cover.png)\nhello world',
    tags: ['tag-a'],
    pinned: false,
  });
  await putTrashNote({
    note_id: 'trash-1',
    revision: 2,
    filename: '2026/03/18/trash-1.md',
    title: 'Trashed note',
    created_at: 1710000400,
    updated_at: 1710000500,
    content: 'trash body',
    tags: [],
    pinned: false,
  });
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

  const archive = await buildMarkdownArchiveBlob();
  const zip = await unzip(archive);
  const noteFile = await zip.file('notes/2026/03/18/note-1.md')?.async('string');
  const trashFile = await zip.file('trash/2026/03/18/trash-1.md')?.async('string');
  const manifest = await zip.file('manifest.json')?.async('string');
  const attachment = await zip.file('attachments/cover.png')?.async('uint8array');
  const orphan = await zip.file('attachments/orphan.png')?.async('uint8array');

  assert.ok(noteFile);
  assert.ok(trashFile);
  assert.ok(manifest);
  assert.ok(attachment);
  assert.equal(orphan, undefined);
  assert.match(String(noteFile), /\.\.\/\.\.\/\.\.\/attachments\/cover\.png/);
  assert.match(String(manifest), /"format": "bemo-markdown-archive"/);
}

async function testArchiveCanRoundTripBackIntoLocalStore() {
  await resetDb();
  await putCachedNote({
    note_id: 'note-1',
    revision: 1,
    filename: '2026/03/18/note-1.md',
    title: 'First note',
    created_at: 1710000000,
    updated_at: 1710000300,
    content: '正文\n\n![cover](/images/cover.png)',
    tags: ['tag-a'],
    pinned: true,
  });
  await putTrashNote({
    note_id: 'trash-1',
    revision: 2,
    filename: '2026/03/18/trash-1.md',
    title: 'Trashed note',
    created_at: 1710000400,
    updated_at: 1710000500,
    content: '回收站正文\n\n[doc](/images/doc.pdf)',
    tags: ['tag-b'],
    pinned: false,
  });
  await putAttachmentBlob({
    filename: 'cover.png',
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    mimeType: 'image/png',
  });
  await putAttachmentBlob({
    filename: 'doc.pdf',
    blob: new Blob([new Uint8Array([9, 8, 7])], { type: 'application/pdf' }),
    mimeType: 'application/pdf',
  });

  const archive = await buildMarkdownArchiveBlob();
  await resetDb();

  const file = new File([await archive.arrayBuffer()], 'bemo_markdown_archive.zip', {
    type: 'application/zip',
  });
  const result = await importMarkdownArchive(file);

  assert.equal(result.imported_notes, 2);
  assert.equal(result.imported_images, 2);

  const notes = await getCachedNotes();
  const trash = await getTrashNotes();
  assert.equal(notes.length, 1);
  assert.equal(trash.length, 1);
  assert.match(notes[0]!.content, /!\[cover\]\(\/images\/cover\.png\)/);
  assert.match(trash[0]!.content, /\[doc\]\(\/images\/doc\.pdf\)/);
  assert.equal(notes[0]!.pinned, true);
  assert.deepEqual(notes[0]!.tags, ['tag-a']);
  assert.deepEqual(trash[0]!.tags, ['tag-b']);

  const coverBlob = await getAttachmentBlob('cover.png');
  const docBlob = await getAttachmentBlob('doc.pdf');
  assert.ok(coverBlob);
  assert.ok(docBlob);
  assert.equal(coverBlob?.type, 'image/png');
  assert.equal(docBlob?.type, 'application/pdf');
}

await testArchiveIncludesNotesTrashAttachmentsAndManifest();
await testArchiveCanRoundTripBackIntoLocalStore();

console.log('markdownArchive.spec passed');
