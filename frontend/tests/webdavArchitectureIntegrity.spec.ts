import assert from 'node:assert/strict';
import { installMemoryIndexedDb } from './memoryIndexedDb.js';
import { createWebDavTransport } from '../src/domain/sync/webdavSyncTransport.js';
import { readWebDavRemoteState, deleteWebDavPendingWrite } from '../src/domain/sync/webdav/webdavRemoteState.js';
import { planBatchWrite, planWebDavSnapshotWrite } from '../src/domain/sync/webdav/webdavRemoteSnapshot.js';
import type { SyncChange } from '../src/domain/sync/syncTransport.js';

installMemoryIndexedDb();
const base = 'https://dav.architecture.invalid/bemo-sync';
const files = new Map<string, { body: string; etag: string }>();
const mutations: Array<{ url: string; method: string; owner: string }> = [];
let version = 0, interruptSnapshot = true, recoverInterleave = false;
let blockedWriter = false;
let loseLeaseAtIndex = false;
const transport = createWebDavTransport({ webdavUrl: 'https://dav.architecture.invalid', basePath: '', username: 'test', password: 'test' });
const change = (operation: string, content: string): SyncChange => ({ operation_id: operation, device_id: operation,
  entity_id: 'shared', type: 'note.create', base_revision: 0, payload: { content, tags: [], revision: 1 } });
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input), method = init.method || 'GET', stored = files.get(url);
  if (method === 'MKCOL') return new Response('', { status: 201 });
  if (method === 'HEAD' && url.includes('/snapshots/') && recoverInterleave) {
    recoverInterleave = false;
    await assert.rejects(transport.push([change('writer-B', 'must wait')]), /正在写入/);
    blockedWriter = true;
  }
  if (method === 'GET' || method === 'HEAD') return stored
    ? new Response(method === 'HEAD' ? null : stored.body, { status: 200, headers: { ETag: stored.etag } })
    : new Response('', { status: 404 });
  const headers = new Headers(init.headers);
  if ((headers.get('If-Match') && headers.get('If-Match') !== stored?.etag)
    || (headers.get('If-None-Match') === '*' && stored)) return new Response('', { status: 412 });
  const lease = files.get(base + '/lease.json');
  const owner = lease ? JSON.parse(lease.body) as { device_id: string; expires_at: string } : null;
  if (!url.endsWith('/lease.json')) {
    assert.ok(owner?.device_id && Date.parse(owner.expires_at) > Date.now(), `${method} ${url} must hold a live lease`);
    mutations.push({ url, method, owner: owner.device_id });
  }
  if (method === 'PUT') {
    if (interruptSnapshot && url.includes('/snapshots/')) { interruptSnapshot = false; return new Response('', { status: 400 }); }
    files.set(url, { body: String(init.body), etag: `"${++version}"` });
    if (loseLeaseAtIndex && url.endsWith('/batch-index.json')) {
      loseLeaseAtIndex = false;
      files.set(base + '/lease.json', { body: JSON.stringify({ device_id: 'new-owner', token: 'new-owner',
        expires_at: new Date(Date.now() + 60_000).toISOString() }), etag: `"${++version}"` });
    }
    return new Response('', { status: 201 });
  }
  if (method === 'DELETE') { files.delete(url); return new Response(null, { status: 204 }); }
  throw new Error(`Unexpected ${method} ${url}`);
};
try {
  await assert.rejects(transport.push([change('writer-A', 'interrupted')]), /400/);
  const pending = JSON.parse(files.get(base + '/pending-write.json')!.body) as { transaction_id: string; staged_files: { batch_files: string[]; snapshot_files: string[] } };
  recoverInterleave = true;
  await readWebDavRemoteState(base, {});
  assert.equal(blockedWriter, true, 'writer B must be excluded throughout recovery, including artifact checks');
  assert.equal(files.has(base + '/pending-write.json'), false);
  const accepted = await transport.push([change('writer-B', 'accepted B data')]);
  assert.equal(accepted.accepted.length, 1);
  const remote = await transport.pull(null);
  assert.equal(remote.changes.find(item => item.entity_id === 'shared')?.payload?.content, 'accepted B data');
  const state = await readWebDavRemoteState(base, {});
  assert.ok(!pending.staged_files.snapshot_files.includes(state.manifest.latest_snapshot!));
  assert.ok(!pending.staged_files.batch_files.includes(state.batchIndex.batches[0]!.file));
  assert.ok(mutations.filter(item => item.method === 'DELETE').length > 0);

  loseLeaseAtIndex = true;
  const interrupted: SyncChange = { operation_id: 'lost-between-metadata', device_id: 'A', entity_id: 'shared', type: 'note.update', base_revision: 1,
    payload: { content: 'recoverable update', tags: [], revision: 2 } };
  await assert.rejects(transport.push([interrupted]), /写入锁已失效/);
  assert.equal(JSON.parse(files.get(base + '/manifest.json')!.body).latest_cursor, '1', 'lease loss between metadata writes stops manifest publication');
  assert.equal(JSON.parse(files.get(base + '/lease.json')!.body).device_id, 'new-owner', 'old cleanup cannot release a new owner');
  files.set(base + '/lease.json', { body: JSON.stringify({ device_id: 'new-owner', token: 'new-owner', expires_at: new Date(0).toISOString() }), etag: `"${++version}"` });
  const retry = await transport.push([interrupted]);
  assert.equal(retry.accepted[0]?.deduplicated, true);
  assert.equal((await transport.pull(null)).changes.at(-1)?.payload?.content, 'recoverable update');

  // A stale transaction may never remove a different transaction's journal.
  files.set(base + '/pending-write.json', { body: JSON.stringify({ transaction_id: 'new-transaction' }), etag: '"new"' });
  await assert.rejects(deleteWebDavPendingWrite(base, {}, pending.transaction_id), /事务已变化/);
  assert.equal(JSON.parse(files.get(base + '/pending-write.json')!.body).transaction_id, 'new-transaction');
} finally { globalThis.fetch = originalFetch; }

const batchA = planBatchWrite(0, [change('A', 'a')]), batchB = planBatchWrite(0, [change('B', 'b')]);
assert.notEqual(batchA.file, batchB.file, 'different transactions never reuse a staged filename');
assert.notEqual(planWebDavSnapshotWrite(base, '1', {}).snapshotName, planWebDavSnapshotWrite(base, '1', {}).snapshotName);
console.log('PASS ARCH-03 recovery excludes a concurrent writer, retries remain readable, files are transaction-unique, and pending cleanup checks identity');
