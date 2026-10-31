import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { installMemoryIndexedDb } from './memoryIndexedDb.js';
import { setRuntimeConfigOverride } from '../src/config.js';
import { settings } from '../src/domain/settings/settingsState.js';
import { defaultSettings } from '../src/domain/settings/defaultSettings.js';
import { createLocalNoteFromSync, createLocalTrashNoteFromSync } from '../src/domain/notes/localNoteCreation.js';
import { listLocalNotes, listLocalTrashNotes } from '../src/domain/notes/localNoteQueries.js';
import { updateLocalNote } from '../src/domain/notes/localNoteMutations.js';
import { deleteLocalNote, restoreLocalTrashNote, permanentlyDeleteLocalTrashNote } from '../src/domain/notes/localTrashMutations.js';
import { applyChangesToCurrentStore } from '../src/domain/appStore/syncReplicaAdapter.js';
import { hydrateInboundAttachments } from '../src/domain/sync/syncAttachmentRuntime.js';
import { putAttachmentBlob, getAttachmentBlob } from '../src/domain/attachments/blobStorage.js';
import { buildBackupPayloadForCurrentStore, applyBackupPayloadToCurrentStore, clearCurrentAppData } from '../src/domain/appStore/dataAdapter.js';
import { buildMarkdownArchiveBlob, parseMarkdownArchive, importMarkdownArchive } from '../src/domain/importExport/markdownArchive.js';
import { withBackendServer } from './backendServerHarness.js';
import { createBackendNote, listBackendNotes } from '../src/domain/notes/backendNotesApi.js';
import { uploadBackendAttachment } from '../src/domain/attachments/backendAttachmentsApi.js';
import { flushPendingQueue } from '../src/domain/sync/syncCoordinator.js';
import { clearScheduledSync } from '../src/domain/sync/syncScheduler.js';
import { createNote, updateNote } from '../src/domain/appStore/notesAdapter.js';
import { getSyncCursorStateKey, setSyncStateValue } from '../src/domain/sync/syncStateStorage.js';
import { getConflicts } from '../src/domain/sync/conflictStorage.js';
import { openIndexedDb } from '../src/domain/storage/indexedDb.js';
import { putCachedNote } from '../src/domain/notes/notesStorage.js';
import { getPendingChanges } from '../src/domain/sync/syncQueue.js';
import { editBackendReplica } from '../src/domain/appStore/syncReplicaAdapter.js';
import type { SyncTransport } from '../src/domain/sync/syncTransport.js';

process.env.BEMO_TEST_KEEP_DATA = '1';
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
Object.assign(globalThis, { window: { setTimeout: () => 1, clearTimeout: () => {}, addEventListener: () => {} },
  document: { visibilityState: 'visible', addEventListener: () => {} } });
function reset(mode: 'backend' | 'local' = 'local', apiBase = '') {
  installMemoryIndexedDb();
  Object.assign(settings.sync, structuredClone(defaultSettings.sync));
  setRuntimeConfigOverride({ appStorageMode: mode, apiBase });
}
const digest = (value: Uint8Array) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

for (const scope of ['active', 'trash'] as const) {
  reset();
  await (scope === 'active' ? createLocalNoteFromSync : createLocalTrashNoteFromSync)({ note_id: 'restore', filename: 'restore.md',
    content: 'unsynced local content', tags: ['local'], pinned: false, revision: 3 });
  const change = { operation_id: `restore-${scope}`, entity_id: 'restore', type: 'note.restore', base_revision: 2, preserve_local: true,
    payload: { revision: 4, content: 'restored remote content', tags: [] } };
  const result = await applyChangesToCurrentStore([change], 'server:restore');
  assert.equal(result.conflicts.length, 1);
  assert.equal((await listLocalNotes()).filter(note => note.content === 'unsynced local content').length, 1);
  assert.equal((await listLocalNotes()).find(note => note.note_id === 'restore')?.content, 'restored remote content');
  assert.equal((await listLocalTrashNotes()).length, 0);
  await applyChangesToCurrentStore([change], 'server:restore');
  assert.equal((await listLocalNotes()).length, 2, 'replay does not manufacture additional copies');
}
console.log('PASS ARCH-02 restore preserves local content from active and trash states, with durable replay receipts');

reset();
await createLocalNoteFromSync({ note_id: 'image', filename: 'image.md', content: 'local ![](/images/shared.png)', tags: [], pinned: false, revision: 3 });
await putAttachmentBlob({ filename: 'shared.png', blob: new Blob(['local image']), mimeType: 'image/png' });
const bytes = new TextEncoder().encode('remote image');
const hydrated = await hydrateInboundAttachments([{ operation_id: 'image-update', entity_id: 'image', type: 'note.update', base_revision: 1, preserve_local: true,
  payload: { content: 'remote ![](/images/shared.png)', tags: [], revision: 2,
    attachments: [{ filename: 'shared.png', blob_hash: digest(bytes), mime_type: 'image/png' }] } }], { getBlob: async () => bytes } as unknown as SyncTransport);
assert.equal((await applyChangesToCurrentStore(hydrated)).conflicts.length, 1);
assert.equal(await (await getAttachmentBlob('shared.png'))!.text(), 'local image');
const incomingName = (hydrated[0]!.payload!.attachments as Array<{ filename: string }>)[0]!.filename;
assert.notEqual(incomingName, 'shared.png');
assert.equal(await (await getAttachmentBlob(incomingName))!.text(), 'remote image');
assert.ok((await listLocalNotes()).some(note => note.content === 'local ![](/images/shared.png)'));
const imageBackup = await buildBackupPayloadForCurrentStore();
await applyBackupPayloadToCurrentStore(imageBackup);
const repeated = await hydrateInboundAttachments([{ payload: { attachments: [{ filename: 'shared.png', blob_hash: digest(bytes), mime_type: 'image/png' }] } }],
  { getBlob: async () => bytes } as unknown as SyncTransport);
assert.equal((repeated[0]!.payload!.attachments as Array<{ filename: string }>)[0]!.filename, incomingName);
assert.equal(await (await getAttachmentBlob('shared.png'))!.text(), 'local image');
console.log('PASS ARCH-04 conflict copies retain original bytes and incoming content uses an independent alias');

reset();
const original = await createLocalNoteFromSync({ note_id: 'editor', filename: 'editor.md', content: 'old', tags: [], pinned: false, revision: 1 });
const backup = await buildBackupPayloadForCurrentStore();
backup.notes![0]!.content = 'restored';
await applyBackupPayloadToCurrentStore(backup);
await assert.rejects(updateLocalNote(original.note_id, { content: 'stale', tags: [] }, original.revision, original.edit_version), /已更新/);
const restored = (await listLocalNotes())[0]!;
await updateLocalNote(restored.note_id, { content: 'reviewed', tags: [] }, restored.revision, restored.edit_version);
assert.equal((await listLocalNotes())[0]?.content, 'reviewed');
console.log('PASS ARCH-06 local backup replacement invalidates the old editor even when protocol revisions match');

await deleteLocalNote(original.note_id);
const oldTrash = (await listLocalTrashNotes())[0]!;
await restoreLocalTrashNote(original.note_id);
await deleteLocalNote(original.note_id);
await assert.rejects(permanentlyDeleteLocalTrashNote(original.note_id, oldTrash), /已变化/);
assert.equal((await listLocalTrashNotes()).length, 1);
console.log('PASS ARCH-05 local stale trash credentials cannot delete a restored and re-trashed note');

reset();
await new Promise<void>((resolve, reject) => {
  const request = indexedDB.open('bemo-offline', 11);
  request.onupgradeneeded = () => {
    for (const name of ['cachedNotes', 'trashNotes']) request.result.createObjectStore(name, { keyPath: 'note_id' }).createIndex('filename', 'filename', { unique: true });
  };
  request.onsuccess = () => { request.result.close(); resolve(); };
  request.onerror = () => reject(request.error);
});
const migrated = await openIndexedDb();
assert.equal(migrated.transaction('cachedNotes').objectStore('cachedNotes').index('filename').unique, false);
migrated.close();
for (const id of ['A', 'a', 'B', '汉字']) await putCachedNote({ note_id: id, filename: '同名.md', content: `body ${id}`, title: id, tags: [], pinned: false, revision: 1, created_at: 1, updated_at: 1 });
const archive = await buildMarkdownArchiveBlob();
const zip = await JSZip.loadAsync(await archive.arrayBuffer());
const paths = Object.keys(zip.files).filter(name => name.startsWith('notes/') && name.endsWith('.md'));
assert.equal(paths.length, 4);
assert.equal(new Set(paths.map(name => name.toLowerCase())).size, 4, 'Windows extraction must retain case-distinct IDs');
assert.ok(paths.every(name => name.endsWith('同名.md')));
assert.equal((await parseMarkdownArchive(new File([archive], 'archive.zip'))).notes.length, 4);
await importMarkdownArchive(new File([archive], 'archive.zip'));
assert.deepEqual((await listLocalNotes()).map(note => note.content).sort(), ['body A', 'body B', 'body a', 'body 汉字']);
console.log('PASS ARCH-09 schema upgrade accepts duplicate display filenames and both notes survive archive round trip');

await withBackendServer('app', async primary => {
  reset('backend', primary.baseUrl);
  const saved = await createBackendNote({ content: 'unsynced backend content', tags: [], revision: 3 });
  const result = await applyChangesToCurrentStore([{ entity_id: saved.note_id, operation_id: 'backend-restore', type: 'note.restore', base_revision: 2, preserve_local: true,
    payload: { content: 'remote restored', tags: [], revision: 4 } }], 'server:backend-restore');
  assert.equal(result.conflicts.length, 1);
  assert.ok((await listBackendNotes()).some(note => note.content === saved.content));
  await uploadBackendAttachment({ filename: 'same.png', data: new TextEncoder().encode('original image').buffer, mimeType: 'image/png' });
  const image = await createBackendNote({ content: 'local ![](/images/same.png)', tags: [], revision: 3 });
  const incoming = await hydrateInboundAttachments([{ entity_id: image.note_id, operation_id: 'backend-image', type: 'note.update', base_revision: 1, preserve_local: true,
    payload: { content: 'remote ![](/images/same.png)', tags: [], revision: 2,
      attachments: [{ filename: 'same.png', blob_hash: digest(bytes), mime_type: 'image/png' }] } }], { getBlob: async () => bytes } as unknown as SyncTransport);
  assert.equal((await applyChangesToCurrentStore(incoming)).conflicts.length, 1);
  assert.equal(await fetch(primary.baseUrl + '/images/same.png').then(response => response.text()), 'original image');
  assert.ok((await listBackendNotes()).some(note => note.content === image.content));

  // A window already applying a remote snapshot must stop across a workspace replacement.
  await assert.rejects(editBackendReplica(async (_store, active) => {
    await clearCurrentAppData();
    const note = active.get(saved.note_id)!;
    active.set(note.note_id, { ...note, content: 'stale in-flight replica' });
  }), /工作区已被替换/);
  assert.equal((await listBackendNotes()).length, 0);

  await applyChangesToCurrentStore(['A', 'B'].map(id => ({ operation_id: `duplicate-${id}`, entity_id: id, type: 'note.create',
    payload: { filename: 'same.md', content: `body ${id}`, tags: [], revision: 1 } })));
  const backendArchive = await buildMarkdownArchiveBlob();
  assert.equal((await parseMarkdownArchive(new File([backendArchive], 'backend.zip'))).notes.length, 2);
});
console.log('PASS ARCH-02/04 real backend replica retains both text and attachment versions');
console.log('PASS ARCH-08/09 in-flight replicas stop across replacement and backend duplicate filenames export intact');

await withBackendServer('server', remote => withBackendServer('app', async primary => {
  reset('backend', primary.baseUrl);
  Object.assign(settings.sync, { mode: 'server', serverUrl: remote.baseUrl, accessToken: remote.syncToken });
  const saved = await createNote({ content: 'baseline', tags: [] });
  assert.equal((await flushPendingQueue()).status, 'completed');
  await updateNote((await listBackendNotes())[0]!, { content: 'offline one', tags: [] });
  await updateNote((await listBackendNotes())[0]!, { content: 'offline two', tags: [] });
  await fetch(remote.baseUrl + '/api/sync/push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${remote.syncToken}` },
    body: JSON.stringify({ changes: [{ operation_id: 'other-device-edit', device_id: 'other', entity_id: saved.note_id, type: 'note.update', base_revision: 1,
      payload: { revision: 2, content: 'other device important content', tags: [] } }] }) });
  const original = globalThis.fetch;
  let acknowledgements = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes('/api/app/outbox/') && init?.method === 'DELETE' && ++acknowledgements === 2) throw new TypeError('interrupted acknowledgement');
    return original(input, init);
  };
  try { assert.equal((await flushPendingQueue()).status, 'failed'); }
  finally { globalThis.fetch = original; clearScheduledSync(); }
  assert.equal((await getConflicts()).length, 2, 'all dependency rejections are durable before any acknowledgement');
  assert.equal((await getPendingChanges('server')).length, 1);
  assert.equal((await flushPendingQueue()).status, 'completed');
  const history = await fetch(remote.baseUrl + '/api/sync/pull', { headers: { Authorization: `Bearer ${remote.syncToken}` } }).then(response => response.json());
  assert.equal(history.changes.filter((change: { entity_id: string }) => change.entity_id === saved.note_id).at(-1).payload.content, 'other device important content');
  assert.ok((await listBackendNotes()).some(note => note.content === 'offline two'), 'the losing local edit remains available as a conflict copy');
  clearScheduledSync();
}));
console.log('PASS ARCH-01 interrupted conflict acknowledgements cannot replay an offline dependency against another device revision');

for (const runtime of ['backend', 'local'] as const) {
  await withBackendServer('server', remote => withBackendServer('app', async primary => {
    reset(runtime, primary.baseUrl);
    Object.assign(settings.sync, { mode: 'server', serverUrl: remote.baseUrl, accessToken: remote.syncToken });
    const sync = async () => { const result = await flushPendingQueue(); assert.equal(result.status, 'completed', JSON.stringify(result)); return result; };
    const read = () => runtime === 'backend' ? listBackendNotes() : listLocalNotes();
    try {
      await createNote({ content: 'will be cleared', tags: [] }); await sync();
      const before = await buildBackupPayloadForCurrentStore();
      const noteId = before.notes![0]!.note_id;
      await clearCurrentAppData(); await sync(); await sync();
      assert.equal((await read()).length, 0, 'clear must not turn into a remote reimport');
      let state = await fetch(remote.baseUrl + '/api/sync/state', { headers: { Authorization: `Bearer ${remote.syncToken}` } }).then(response => response.json());
      assert.equal(state.remoteNotes.find((note: { note_id: string }) => note.note_id === noteId).scope, 'purged');
      await setSyncStateValue(getSyncCursorStateKey('server'), '0'); await sync();
      assert.equal((await read()).length, 0, 'old cursor replay cannot undo a deliberate clear');
      await applyBackupPayloadToCurrentStore(before); await sync();
      assert.equal((await read()).find(note => note.note_id === noteId)?.content, 'will be cleared');
      assert.equal((await getConflicts()).length, 0, 'explicit backup restore can restore a confirmed tombstone');
      const current = (await read()).find(note => note.note_id === noteId)!;
      await updateNote(current, { content: 'pending edit that must be superseded', tags: [] });
      await clearCurrentAppData(); await sync();
      assert.equal((await read()).length, 0);
      state = await fetch(remote.baseUrl + '/api/sync/state', { headers: { Authorization: `Bearer ${remote.syncToken}` } }).then(response => response.json());
      assert.equal(state.remoteNotes.find((note: { note_id: string }) => note.note_id === noteId).scope, 'purged');

      const concurrent = await createNote({ content: 'clear with a remote conflict', tags: [] }); await sync();
      await fetch(remote.baseUrl + '/api/sync/push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${remote.syncToken}` },
        body: JSON.stringify({ changes: [{ operation_id: `concurrent-clear-${runtime}`, device_id: 'other', entity_id: concurrent.note_id,
          type: 'note.update', base_revision: 1, payload: { content: 'remote concurrent content', tags: [], revision: 2 } }] }) });
      await clearCurrentAppData();
      const conflict = await sync();
      assert.ok(conflict.status === 'completed' && conflict.conflicts > 0);
      assert.equal((await read()).length, 0, 'a rejected deletion remains explicit and does not reimport remote content');
      assert.ok((await getConflicts()).some(item => item.note_id === concurrent.note_id));
    } finally { clearScheduledSync(); }
  }));
}
console.log('PASS ARCH-08 backend and local primary clear, replay, explicit backup restore and superseded pending edits');
