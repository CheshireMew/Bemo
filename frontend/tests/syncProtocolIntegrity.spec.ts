import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { installMemoryIndexedDb } from './memoryIndexedDb.js';
import { setRuntimeConfigOverride } from '../src/config.js';
import { getAttachmentBlob, putAttachmentBlob, putBlobIndexRecord } from '../src/domain/attachments/blobStorage.js';
import { hydrateInboundAttachments } from '../src/domain/sync/syncAttachmentRuntime.js';
import { createWebDavTransport } from '../src/domain/sync/webdavSyncTransport.js';
import { buildSnapshotStateFromRemote } from '../src/domain/sync/webdav/webdavRemoteSnapshot.js';
import { pullWebDavChanges, readWebDavManifest } from '../src/domain/sync/webdav/webdavRemoteState.js';
import { consumeRemoteChanges } from '../src/domain/sync/syncBootstrap.js';
import { getSyncStateValue, setSyncStateValue } from '../src/domain/sync/syncStateStorage.js';
import { settings } from '../src/domain/settings/settingsState.js';
import { defaultSettings } from '../src/domain/settings/defaultSettings.js';
import { createLocalNoteFromSync } from '../src/domain/notes/localNoteCreation.js';
import { listLocalNotes, listLocalTrashNotes } from '../src/domain/notes/localNoteQueries.js';
import { flushPendingQueue } from '../src/domain/sync/syncCoordinator.js';
import { getConflicts } from '../src/domain/sync/conflictStorage.js';
import { getSyncTargetId } from '../src/domain/sync/syncTargetIdentity.js';
import { readSyncConfigSnapshot } from '../src/domain/sync/syncConfig.js';
import { bindLegacyMutationTarget, enqueueChange, getMutationLog } from '../src/domain/sync/mutationLogStorage.js';
import { getSyncCursorStateKey, migrateLegacySyncProgress } from '../src/domain/sync/syncStateStorage.js';
import type { SyncChange, SyncTransport } from '../src/domain/sync/syncTransport.js';

function hash(bytes: Uint8Array) { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
installMemoryIndexedDb();
setRuntimeConfigOverride({ appStorageMode: 'local' });
const bytesA = new Uint8Array([1, 2, 3]), bytesB = new Uint8Array([9, 8, 7]);
const hashA = hash(bytesA), hashB = hash(bytesB);
let downloads = 0;
const blobs = { async getBlob(value: string) { downloads++; return value === hashA ? bytesA : bytesB; } } as SyncTransport;
const attachmentChange = (filename: string, blobHash: string) => ({ payload: { attachments: [{ filename, blob_hash: blobHash, mime_type: 'image/png' }] } });
await hydrateInboundAttachments([attachmentChange('first.png', hashA), attachmentChange('second.png', hashA)], blobs);
assert.ok(await getAttachmentBlob('first.png'));
assert.ok(await getAttachmentBlob('second.png'));
assert.equal(downloads, 1, 'both names must resolve while the bytes are downloaded only once');
await hydrateInboundAttachments([attachmentChange('cover.png', hashA), attachmentChange('cover.png', hashB), attachmentChange('cover.png', hashA)], blobs);
assert.equal(hash(new Uint8Array(await (await getAttachmentBlob('cover.png'))!.arrayBuffer())), hashA);
assert.equal(downloads, 2, 'the old content must survive an alias overwrite');
installMemoryIndexedDb(); downloads = 0;
await putAttachmentBlob({ filename: 'legacy.png', blob: new Blob([bytesB]) });
await putBlobIndexRecord({ blobHash: hashA, filename: 'legacy.png', size: 3 });
await hydrateInboundAttachments([attachmentChange('legacy.png', hashA)], blobs);
assert.equal(downloads, 1, 'an old index must not validate a different file merely because it exists');
assert.equal(hash(new Uint8Array(await (await getAttachmentBlob('legacy.png'))!.arrayBuffer())), hashA);
console.log('PASS content reuse materializes every alias and validates old indexes');

type File = { body: string; etag: string };
async function withDav(run: (context: { transport: SyncTransport; files: Map<string, File>; base: string }) => Promise<void>) {
  installMemoryIndexedDb();
  const files = new Map<string, File>(); let version = 0;
  const base = 'https://dav.audit.invalid/bemo-sync';
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input), method = init.method || 'GET', stored = files.get(url);
    if (method === 'MKCOL') return new Response('', { status: 201 });
    if (method === 'GET' || method === 'HEAD') return stored
      ? new Response(method === 'HEAD' ? null : stored.body, { status: 200, headers: { ETag: stored.etag } })
      : new Response('', { status: 404 });
    if (method === 'PUT') {
      const headers = new Headers(init.headers);
      if (headers.get('If-Match') && headers.get('If-Match') !== stored?.etag) return new Response('', { status: 412 });
      if (headers.get('If-None-Match') === '*' && stored) return new Response('', { status: 412 });
      const etag = `"${++version}"`; files.set(url, { body: String(init.body), etag });
      return new Response('', { status: 201, headers: { ETag: etag } });
    }
    if (method === 'DELETE') { files.delete(url); return new Response(null, { status: 204 }); }
    throw new Error(`Unexpected request ${method} ${url}`);
  };
  try { await run({ transport: createWebDavTransport({ webdavUrl: 'https://dav.audit.invalid', username: 'test', password: 'test', basePath: '' }), files, base }); }
  finally { globalThis.fetch = original; }
}
function change(operation: string, type: string, base: number, content = '', revision?: number): SyncChange {
  return { operation_id: operation, device_id: operation, entity_id: 'shared', type, base_revision: base,
    payload: { filename: 'shared.md', content, tags: [], ...(revision ? { revision } : {}) } };
}

await withDav(async ({ transport, base }) => {
  await transport.push([change('create', 'note.create', 0, 'original', 1)]);
  const accepted = await transport.push([change('A', 'note.update', 1, 'A')]);
  assert.equal(accepted.accepted[0]?.change?.payload?.revision, 2);
  const retry = await transport.push([change('A', 'note.update', 1, 'different retry payload')]);
  assert.equal(retry.accepted[0]?.change?.payload?.content, 'A');
  assert.equal(retry.accepted[0]?.change?.payload?.revision, 2);
  const rejected = await transport.push([change('B', 'note.update', 1, 'B')]);
  assert.equal(rejected.accepted.length, 0);
  assert.equal(rejected.conflicts[0]?.reason, 'revision_conflict');
  assert.equal((rejected.conflicts[0]?.remote_snapshot as { content: string }).content, 'A');
  assert.equal((await buildSnapshotStateFromRemote(base, {}, await readWebDavManifest(base, {}))).shared?.content, 'A');
  await transport.push([change('purge', 'note.purge', 2)]);
  for (let index = 0; index < 13; index++) {
    const result = await transport.push([{ operation_id: `extra-${index}`, device_id: 'other', entity_id: `extra-${index}`,
      type: 'note.create', payload: { content: 'extra', tags: [], revision: 1 } }]);
    assert.equal(result.accepted.length, 1);
  }
  const remote = await transport.inspectBootstrap!();
  assert.equal(remote.remoteNotes.find(n => n.note_id === 'shared')?.scope, 'purged', 'compaction must retain permanent deletion');
  const bootstrap = await transport.pull(null);
  assert.ok(bootstrap.changes.some(c => c.entity_id === 'shared' && c.type === 'note.purge'));
  const recreation = await transport.push([change('stale-create', 'note.create', 0, 'old content')]);
  assert.equal(recreation.accepted.length, 0);
  assert.equal(recreation.conflicts[0]?.reason, 'note_exists');
});
console.log('PASS WebDAV rejects stale edits and preserves deletion across snapshot compaction');

await withDav(async ({ transport, files, base }) => {
  await transport.push([change('create', 'note.create', 0, 'original', 1)]);
  await transport.push([change('update', 'note.update', 1, 'updated')]);
  const manifest = await readWebDavManifest(base, {});
  const lastBatch = manifest.batches.at(-1)!;
  files.delete(`${base}/batches/${lastBatch.file}`);
  await setSyncStateValue('webdav_cursor', '1');
  Object.assign(settings.sync, structuredClone(defaultSettings.sync));
  await assert.rejects(consumeRemoteChanges(transport, 'webdav', { onBatch: async () => { throw new Error('must not apply'); } }), /批次缺失/);
  assert.equal(await getSyncStateValue('webdav_cursor'), '1');

  files.set(`${base}/snapshots/split.json`, { etag: '"split"', body: JSON.stringify({ format_version: 2,
    latest_cursor: '2', generated_at: new Date().toISOString(), note_count: 2,
    shards: [{ file: 'missing.json', note_count: 1 }, { file: 'next.json', note_count: 1 }] }) });
  await assert.rejects(pullWebDavChanges(base, {}, null, { ...manifest, latest_snapshot: 'split.json', snapshot_cursor: '2' }), /分片缺失/);
  assert.equal(await getSyncStateValue('webdav_cursor'), '1');
});
console.log('PASS missing batch and shard stop before advancing progress');

await withDav(async ({ transport }) => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  Object.assign(settings.sync, structuredClone(defaultSettings.sync), {
    mode: 'webdav', webdavUrl: 'https://dav.audit.invalid', username: 'test', password: 'test',
  });
  await createLocalNoteFromSync({ note_id: 'shared', content: 'local original', tags: [], pinned: false, revision: 1, filename: 'shared.md' });
  assert.equal((await flushPendingQueue()).status, 'completed');
  await transport.push([change('B-trash', 'note.trash', 1, 'local original')]);
  assert.equal((await flushPendingQueue()).status, 'completed');
  assert.equal((await listLocalNotes()).length, 0);
  assert.equal((await listLocalTrashNotes())[0]?.revision, 2);
  await transport.push([change('B-purge', 'note.purge', 2)]);
  assert.equal((await flushPendingQueue()).status, 'completed');
  assert.equal((await flushPendingQueue()).status, 'completed');
  assert.equal((await listLocalNotes()).length, 0);
  assert.equal((await listLocalTrashNotes()).length, 0);
  assert.equal((await transport.inspectBootstrap!()).remoteNotes[0]?.scope, 'purged');
});
console.log('PASS local primary store and WebDAV coordinator propagate deletion without resurrection');

for (const kind of ['note.update', 'note.purge']) {
  await withDav(async ({ transport }) => {
    Object.assign(settings.sync, structuredClone(defaultSettings.sync), {
      mode: 'webdav', webdavUrl: 'https://dav.audit.invalid', username: 'test', password: 'test',
    });
    await createLocalNoteFromSync({ note_id: 'shared', content: 'original', tags: [], pinned: false, revision: 1, filename: 'shared.md' });
    assert.equal((await flushPendingQueue()).status, 'completed');
    await transport.push([change('B-compacted-change', kind, 1, 'remote content')]);
    for (let index = 0; index < 13; index++) await transport.push([{ operation_id: `roll-${index}`,
      device_id: 'B', entity_id: `roll-${index}`, type: 'note.create', payload: { content: 'extra', tags: [], revision: 1 } }]);
    assert.equal((await flushPendingQueue()).status, 'completed');
    const notes = await listLocalNotes();
    assert.equal(notes.length, kind === 'note.purge' ? 13 : 14);
    assert.equal((await getConflicts()).length, 0, 'an unchanged local note must not produce a conflict after compaction');
    if (kind === 'note.update') assert.equal(notes.find(n => n.note_id === 'shared')?.content, 'remote content');
    assert.equal((await flushPendingQueue()).status, 'completed');
    assert.equal((await listLocalNotes()).length, notes.length);
  });
}
console.log('PASS snapshot recovery applies update and purge without phantom conflict copies');

installMemoryIndexedDb();
Object.assign(settings.sync, structuredClone(defaultSettings.sync), { mode: 'webdav',
  webdavUrl: 'https://dav.audit.invalid/', username: 'first', password: 'secret', basePath: '/notes/' });
const firstTarget = getSyncTargetId(readSyncConfigSnapshot())!;
settings.sync.webdavUrl = 'https://dav.audit.invalid'; settings.sync.basePath = 'notes';
assert.equal(getSyncTargetId(readSyncConfigSnapshot()), firstTarget);
settings.sync.password = 'new password';
assert.equal(getSyncTargetId(readSyncConfigSnapshot()), firstTarget, 'credential rotation stays at the same destination');
settings.sync.username = 'second';
const secondTarget = getSyncTargetId(readSyncConfigSnapshot())!;
assert.notEqual(firstTarget, secondTarget);
settings.sync.basePath = 'other-notes';
assert.notEqual(getSyncTargetId(readSyncConfigSnapshot()), secondTarget);
await enqueueChange({ target: 'webdav', deviceId: 'legacy', entityId: 'legacy-note', type: 'note.create', payload: {} });
await setSyncStateValue('webdav_cursor', '47');
await bindLegacyMutationTarget('webdav', firstTarget); await migrateLegacySyncProgress('webdav', firstTarget);
await bindLegacyMutationTarget('webdav', secondTarget); await migrateLegacySyncProgress('webdav', secondTarget);
assert.equal((await getMutationLog('webdav', firstTarget)).length, 1);
assert.equal((await getMutationLog('webdav', secondTarget)).length, 0);
assert.equal(await getSyncStateValue(getSyncCursorStateKey('webdav', firstTarget)), '47');
assert.equal(await getSyncStateValue(getSyncCursorStateKey('webdav', secondTarget)), null);
console.log('PASS account and directory isolation with legacy state assigned only once');
console.log('syncProtocolIntegrity.spec passed');
