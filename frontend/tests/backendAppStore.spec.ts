import assert from 'node:assert/strict';
import { setRuntimeConfigOverride } from '../src/config.js';
import { applyChangesToCurrentStore as applyChangesLocally, editBackendReplica } from '../src/domain/appStore/syncReplicaAdapter.js';
import { importExternalNotes } from '../src/domain/appStore/notesAdapter.js';
import { listBackendNotes, createBackendNote, updateBackendNote, trashBackendNote, emptyBackendTrash } from '../src/domain/notes/backendNotesApi.js';
import { flushPendingQueue } from '../src/domain/sync/syncCoordinator.js';
import { getSyncState } from '../src/domain/sync/syncStatusBus.js';
import { getSyncCursorStateKey, setSyncStateValue } from '../src/domain/sync/syncStateStorage.js';
import { getPendingChanges as getMutationLog } from '../src/domain/sync/syncQueue.js';
import { resetCurrentInstallState } from '../src/domain/importExport/importExportCommands.js';
import { settings } from '../src/domain/settings/settingsState.js';
import { installMemoryIndexedDb } from './memoryIndexedDb.js';
import { putDraftAttachmentBlob, putAttachmentBlob } from '../src/domain/attachments/blobStorage.js';
import { finalizeDraftAttachments } from '../src/domain/appStore/attachmentsAdapter.js';
import { createNote } from '../src/domain/appStore/notesAdapter.js';
import { resolveAttachmentUrl } from '../src/domain/attachments/attachmentUrlResolver.js';
import { collectSyncAttachments } from '../src/domain/attachments/attachmentBlobRuntime.js';
import { withBackendServer } from './backendServerHarness.js';

installMemoryIndexedDb();
const cases: Array<[string, () => Promise<void>]> = [];
cases.push(['001 inbound writes primary backend', async () => withBackendServer('app', async ({ baseUrl }) => {
  setRuntimeConfigOverride({ apiBase: baseUrl, appStorageMode: 'backend' });
  await applyChangesLocally([{ operation_id: 'remote-create', device_id: 'other', entity_id: 'remote-note', type: 'note.create', payload: { content: 'from remote', tags: [], revision: 1 } }]);
  assert.equal((await listBackendNotes()).find(n => n.note_id === 'remote-note')?.content, 'from remote');
})]);
cases.push(['002 imported identity matches queued identity', async () => withBackendServer('app', async ({ baseUrl }) => {
  setRuntimeConfigOverride({ apiBase: baseUrl, appStorageMode: 'backend' });
  settings.sync.mode = 'webdav';
  const result = await importExternalNotes([{ note_id: 'flomo-identity', filename: 'flomo.md', content: 'imported', title: 'imported', tags: [], pinned: false, revision: 1, created_at: 1000, updated_at: 1000 }]);
  const saved = (await listBackendNotes()).find(n => n.content === 'imported')!;
  assert.equal(result.imported_note_records[0]?.note_id, saved.note_id);
  assert.ok((await getMutationLog('webdav')).some(n => n.entity_id === saved.note_id));
  settings.sync.mode = 'local';
})]);
cases.push(['005 device reset preserves backend notes', async () => withBackendServer('app', async ({ baseUrl }) => {
  setRuntimeConfigOverride({ apiBase: baseUrl, appStorageMode: 'backend' });
  const saved = await createBackendNote({ content: 'must remain', tags: [] });
  await resetCurrentInstallState();
  assert.ok((await listBackendNotes()).some(n => n.note_id === saved.note_id));
})]);

cases.splice(2, 0, ['001/002/003 separate app and sync stores round trip', async () => withBackendServer('server', async remote => withBackendServer('app', async primary => {
  installMemoryIndexedDb();
  setRuntimeConfigOverride({ apiBase: primary.baseUrl, appStorageMode: 'backend' });
  Object.assign(settings.sync, { mode: 'server', serverUrl: remote.baseUrl, accessToken: remote.syncToken });
  const imported = await importExternalNotes([{ note_id: 'flomo-round-trip', filename: 'flomo.md', content: 'primary note', title: 'primary note', tags: [], pinned: false, revision: 1, created_at: 1577836800, updated_at: 1577836800 }]);
  const saved = imported.imported_note_records[0]!;
  await flushPendingQueue();
  assert.equal(getSyncState().error, '');
  assert.equal((await getMutationLog('server')).length, 0);
  assert.deepEqual((await listBackendNotes()).map(note => note.note_id), [saved.note_id], '002 import and sync retain one canonical ID');
  const push = async (change: object) => {
    const response = await fetch(`${remote.baseUrl}/api/sync/push`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${remote.syncToken}` }, body: JSON.stringify({ changes: [change] }) });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.conflicts?.length ?? 0, 0);
  };
  await push({ operation_id: 'other-create', device_id: 'other-device', entity_id: 'other-note', type: 'note.create', base_revision: 0, timestamp: new Date().toISOString(), payload: { content: 'remote create', tags: [], revision: 1, created_at: '2020-01-01T00:00:00Z' } });
  await updateBackendNote(saved.note_id, { content: 'primary updated', tags: [] });
  await flushPendingQueue();
  assert.equal(getSyncState().error, '');
  let current = await listBackendNotes();
  assert.equal(current.find(n => n.note_id === 'other-note')?.content, 'remote create', 'post-push pull must not skip remote changes');
  assert.deepEqual(current.filter(n => n.content === 'primary updated').map(n => n.note_id), [saved.note_id], '002 edit after import still updates the same record');
  assert.equal(current.find(n => n.note_id === 'other-note')?.created_at, 1577836800);
  await push({ operation_id: 'other-edit', device_id: 'other-device', entity_id: 'other-note', type: 'note.update', base_revision: 1, timestamp: new Date().toISOString(), payload: { content: 'remote edited', tags: [], revision: 2 } });
  await flushPendingQueue();
  assert.equal((await listBackendNotes()).find(n => n.note_id === 'other-note')?.content, 'remote edited');
  await push({ operation_id: 'other-trash', device_id: 'other-device', entity_id: 'other-note', type: 'note.trash', base_revision: 2, timestamp: new Date().toISOString(), payload: { content: 'remote edited', tags: [], revision: 3 } });
  await flushPendingQueue();
  current = await listBackendNotes();
  assert.ok(!current.some(n => n.note_id === 'other-note'));
  await trashBackendNote(saved.note_id);
  await emptyBackendTrash();
  assert.ok((await getMutationLog('server')).some(change => change.type === 'note.purge' && change.entity_id === saved.note_id));
  await flushPendingQueue();
  assert.equal(getSyncState().error, '');
  assert.equal((await getMutationLog('server')).length, 0);
  await setSyncStateValue(getSyncCursorStateKey('server'), '0');
  await flushPendingQueue();
  assert.equal((await listBackendNotes()).length, 0, 'replay after browser cursor loss must not resurrect notes');
  settings.sync.mode = 'local';
}))]);

cases.splice(2, 0, ['001 backend draft attachments persist and stale cache cannot override primary', async () => withBackendServer('app', async ({ baseUrl }) => {
  installMemoryIndexedDb();
  settings.sync.mode = 'local';
  setRuntimeConfigOverride({ apiBase: baseUrl, appStorageMode: 'backend' });
  const content = 'draft attachment\n\n![cover](/images/draft.png)';
  await putDraftAttachmentBlob({ sessionKey: 'editor', filename: 'draft.png', blob: new Blob([new Uint8Array([1, 2, 3])]), mimeType: 'image/png' });
  await finalizeDraftAttachments('editor', content);
  const note = await createNote({ content, tags: [] });
  assert.ok((await listBackendNotes()).some(n => n.note_id === note.note_id));
  installMemoryIndexedDb();
  await putAttachmentBlob({ filename: 'draft.png', blob: new Blob([new Uint8Array([9])]) });
  assert.equal(await resolveAttachmentUrl('/images/draft.png'), `${baseUrl}/images/draft.png`);
  const attachments = await collectSyncAttachments(content);
  assert.deepEqual([...attachments[0]!.data], [1, 2, 3]);
})]);

cases.splice(2, 0, ['001 backend conflict copy, replay and recreation from trash', async () => withBackendServer('app', async ({ baseUrl }) => {
  installMemoryIndexedDb();
  settings.sync.mode = 'local';
  setRuntimeConfigOverride({ apiBase: baseUrl, appStorageMode: 'backend' });
  const original = await createBackendNote({ content: 'original', tags: [] });
  await updateBackendNote(original.note_id, { content: 'local edit', tags: [] });
  const incoming = { operation_id: 'concurrent-edit', device_id: 'other', entity_id: original.note_id, type: 'note.update', base_revision: 1, payload: { content: 'remote edit', tags: [], revision: 2 } };
  const result = await applyChangesLocally([incoming]);
  assert.equal(result.conflicts.length, 1);
  const after = await listBackendNotes();
  assert.equal(after.find(note => note.note_id === original.note_id)?.content, 'remote edit');
  assert.ok(after.some(note => note.note_id !== original.note_id && note.content === 'local edit'));
  assert.deepEqual(await applyChangesLocally([incoming]), result, '001 replay returns durable conflict receipt');
  assert.equal((await listBackendNotes()).length, 2, '001 replay must not duplicate the conflict copy');
  await trashBackendNote(original.note_id);
  // This is the same adapter operation used by recreateFromRemoteConflict.
  await editBackendReplica(async store => {
    await store.applyRemoteActiveState(original.note_id, { content: 'recreated', tags: [], revision: 8 });
  });
  assert.equal((await listBackendNotes()).find(note => note.note_id === original.note_id)?.content, 'recreated');
})]);

let failed = 0;
for (const [name, run] of cases) {
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}`, error); }
}
assert.equal(failed, 0, `${failed} backend app storage cases failed`);
