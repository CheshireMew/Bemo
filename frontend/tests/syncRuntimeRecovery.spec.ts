import assert from 'node:assert/strict';
import http from 'node:http';
import axios from 'axios';
import { createServerTransport } from '../src/domain/sync/serverSyncTransport.js';
import { clearScheduledSync, handleSyncFailure, handleSyncSuccess, shouldPauseBackgroundSync } from '../src/domain/sync/syncScheduler.js';
import { registerSyncWindowEvents } from '../src/domain/sync/syncWindowEvents.js';
import { watchBackendAppChanges } from '../src/domain/appStore/backendAppEvents.js';
import { setRuntimeConfigOverride } from '../src/config.js';
import { settings } from '../src/domain/settings/settingsState.js';
import { enqueueDeviceChange } from '../src/domain/sync/mutationLogRuntime.js';
import { putCachedNote } from '../src/domain/notes/notesStorage.js';
import { getPendingChanges } from '../src/domain/sync/syncQueue.js';
import { flushPendingQueue } from '../src/domain/sync/syncCoordinator.js';
import { installMemoryIndexedDb } from './memoryIndexedDb.js';

const scheduled: Array<{ callback: () => void; delay: number }> = [];
const listeners = new Map<string, () => void>();
let cleared = 0;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
const runtimeWindow = { __TAURI_INTERNALS__: {} as unknown, setTimeout: (callback: () => void, delay: number) => { scheduled.push({ callback, delay }); return scheduled.length; }, clearTimeout: () => { cleared++; }, addEventListener: (type: string, fn: () => void) => { listeners.set(type, fn); } };
const runtimeDocument = { visibilityState: 'hidden', addEventListener: (type: string, fn: () => void) => { listeners.set(type, fn); } };
Object.assign(globalThis, { window: runtimeWindow, document: runtimeDocument });
const originalClearTimeout = globalThis.clearTimeout;
globalThis.clearTimeout = runtimeWindow.clearTimeout as typeof clearTimeout;
assert.equal(shouldPauseBackgroundSync(), false);
handleSyncSuccess(() => {});
assert.equal(scheduled.at(-1)?.delay, 60_000);
handleSyncFailure(() => {});
assert.equal(scheduled.at(-1)?.delay, 5_000);
registerSyncWindowEvents({ requestSyncNow: () => {}, flushPendingQueue: async () => {} });
const previousClears = cleared;
listeners.get('visibilitychange')!();
assert.equal(cleared, previousClears, 'minimizing a desktop window must not cancel sync');
delete (runtimeWindow as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
assert.equal(shouldPauseBackgroundSync(), true);
listeners.get('visibilitychange')!();
assert.equal(cleared, previousClears + 1);
clearScheduledSync();
globalThis.clearTimeout = originalClearTimeout;
runtimeDocument.visibilityState = 'visible';
console.log('PASS desktop timers and retry scheduling remain active after minimization');

// A server which accepts the connection but never responds must release the
// coordinator, retain the outbox and allow a later attempt to finish.
installMemoryIndexedDb();
setRuntimeConfigOverride({ appStorageMode: 'local' });
let stall = true;
let received = false;
const accepted: object[] = [];
const server = http.createServer(async (req, res) => {
  if (req.url === '/api/sync/state') {
    res.end(JSON.stringify({ status: 'completed', fingerprint: null, remoteNotes: [] })); return;
  }
  if (stall) return;
  if (req.url === '/api/sync/push') {
    let body = ''; for await (const chunk of req) body += chunk;
    const changes = JSON.parse(body).changes as Array<{ operation_id: string }>;
    accepted.push(...changes); received = true;
    res.end(JSON.stringify({ accepted: changes.map((change, index) => ({ operation_id: change.operation_id, cursor: String(index + 1), change })), conflicts: [], latest_cursor: String(changes.length) })); return;
  }
  res.end(JSON.stringify({ changes: [], latest_cursor: String(accepted.length) }));
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const serverUrl = `http://127.0.0.1:${address.port}`;
const createOriginal = axios.create;
axios.create = (config) => {
  assert.equal(config?.timeout, 30_000, 'production requests have a finite default timeout');
  return createOriginal({ ...config, timeout: 100 });
};
try {
  Object.assign(settings.sync, { mode: 'server', serverUrl, accessToken: 'token' });
  await putCachedNote({ note_id: 'timeout-note', filename: 'timeout.md', content: 'must survive', tags: [], title: 'must survive', pinned: false, revision: 1, created_at: 1000, updated_at: 1000 });
  await enqueueDeviceChange({ target: 'server', entityId: 'timeout-note', type: 'note.create', baseRevision: 0, payload: { content: 'must survive', tags: [], revision: 1 } });
  const failed = await flushPendingQueue();
  assert.equal(failed.status, 'failed');
  if (failed.status === 'failed') assert.match(failed.error, /超时/);
  assert.equal((await getPendingChanges('server')).length, 1);
  stall = false;
  assert.equal((await flushPendingQueue()).status, 'completed');
  assert.equal(received, true);
  assert.equal((await getPendingChanges('server')).length, 0);
  console.log('PASS a stalled server times out, retains edits and permits the next sync attempt');
} finally {
  axios.create = createOriginal;
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  clearScheduledSync();
}

// The same timeout applies to bootstrap, uploads, downloads and pull requests.
const hanging = http.createServer(() => {});
await new Promise<void>(resolve => hanging.listen(0, '127.0.0.1', resolve));
const hangingAddress = hanging.address();
assert.ok(hangingAddress && typeof hangingAddress !== 'string');
try {
  const transport = createServerTransport(`http://127.0.0.1:${hangingAddress.port}`, 'token', { timeoutMs: 50 });
  for (const request of [() => transport.inspectBootstrap!(), () => transport.pull(null), () => transport.push([]), () => transport.getBlob('sha256:test'), () => transport.putBlob('sha256:test', new Uint8Array([1]))]) {
    await assert.rejects(request, /超时/);
  }
  assert.equal(await transport.hasBlob('sha256:test'), false);
} finally {
  hanging.closeAllConnections();
  await new Promise<void>(resolve => hanging.close(() => resolve()));
}

const originalFetch = globalThis.fetch;
let cursor = 1;
let unavailable = false;
let refreshes = 0;
globalThis.fetch = async () => {
  if (unavailable) throw new TypeError('offline');
  return Response.json({ store_id: 'hosted-store', latest_cursor: String(cursor) });
};
setRuntimeConfigOverride({ appStorageMode: 'backend', apiBase: 'http://app.test' });
settings.sync.mode = 'local';
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
scheduled.length = 0;
const stop = watchBackendAppChanges(() => { refreshes++; });
try {
  await tick();
  assert.equal(refreshes, 1);
  cursor++;
  scheduled.shift()!.callback(); await tick();
  assert.equal(refreshes, 2, 'incoming device writes refresh a web page in default local mode');
  unavailable = true;
  scheduled.shift()!.callback(); await tick();
  unavailable = false; cursor++;
  scheduled.shift()!.callback(); await tick();
  assert.equal(refreshes, 3, 'watching recovers after a connection failure');
  stop();
  scheduled.shift()?.callback(); await tick();
  assert.equal(refreshes, 3);
} finally {
  stop(); globalThis.fetch = originalFetch;
}
console.log('PASS primary-data watching refreshes the default web mode and recovers after disconnect');
console.log('syncRuntimeRecovery.spec passed');
