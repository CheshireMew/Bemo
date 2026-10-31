import assert from 'node:assert/strict';
import { setRuntimeConfigOverride } from '../src/config.js';
import { settings } from '../src/domain/settings/settingsState.js';
import { createBackendNote, listBackendNotes, patchBackendNote, restoreBackendTrashNote, trashBackendNote, updateBackendNote } from '../src/domain/notes/backendNotesApi.js';
import { putDraftAttachmentBlob } from '../src/domain/attachments/blobStorage.js';
import { finalizeDraftAttachments } from '../src/domain/appStore/attachmentsAdapter.js';
import { createNote } from '../src/domain/appStore/notesAdapter.js';
import { flushPendingQueue } from '../src/domain/sync/syncCoordinator.js';
import { getPendingChanges } from '../src/domain/sync/syncQueue.js';
import { getSyncState } from '../src/domain/sync/syncStatusBus.js';
import { clearScheduledSync } from '../src/domain/sync/syncScheduler.js';
import { withBackendServer } from './backendServerHarness.js';
import { installMemoryIndexedDb } from './memoryIndexedDb.js';

installMemoryIndexedDb();
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
Object.assign(globalThis, { window: { __TAURI_INTERNALS__: {}, setTimeout: () => 1, clearTimeout: () => {} }, document: { visibilityState: 'hidden' } });

await withBackendServer('app', hosted => withBackendServer('app', async desktop => {
  const useDesktop = () => {
    setRuntimeConfigOverride({ appStorageMode: 'backend', apiBase: desktop.baseUrl });
    Object.assign(settings.sync, { mode: 'server', serverUrl: hosted.baseUrl, accessToken: hosted.syncToken });
  };
  const sync = async () => {
    const result = await flushPendingQueue();
    assert.equal(result.status, 'completed', JSON.stringify(result));
    return result;
  };
  useDesktop();
  await putDraftAttachmentBlob({ sessionKey: 'desktop-draft', filename: 'desktop.png', blob: new Blob([new Uint8Array([4, 5, 6])]), mimeType: 'image/png' });
  const content = 'desktop image\n\n![image](/images/desktop.png)';
  await finalizeDraftAttachments('desktop-draft', content);
  const created = await createNote({ content, tags: ['desktop'] });
  await sync();

  // No hosted browser or frontend sync engine is running: only HTTP services.
  setRuntimeConfigOverride({ appStorageMode: 'backend', apiBase: hosted.baseUrl });
  settings.sync.mode = 'local';
  assert.equal((await listBackendNotes())[0]?.content, content);
  assert.deepEqual([...new Uint8Array(await (await fetch(`${hosted.baseUrl}/images/desktop.png`)).arrayBuffer())], [4, 5, 6]);
  await updateBackendNote(created.note_id, { base_revision: (await listBackendNotes()).find(n => n.note_id === created.note_id)!.revision, base_edit_version: (await listBackendNotes()).find(n => n.note_id === created.note_id)!.edit_version!, content: 'web edit', tags: ['web'] });
  useDesktop();
  await sync();
  assert.equal((await listBackendNotes()).find(n => n.note_id === created.note_id)?.content, 'web edit');
  assert.deepEqual((await listBackendNotes()).find(n => n.note_id === created.note_id)?.tags, ['web']);
  console.log('PASS independent desktop and hosted app services exchange notes and attachment bytes without a hosted browser');

  // An existing installation may have configured its own hosted URL as target.
  setRuntimeConfigOverride({ appStorageMode: 'backend', apiBase: hosted.baseUrl });
  Object.assign(settings.sync, { mode: 'server', serverUrl: hosted.baseUrl, accessToken: hosted.syncToken });
  await patchBackendNote(created.note_id, { base_revision: (await listBackendNotes()).find(n => n.note_id === created.note_id)!.revision, base_edit_version: (await listBackendNotes()).find(n => n.note_id === created.note_id)!.edit_version!, pinned: true });
  await updateBackendNote(created.note_id, { base_revision: (await listBackendNotes()).find(n => n.note_id === created.note_id)!.revision, base_edit_version: (await listBackendNotes()).find(n => n.note_id === created.note_id)!.edit_version!, content: 'own hosted endpoint', tags: ['self'] });
  await sync(); await sync();
  settings.sync.mode = 'local';
  await trashBackendNote(created.note_id);
  settings.sync.mode = 'server';
  const ownTrash = await sync();
  if (ownTrash.status === 'completed') assert.equal(ownTrash.conflicts, 0);
  settings.sync.mode = 'local';
  await restoreBackendTrashNote(created.note_id);
  settings.sync.mode = 'server';
  const ownRestore = await sync();
  if (ownRestore.status === 'completed') assert.equal(ownRestore.conflicts, 0);
  assert.equal((await listBackendNotes()).length, 1);
  assert.equal((await listBackendNotes())[0]?.content, 'own hosted endpoint');
  assert.equal((await getPendingChanges('server')).length, 0);
  assert.equal(getSyncState().error, '');
  console.log('PASS the hosted app recognizes its own sync endpoint without replay conflicts');

  useDesktop();
  await sync();
  assert.equal((await listBackendNotes()).find(n => n.note_id === created.note_id)?.content, 'own hosted endpoint');
  assert.equal((await listBackendNotes()).find(n => n.note_id === created.note_id)?.pinned, true);
  settings.sync.serverUrl = 'http://127.0.0.1:1';
  const offline = await createBackendNote({ content: 'saved while server unavailable', tags: [] });
  const failed = await flushPendingQueue();
  assert.equal(failed.status, 'failed');
  assert.equal((await listBackendNotes()).find(n => n.note_id === offline.note_id)?.content, 'saved while server unavailable');
  assert.ok((await getPendingChanges('server')).some(change => change.entity_id === offline.note_id));
  console.log('PASS an unavailable remote never prevents saving to the Windows local database');
  clearScheduledSync();
}));
console.log('serverDeploymentSync.spec passed');
