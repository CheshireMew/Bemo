import assert from 'node:assert/strict';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { setRuntimeConfigOverride } from '../src/config.js';
import { withBackendServer } from './backendServerHarness.js';
import { installMemoryIndexedDb } from './memoryIndexedDb.js';
import { defaultSettings } from '../src/domain/settings/defaultSettings.js';
import { settings } from '../src/domain/settings/settingsState.js';
import { createBackendNote, listBackendNotes, listBackendTrashNotes, trashBackendNote, updateBackendNote } from '../src/domain/notes/backendNotesApi.js';
import { flushPendingQueue } from '../src/domain/sync/syncCoordinator.js';
import { getPendingChanges } from '../src/domain/sync/syncQueue.js';
import { getSyncTargetId } from '../src/domain/sync/syncTargetIdentity.js';
import { readSyncConfigSnapshot } from '../src/domain/sync/syncConfig.js';
import { getSyncCursorStateKey, getSyncStateValue, setSyncStateValue } from '../src/domain/sync/syncStateStorage.js';
import { clearScheduledSync } from '../src/domain/sync/syncScheduler.js';
import { initSync } from '../src/store/sync.js';
import { useSyncOperations } from '../src/composables/useSyncOperations.js';
import { notifications } from '../src/store/notifications.js';
import { getConflicts } from '../src/domain/sync/conflictStorage.js';
import { acceptRemoteDeleteConflict } from '../src/store/conflicts.js';

process.env.BEMO_TEST_KEEP_DATA = '1';
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
Object.assign(globalThis, {
  window: { setTimeout: () => 1, clearTimeout: () => {}, addEventListener: () => {} },
  document: { visibilityState: 'visible', addEventListener: () => {} },
});

type Server = { baseUrl: string; syncToken: string };
function configure(primary: Server, remote: Server) {
  installMemoryIndexedDb();
  setRuntimeConfigOverride({ apiBase: primary.baseUrl, appStorageMode: 'backend' });
  Object.assign(settings.sync, structuredClone(defaultSettings.sync), {
    mode: 'server', serverUrl: remote.baseUrl, accessToken: remote.syncToken,
  });
}
async function push(remote: Server, changes: object[]) {
  const response = await fetch(`${remote.baseUrl}/api/sync/push`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${remote.syncToken}` },
    body: JSON.stringify({ changes }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.conflicts.length, 0);
}
async function remoteState(remote: Server): Promise<Array<{ note_id: string; scope: string; revision: number }>> {
  return (await (await fetch(`${remote.baseUrl}/api/sync/state`, {
    headers: { Authorization: `Bearer ${remote.syncToken}` },
  })).json()).remoteNotes;
}
async function sync() {
  const result = await flushPendingQueue();
  assert.equal(result.status, 'completed', JSON.stringify(result));
  return result;
}
async function withStores(run: (primary: Server, remote: Server) => Promise<void>) {
  return withBackendServer('server', remote => withBackendServer('app', async primary => {
    configure(primary, remote);
    try { await run(primary, remote); } finally { clearScheduledSync(); }
  }));
}

for (const kind of ['note.trash', 'note.purge']) {
  await withStores(async (_primary, remote) => {
    const note = await createBackendNote({ content: 'original', tags: [] });
    await sync();
    await push(remote, [{ operation_id: `B-${kind}`, device_id: 'B', entity_id: note.note_id,
      type: kind, base_revision: 1, payload: { content: 'original', tags: [], revision: 2 } }]);
    await sync(); await sync();
    assert.equal((await remoteState(remote)).find(n => n.note_id === note.note_id)?.scope, kind === 'note.trash' ? 'trash' : 'purged');
    assert.equal((await listBackendNotes()).length, 0);
    if (kind === 'note.trash') assert.equal((await listBackendTrashNotes())[0]?.revision, 2, 'incoming trash must not increment twice');
    else assert.equal((await listBackendTrashNotes()).length, 0);
    await setSyncStateValue(getSyncCursorStateKey('server'), '0');
    await sync();
    assert.equal((await listBackendNotes()).length, 0, 'cursor replay must not recreate deleted content');
    assert.equal((await remoteState(remote))[0]?.revision, 2, 'read-only sync must not manufacture writes');
  });
  console.log(`PASS remote ${kind} stays deleted across repeated sync and replay`);
}

await withStores(async (_primary, remote) => {
  const note = await createBackendNote({ content: 'restore', tags: [] });
  await sync(); await trashBackendNote(note.note_id); await sync();
  await push(remote, [{ operation_id: 'B-restore', device_id: 'B', entity_id: note.note_id,
    type: 'note.restore', base_revision: 2, payload: { content: 'restore', tags: [], revision: 3 } }]);
  await sync(); await sync();
  assert.equal((await listBackendNotes())[0]?.revision, 3);
  assert.equal((await listBackendTrashNotes()).length, 0);
  assert.equal((await remoteState(remote))[0]?.scope, 'active');
  assert.equal((await remoteState(remote))[0]?.revision, 3);
});
console.log('PASS remote restore is applied without a compensating trash upload');

await withStores(async (_primary, remote) => {
  const note = await createBackendNote({ content: 'original', tags: [] }); await sync();
  settings.sync.mode = 'local';
  await updateBackendNote(note.note_id, { content: 'local offline edit', tags: [] });
  await push(remote, [{ operation_id: 'B-edit', device_id: 'B', entity_id: note.note_id,
    type: 'note.update', base_revision: 1, payload: { content: 'remote edit', tags: [], revision: 2 } }]);
  settings.sync.mode = 'server'; await sync();
  const notes = await listBackendNotes();
  assert.equal(notes.find(n => n.note_id === note.note_id)?.content, 'remote edit');
  assert.ok(notes.some(n => n.note_id !== note.note_id && n.content === 'local offline edit'));
  assert.equal((await remoteState(remote)).find(n => n.note_id === note.note_id)?.revision, 2);
});
console.log('PASS edits made with sync disabled use the old baseline and preserve a conflict copy');

await withBackendServer('server', first => withBackendServer('server', second => withBackendServer('app', async primary => {
  configure(primary, first);
  const firstId = getSyncTargetId(readSyncConfigSnapshot())!;
  const note = await createBackendNote({ content: 'belongs to original endpoint', tags: [] });
  settings.sync.serverUrl = second.baseUrl;
  await sync();
  assert.equal((await remoteState(second)).length, 0, 'old pending content must not be seeded into a replacement endpoint');
  assert.equal((await getPendingChanges('server', firstId)).length, 1);
  settings.sync.serverUrl = first.baseUrl; await sync();
  assert.equal((await remoteState(first))[0]?.note_id, note.note_id);
  assert.equal((await getPendingChanges('server', firstId)).length, 0);

  await setSyncStateValue(getSyncCursorStateKey('server'), '5');
  await push(second, [{ operation_id: 'B-clone', device_id: 'B', entity_id: note.note_id, type: 'note.create',
    payload: { content: 'new endpoint content', tags: [], revision: 2 } }]);
  settings.sync.serverUrl = second.baseUrl; await sync();
  assert.equal((await listBackendNotes()).find(n => n.note_id === note.note_id)?.content, 'new endpoint content');
  assert.equal(await getSyncStateValue(getSyncCursorStateKey('server', firstId)), '5');
  assert.equal(await getSyncStateValue(getSyncCursorStateKey('server')), '1');
  clearScheduledSync();
})));
console.log('PASS endpoint replacement isolates its queue, receipts and progress');

await withStores(async (_primary, remote) => {
  const note = await createBackendNote({ content: 'original', tags: [] });
  await sync();
  settings.sync.mode = 'local';
  await updateBackendNote(note.note_id, { content: 'offline one', tags: [] });
  await updateBackendNote(note.note_id, { content: 'offline two', tags: [] });
  settings.sync.mode = 'server';
  await sync();
  assert.equal((await listBackendNotes())[0]?.revision, 2);
  await updateBackendNote(note.note_id, { content: 'online edit', tags: [] });
  const result = await sync();
  assert.equal(result.status === 'completed' && result.conflicts, 0);
  assert.equal((await remoteState(remote))[0]?.revision, 3);
});
console.log('PASS offline edits adopt the confirmed revision before the next edit');

await withStores(async (_primary, first) => withBackendServer('server', async second => {
  const note = await createBackendNote({ content: 'original', tags: [] });
  await sync();
  settings.sync.serverUrl = second.baseUrl;
  await updateBackendNote(note.note_id, { content: 'edited for new endpoint', tags: [] });
  const result = await sync();
  assert.equal(result.status === 'completed' && result.conflicts, 0);
  assert.equal((await remoteState(second))[0]?.note_id, note.note_id);
  assert.equal((await remoteState(first))[0]?.revision, 1);
  clearScheduledSync();
}));
console.log('PASS explicit edits initialize an empty new endpoint without moving old queues');

for (const kind of ['note.trash', 'note.purge']) {
  await withStores(async (_primary, remote) => {
    const note = await createBackendNote({ content: 'original', tags: [] }); await sync();
    settings.sync.mode = 'local';
    await updateBackendNote(note.note_id, { content: 'unsent edit', tags: [] });
    await push(remote, [{ operation_id: `delete-${kind}`, device_id: 'B', entity_id: note.note_id,
      type: kind, base_revision: 1, payload: { content: 'original', tags: [], revision: 2 } }]);
    settings.sync.mode = 'server'; await sync();
    const conflict = (await getConflicts()).find(c => c.note_id === note.note_id && c.conflict_copy_filename);
    assert.ok(conflict?.id);
    await acceptRemoteDeleteConflict(conflict.id);
    if (kind === 'note.trash') {
      const trashed = (await listBackendTrashNotes()).find(n => n.note_id === note.note_id);
      assert.equal(trashed?.content, 'original'); assert.equal(trashed?.revision, 2);
    } else assert.equal((await listBackendTrashNotes()).some(n => n.note_id === note.note_id), false);
    await sync();
    assert.equal((await remoteState(remote)).find(n => n.note_id === note.note_id)?.scope, kind === 'note.trash' ? 'trash' : 'purged');
    assert.ok((await listBackendNotes()).some(n => n.content === 'unsent edit'));
  });
}
console.log('PASS accepting a remote deletion keeps its canonical state and the protected edit');

await withStores(async (_primary, remote) => {
  await push(remote, [{ operation_id: 'B-new', device_id: 'B', entity_id: 'remote-only', type: 'note.create',
    payload: { content: 'remote-only note', tags: [], revision: 1 } }]);
  let refreshCount = 0;
  const stop = initSync(() => { refreshCount++; });
  await sync(); stop();
  assert.equal((await listBackendNotes()).length, 1);
  assert.ok(refreshCount > 0, 'the actual application sync callback must fire for pull-only runs');

  let operations!: ReturnType<typeof useSyncOperations>;
  const app = createSSRApp({ setup() {
    operations = useSyncOperations({ syncSettings: settings.sync, hasCompleteWebDavConfig: { value: false },
      webdavConfigIssue: { value: '' }, flushSyncSettings: () => {} });
    return () => null;
  } });
  await renderToString(app);
  settings.sync.accessToken = 'wrong-token';
  notifications.value = [];
  await operations.handleSyncNow();
  assert.equal(notifications.value.at(-1)?.level, 'error');
  assert.match(notifications.value.at(-1)?.message || '', /401/);
  assert.ok(!notifications.value.some(n => n.level === 'success'));
  settings.sync.mode = 'local'; notifications.value = [];
  await operations.handleSyncNow();
  assert.equal(notifications.value.at(-1)?.level, 'info');
});
console.log('PASS pull-only refresh and actual manual-sync notifications reflect the result');
console.log('syncRemediation.spec passed');
