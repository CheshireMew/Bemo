import assert from 'node:assert/strict';

import { getAttachmentBlob, putAttachmentBlob } from '../src/domain/attachments/blobStorage.js';
import { replaceNoteAttachmentRefsForScope } from '../src/domain/attachments/attachmentRefStorage.js';
import { defaultSettings } from '../src/domain/settings/defaultSettings.js';
import { settings } from '../src/domain/settings/settingsState.js';
import { putCachedNote } from '../src/domain/notes/notesStorage.js';
import { listLocalNotes } from '../src/domain/notes/localNoteQueries.js';
import { enqueueDeviceChange } from '../src/domain/sync/mutationLogRuntime.js';
import { getMutationLog } from '../src/domain/sync/mutationLogStorage.js';
import { clearScheduledSync, resetRetryDelay } from '../src/domain/sync/syncScheduler.js';
import { flushPendingQueue } from '../src/domain/sync/syncCoordinator.js';
import { installMemoryIndexedDb } from './memoryIndexedDb.js';
import { withBackendServer } from './backendServerHarness.js';

installMemoryIndexedDb();

async function resetDb() {
  indexedDB.deleteDatabase('bemo-offline');
}

function resetSyncSettings(baseUrl: string, accessToken: string) {
  Object.assign(settings.sync, structuredClone(defaultSettings.sync), {
    mode: 'server',
    serverUrl: baseUrl,
    accessToken,
  });
}

async function withMockedBrowser<T>(run: () => Promise<T>) {
  const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  const originalNavigator = globalThis.navigator;

  const timeoutStub = (() => 1 as unknown as ReturnType<typeof setTimeout>) as unknown as typeof setTimeout;

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      onLine: true,
    },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      setTimeout: timeoutStub,
      clearTimeout: () => undefined,
    },
  });

  try {
    return await run();
  } finally {
    clearScheduledSync();
    resetRetryDelay();
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
  }
}

async function testFlushPendingQueueSyncsThroughRealServer() {
  await withBackendServer('server', async ({ baseUrl, syncToken }) => {
    await resetDb();
    resetSyncSettings(baseUrl, syncToken);

    const localNote = {
      note_id: 'local-sync-e2e-note',
      revision: 1,
      filename: '2026-03-26/server-sync-e2e.md',
      title: 'server sync e2e',
      created_at: 1_774_512_000,
      updated_at: 1_774_512_000,
      content: 'hello server sync\n\n![cover](/images/cover.png)',
      tags: ['sync'],
      pinned: false,
    };

    await putCachedNote(localNote);
    await replaceNoteAttachmentRefsForScope('active', [localNote]);
    await putAttachmentBlob({
      filename: 'cover.png',
      blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }),
      mimeType: 'image/png',
    });
    await enqueueDeviceChange({
      target: 'server',
      entityId: localNote.note_id,
      type: 'note.create',
      baseRevision: 0,
      payload: {
        filename: localNote.filename,
        content: localNote.content,
        tags: localNote.tags,
        pinned: localNote.pinned,
        created_at: new Date(localNote.created_at * 1000).toISOString(),
        revision: localNote.revision,
      },
    });

    await withMockedBrowser(async () => {
      await flushPendingQueue();
    });

    assert.equal((await getMutationLog('server')).length, 0);

    await resetDb();
    resetSyncSettings(baseUrl, syncToken);

    await withMockedBrowser(async () => {
      await flushPendingQueue();
    });

    const notes = await listLocalNotes();
    assert.equal(notes.length, 1);
    assert.equal(notes[0]?.note_id, localNote.note_id);
    assert.equal(notes[0]?.content, localNote.content);
    assert.deepEqual(notes[0]?.tags, ['sync']);

    const blob = await getAttachmentBlob('cover.png');
    assert.ok(blob);
    assert.equal(blob?.type, 'image/png');
    assert.equal(blob?.size, 4);
  });
}

await testFlushPendingQueueSyncsThroughRealServer();

console.log('serverSyncE2E.spec passed');
