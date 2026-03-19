import assert from 'node:assert/strict';

import { getAttachmentBlob, getCachedNotes, getMutationLog, getSyncStateValue, putCachedNote, setSyncStateValue } from '../src/utils/db.js';
import { probeLegacyMarkdownLibrary, importLegacyMarkdownLibrary } from '../src/domain/notes/legacyMigration.js';
import { installMemoryIndexedDb } from './memoryIndexedDb.js';

installMemoryIndexedDb();

async function resetDb() {
  indexedDB.deleteDatabase('bemo-offline');
}

function installFetchMock(handler: (input: string) => Promise<{
  status: number;
  ok: boolean;
  headers?: Headers;
  json?: () => Promise<unknown>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}>) {
  Object.assign(globalThis, {
    fetch: (input: string) => handler(input).then((response) => ({
      status: response.status,
      ok: response.ok,
      headers: response.headers ?? new Headers(),
      json: response.json ?? (async () => null),
      arrayBuffer: response.arrayBuffer ?? (async () => new Uint8Array().buffer),
    })),
  });
}

async function testProbeDetectsLegacyMarkdownLibrary() {
  await resetDb();

  installFetchMock(async (input) => {
    if (input === '/api/notes/') {
      return {
        status: 200,
        ok: true,
        json: async () => ([{
          note_id: 'note-legacy-1',
          revision: 2,
          filename: '2026/03/18/legacy.md',
          title: 'legacy',
          created_at: 1710000000,
          updated_at: 1710000001,
          content: 'legacy body ![cover](/images/cover.png)',
          tags: ['legacy'],
          pinned: true,
        }]),
      };
    }

    return {
      status: 200,
      ok: true,
      json: async () => ([]),
    };
  });

  const preview = await probeLegacyMarkdownLibrary();
  assert.equal(preview.available, true);
  assert.equal(preview.noteCount, 1);
  assert.equal(preview.attachmentCount, 1);
}

async function testImportMigratesLegacyNotesAndAttachments() {
  await resetDb();
  await setSyncStateValue('server_cursor', '123');
  await putCachedNote({
    note_id: 'temp-note',
    revision: 1,
    filename: 'temp.md',
    title: 'temp',
    created_at: 1710000000,
    updated_at: 1710000000,
    content: 'temp',
    tags: [],
    pinned: false,
  });
  indexedDB.deleteDatabase('bemo-offline');

  installFetchMock(async (input) => {
    if (input === '/images/cover.png') {
      return {
        status: 200,
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
      };
    }

    return {
      status: 404,
      ok: false,
      json: async () => ([]),
    };
  });

  const preview = {
    available: true,
    notes: [{
      note_id: 'note-legacy-1',
      revision: 1,
      filename: '2026/03/18/legacy.md',
      title: 'legacy',
      created_at: 1710000000,
      updated_at: 1710000001,
      content: 'legacy body ![cover](/images/cover.png)',
      tags: ['legacy'],
      pinned: false,
    }],
    trash: [],
    noteCount: 1,
    trashCount: 0,
    attachmentCount: 1,
  };

  const result = await importLegacyMarkdownLibrary(preview);
  const notes = await getCachedNotes();
  const blob = await getAttachmentBlob('cover.png');

  assert.equal(result.importedNotes, 1);
  assert.equal(result.importedAttachments, 1);
  assert.equal(notes.length, 1);
  assert.ok(blob);
  assert.equal((await getMutationLog()).length, 0);
  assert.equal(await getSyncStateValue('server_cursor'), null);
}

async function testProbeSkipsWhenLocalDatabaseAlreadyHasNotes() {
  await resetDb();
  await putCachedNote({
    note_id: 'note-local-1',
    revision: 1,
    filename: 'local.md',
    title: 'local',
    created_at: 1710000000,
    updated_at: 1710000000,
    content: 'local body',
    tags: [],
    pinned: false,
  });

  installFetchMock(async () => {
    throw new Error('fetch should not be called');
  });

  const preview = await probeLegacyMarkdownLibrary();
  assert.equal(preview.available, false);
}

await testProbeDetectsLegacyMarkdownLibrary();
await testImportMigratesLegacyNotesAndAttachments();
await testProbeSkipsWhenLocalDatabaseAlreadyHasNotes();

console.log('legacyMigration.spec passed');
