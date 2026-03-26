import assert from 'node:assert/strict';

import { acquireWebDavLease } from '../src/domain/sync/webdav/webdavLease.js';
import {
  hasWebDavBlob,
  listWebDavBlobHashes,
  pullWebDavChanges,
  pushWebDavBatch,
  readWebDavRemoteState,
  verifyWebDavPushResult,
} from '../src/domain/sync/webdav/webdavRemoteLayout.js';
import { ensureWebDavLayout } from '../src/domain/sync/webdav/webdavRequest.js';
import { createWebDavTransport } from '../src/domain/sync/webdavSyncTransport.js';

type FetchCall = {
  url: string;
  method: string;
  body?: string;
};

class FakeDomParser {
  parseFromString(xml: string) {
    const hrefs = Array.from(xml.matchAll(/<href>(.*?)<\/href>/g)).map((match) => match[1]);
    return {
      getElementsByTagNameNS(_ns: string, tag: string) {
        if (tag !== 'response') return [];
        return hrefs.map((href) => ({
          getElementsByTagNameNS(_innerNs: string, innerTag: string) {
            if (innerTag !== 'href') return [];
            return [{ textContent: href }];
          },
        }));
      },
    };
  }
}

function createJsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

async function withMockedWebDav<T>(
  handler: (input: string, init?: RequestInit) => Promise<Response> | Response,
  run: (calls: FetchCall[]) => Promise<T>,
) {
  const originalFetch = globalThis.fetch;
  const originalDomParser = (globalThis as typeof globalThis & { DOMParser?: unknown }).DOMParser;
  const calls: FetchCall[] = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const method = init?.method || (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET');
    calls.push({
      url,
      method,
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    try {
      return await handler(url, init);
    } catch (error) {
      if (method === 'GET' && url.endsWith('/pending-write.json')) {
        return new Response('', { status: 404 });
      }
      throw error;
    }
  }) as typeof fetch;
  (globalThis as typeof globalThis & { DOMParser?: unknown }).DOMParser = FakeDomParser as unknown as typeof DOMParser;

  try {
    return await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as typeof globalThis & { DOMParser?: unknown }).DOMParser = originalDomParser;
  }
}

async function testEnsureWebDavLayoutRecursivelyCreatesParents() {
  let rootCreateAttempts = 0;
  await withMockedWebDav(
    (url, init) => {
      if (init?.method !== 'MKCOL') return new Response('', { status: 405 });
      if (url === 'https://dav.example.com/base/bemo-sync') {
        rootCreateAttempts += 1;
        return new Response('', { status: rootCreateAttempts === 1 ? 409 : 201 });
      }
      return new Response('', { status: 201 });
    },
    async (calls) => {
      await ensureWebDavLayout('https://dav.example.com/base/bemo-sync', {});
      const mkcolUrls = calls.filter((call) => call.method === 'MKCOL').map((call) => call.url);
      assert.deepEqual(mkcolUrls.slice(0, 5), [
        'https://dav.example.com/base/bemo-sync',
        'https://dav.example.com/base',
        'https://dav.example.com/base/bemo-sync',
        'https://dav.example.com/base/bemo-sync/batches',
        'https://dav.example.com/base/bemo-sync/blobs',
      ]);
    },
  );
}

async function testAcquireWebDavLeaseFailsWhenConfirmationChanges() {
  let leaseReads = 0;
  await withMockedWebDav(
    (_url, init) => {
      if (init?.method === 'GET') {
        leaseReads += 1;
        if (leaseReads === 1) return new Response('', { status: 404 });
        return createJsonResponse({
          device_id: 'device-other',
          token: 'different-token',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (init?.method === 'PUT') {
        return new Response('', { status: 200 });
      }
      return new Response('', { status: 405 });
    },
    async () => {
      const lease = await acquireWebDavLease('https://dav.example.com/base/bemo-sync', {}, 'device-a');
      assert.equal(lease, null);
    },
  );
}

async function testAcquireWebDavLeaseUsesConditionalCreateWhenLeaseIsMissing() {
  let leasePutHeaders: Headers | null = null;
  let leaseRecord: Record<string, unknown> | null = null;
  await withMockedWebDav(
    (url, init) => {
      if (init?.method === 'GET' && url.endsWith('/lease.json')) {
        return leasePutHeaders
          ? createJsonResponse(leaseRecord)
          : new Response('', { status: 404 });
      }
      if (init?.method === 'PUT' && url.endsWith('/lease.json')) {
        leasePutHeaders = new Headers(init.headers);
        leaseRecord = JSON.parse(String(init.body || '{}')) as Record<string, unknown>;
        return new Response('', { status: 200 });
      }
      return new Response('', { status: 405 });
    },
    async () => {
      const lease = await acquireWebDavLease('https://dav.example.com/base/bemo-sync', {}, 'device-a');
      assert.ok(lease);
      assert.equal(leasePutHeaders?.get('If-None-Match'), '*');
    },
  );
}

async function testPullWebDavChangesReadsBatchTailWithoutDirectoryScan() {
  await withMockedWebDav(
    (url, init) => {
      if (init?.method === 'GET' && url.endsWith('/manifest.json')) {
        return createJsonResponse({
          format_version: 2,
          latest_cursor: '5',
          snapshot_cursor: '5',
          latest_snapshot: 'snapshot_00000005.json',
          batches: [{
            batch_id: 'batch_00000004_00000005',
            file: 'batch_00000004_00000005.json',
            started_after_cursor: '3',
            latest_cursor: '5',
            change_count: 2,
            operation_ids: ['op-4', 'op-5'],
          }],
          updated_at: '2026-03-18T00:00:00.000Z',
        });
      }
      if (init?.method === 'GET' && url.endsWith('/batch-index.json')) {
        return new Response('', { status: 404 });
      }
      if (init?.method === 'GET' && url.endsWith('/batches/batch_00000004_00000005.json')) {
        return createJsonResponse({
          format_version: 2,
          batch_id: 'batch_00000004_00000005',
          started_after_cursor: '3',
          latest_cursor: '5',
          generated_at: '2026-03-18T00:00:00.000Z',
          changes: [
            { operation_id: 'op-4', entity_id: 'note-4', type: 'note.update', cursor: '4', payload: { content: 'a' } },
            { operation_id: 'op-5', entity_id: 'note-5', type: 'note.update', cursor: '5', payload: { content: 'b' } },
          ],
        });
      }
      throw new Error(`unexpected request ${init?.method || 'GET'} ${url}`);
    },
    async (calls) => {
      const result = await pullWebDavChanges('https://dav.example.com/base/bemo-sync', {}, '3');
      assert.equal(result.latestCursor, '5');
      assert.equal(result.changes.length, 2);
      assert.equal(calls.some((call) => call.method === 'PROPFIND'), false);
    },
  );
}

async function testPushWebDavBatchSkipsDuplicateOperationFromManifest() {
  await withMockedWebDav(
    (url, init) => {
      if (init?.method === 'GET' && url.endsWith('/pending-write.json')) {
        return new Response('', { status: 404 });
      }
      if (init?.method === 'GET' && url.endsWith('/manifest.json')) {
        return createJsonResponse({
          format_version: 2,
          latest_cursor: '9',
          snapshot_cursor: '9',
          latest_snapshot: 'snapshot_00000009.json',
          batches: [{
            batch_id: 'batch_00000009_00000009',
            file: 'batch_00000009_00000009.json',
            started_after_cursor: '8',
            latest_cursor: '9',
            change_count: 1,
          }],
          updated_at: '2026-03-18T00:00:00.000Z',
        });
      }
      if (init?.method === 'GET' && url.endsWith('/batch-index.json')) {
        return createJsonResponse({
          format_version: 2,
          latest_cursor: '9',
          snapshot_cursor: '9',
          latest_snapshot: 'snapshot_00000009.json',
          batches: [{
            batch_id: 'batch_00000009_00000009',
            file: 'batch_00000009_00000009.json',
            started_after_cursor: '8',
            latest_cursor: '9',
            change_count: 1,
            operation_ids: ['op-1'],
          }],
          accepted_operations: {
            'op-1': '9',
          },
          updated_at: '2026-03-18T00:00:00.000Z',
        });
      }
      if (init?.method === 'PUT') {
        throw new Error('unexpected PUT for deduplicated batch');
      }
      return new Response('', { status: 404 });
    },
    async () => {
      const result = await pushWebDavBatch(
        'https://dav.example.com/base/bemo-sync',
        {},
        [
          { operation_id: 'op-1', entity_id: 'note-1', type: 'note.update', payload: {} },
        ],
      );
      assert.equal(result.latestCursor, '9');
      assert.equal('deduplicated' in result.accepted[0] && result.accepted[0].deduplicated, true);
    },
  );
}

async function testTransportPullUsesSnapshotBootstrapWhenCursorMissing() {
  await withMockedWebDav(
    (url, init) => {
      if (init?.method === 'MKCOL') return new Response('', { status: 405 });
      if (init?.method === 'GET' && url.endsWith('/pending-write.json')) {
        return new Response('', { status: 404 });
      }
      if (init?.method === 'GET' && url.endsWith('/manifest.json')) {
        return createJsonResponse({
          format_version: 2,
          latest_cursor: '12',
          snapshot_cursor: '12',
          latest_snapshot: 'snapshot_00000012.json',
          batches: [],
          updated_at: '2026-03-18T00:00:00.000Z',
        });
      }
      if (init?.method === 'GET' && url.endsWith('/batch-index.json')) {
        return new Response('', { status: 404 });
      }
      if (init?.method === 'GET' && url.endsWith('/snapshots/snapshot_00000012.json')) {
        return createJsonResponse({
          format_version: 2,
          latest_cursor: '12',
          generated_at: '2026-03-18T00:00:00.000Z',
          notes: {
            'note-1': {
              note_id: 'note-1',
              revision: 2,
              filename: 'note-1.md',
              content: 'from snapshot',
              tags: ['snap'],
              pinned: false,
              created_at: '2026-03-18T00:00:00.000Z',
              updated_at: '2026-03-18T00:01:00.000Z',
              attachments: [],
            },
          },
        });
      }
      throw new Error(`unexpected request ${init?.method || 'GET'} ${url}`);
    },
    async () => {
      const transport = createWebDavTransport({
        webdavUrl: 'https://dav.example.com/base',
        username: 'demo',
        password: 'secret',
        basePath: '',
      });
      const result = await transport.pull(null);
      assert.equal(result.latest_cursor, '12');
      assert.equal(result.changes.length, 1);
      assert.equal(result.changes[0].device_id, 'snapshot');
      assert.equal(result.changes[0].payload?.content, 'from snapshot');
    },
  );
}

async function testPullWebDavChangesReadsShardedSnapshotIncrementally() {
  await withMockedWebDav(
    (url, init) => {
      if (init?.method === 'GET' && url.endsWith('/manifest.json')) {
        return createJsonResponse({
          format_version: 2,
          latest_cursor: '12',
          snapshot_cursor: '12',
          latest_snapshot: 'snapshot_00000012.json',
          batches: [],
          updated_at: '2026-03-18T00:00:00.000Z',
        });
      }
      if (init?.method === 'GET' && url.endsWith('/batch-index.json')) {
        return new Response('', { status: 404 });
      }
      if (init?.method === 'GET' && url.endsWith('/snapshots/snapshot_00000012.json')) {
        return createJsonResponse({
          format_version: 2,
          latest_cursor: '12',
          generated_at: '2026-03-18T00:00:00.000Z',
          note_count: 2,
          shards: [
            { file: 'snapshot_00000012.json.part_0001.json', note_count: 1, estimated_bytes: 120 },
            { file: 'snapshot_00000012.json.part_0002.json', note_count: 1, estimated_bytes: 120 },
          ],
        });
      }
      if (init?.method === 'GET' && url.endsWith('/snapshots/snapshot_00000012.json.part_0001.json')) {
        return createJsonResponse({
          format_version: 2,
          latest_cursor: '12',
          generated_at: '2026-03-18T00:00:00.000Z',
          notes: {
            'note-1': {
              note_id: 'note-1',
              scope: 'active',
              revision: 1,
              filename: 'note-1.md',
              content: 'part one',
              tags: [],
              pinned: false,
              created_at: '2026-03-18T00:00:00.000Z',
              updated_at: '2026-03-18T00:00:00.000Z',
              attachments: [],
            },
          },
        });
      }
      if (init?.method === 'GET' && url.endsWith('/snapshots/snapshot_00000012.json.part_0002.json')) {
        return createJsonResponse({
          format_version: 2,
          latest_cursor: '12',
          generated_at: '2026-03-18T00:00:00.000Z',
          notes: {
            'note-2': {
              note_id: 'note-2',
              scope: 'active',
              revision: 1,
              filename: 'note-2.md',
              content: 'part two',
              tags: [],
              pinned: false,
              created_at: '2026-03-18T00:00:00.000Z',
              updated_at: '2026-03-18T00:00:00.000Z',
              attachments: [],
            },
          },
        });
      }
      throw new Error(`unexpected request ${init?.method || 'GET'} ${url}`);
    },
    async () => {
      const first = await pullWebDavChanges('https://dav.example.com/base/bemo-sync', {}, null);
      assert.equal(first.latestCursor, 'snapshot-bootstrap:snapshot_00000012.json:1');
      assert.equal(first.changes.length, 1);
      assert.equal(first.changes[0].entity_id, 'note-1');

      const second = await pullWebDavChanges(
        'https://dav.example.com/base/bemo-sync',
        {},
        'snapshot-bootstrap:snapshot_00000012.json:1',
      );
      assert.equal(second.latestCursor, '12');
      assert.equal(second.changes.length, 1);
      assert.equal(second.changes[0].entity_id, 'note-2');
    },
  );
}

async function testHasWebDavBlobFallsBackToPropfindWhenHeadIsUnsupported() {
  await withMockedWebDav(
    (url, init) => {
      if (init?.method === 'HEAD' && url.endsWith('/blobs/sha256/ab/abcdef')) {
        return new Response('', { status: 405 });
      }
      if (init?.method === 'PROPFIND' && url.endsWith('/blobs/sha256/ab/abcdef')) {
        return new Response('<?xml version="1.0"?><multistatus xmlns="DAV:"></multistatus>', { status: 207 });
      }
      throw new Error(`unexpected request ${init?.method || 'GET'} ${url}`);
    },
    async () => {
      const exists = await hasWebDavBlob('https://dav.example.com/base/bemo-sync', {}, 'sha256:abcdef');
      assert.equal(exists, true);
    },
  );
}

async function testListWebDavBlobHashesFallsBackWhenDepthInfinityIsRejected() {
  await withMockedWebDav(
    (url, init) => {
      if (init?.method === 'PROPFIND' && url.endsWith('/blobs/') && init.headers && new Headers(init.headers).get('Depth') === 'infinity') {
        return new Response('', { status: 403 });
      }
      if (init?.method === 'PROPFIND' && url.endsWith('/blobs/') && new Headers(init.headers).get('Depth') === '1') {
        return new Response([
          '<?xml version="1.0"?>',
          '<multistatus xmlns="DAV:">',
          '<response><href>/base/bemo-sync/blobs/</href></response>',
          '<response><href>/base/bemo-sync/blobs/sha256/</href></response>',
          '</multistatus>',
        ].join(''), { status: 207 });
      }
      if (init?.method === 'PROPFIND' && url.endsWith('/blobs/sha256/') && new Headers(init.headers).get('Depth') === '1') {
        return new Response([
          '<?xml version="1.0"?>',
          '<multistatus xmlns="DAV:">',
          '<response><href>/base/bemo-sync/blobs/sha256/</href></response>',
          '<response><href>/base/bemo-sync/blobs/sha256/ab/</href></response>',
          '<response><href>/base/bemo-sync/blobs/sha256/cd/</href></response>',
          '</multistatus>',
        ].join(''), { status: 207 });
      }
      if (init?.method === 'PROPFIND' && url.endsWith('/blobs/sha256/ab/') && new Headers(init.headers).get('Depth') === '1') {
        return new Response([
          '<?xml version="1.0"?>',
          '<multistatus xmlns="DAV:">',
          '<response><href>/base/bemo-sync/blobs/sha256/ab/</href></response>',
          '<response><href>/base/bemo-sync/blobs/sha256/ab/abcdef</href></response>',
          '</multistatus>',
        ].join(''), { status: 207 });
      }
      if (init?.method === 'PROPFIND' && url.endsWith('/blobs/sha256/cd/') && new Headers(init.headers).get('Depth') === '1') {
        return new Response([
          '<?xml version="1.0"?>',
          '<multistatus xmlns="DAV:">',
          '<response><href>/base/bemo-sync/blobs/sha256/cd/</href></response>',
          '<response><href>/base/bemo-sync/blobs/sha256/cd/cdef12</href></response>',
          '</multistatus>',
        ].join(''), { status: 207 });
      }
      throw new Error(`unexpected request ${init?.method || 'GET'} ${url}`);
    },
    async () => {
      const hashes = await listWebDavBlobHashes('https://dav.example.com/base/bemo-sync', {});
      assert.deepEqual(hashes, ['sha256:abcdef', 'sha256:cdef12']);
    },
  );
}

async function testReadWebDavRemoteStateRepairsManifestWithoutSnapshot() {
  let writtenManifest: Record<string, unknown> | null = null;
  let currentManifest: Record<string, unknown> = {
    format_version: 2,
    latest_cursor: '5',
    snapshot_cursor: '0',
    latest_snapshot: null,
    batches: [],
    updated_at: '2026-03-18T00:00:00.000Z',
  };
  await withMockedWebDav(
    (url, init) => {
      if (init?.method === 'GET' && url.endsWith('/pending-write.json')) {
        return new Response('', { status: 404 });
      }
      if (init?.method === 'GET' && url.endsWith('/manifest.json')) {
        return createJsonResponse(currentManifest);
      }
      if (init?.method === 'GET' && url.endsWith('/batch-index.json')) {
        return createJsonResponse({
          format_version: 2,
          latest_cursor: '6',
          snapshot_cursor: '0',
          latest_snapshot: null,
          batches: [{
            batch_id: 'batch_00000006_00000006',
            file: 'batch_00000006_00000006.json',
            started_after_cursor: '5',
            latest_cursor: '6',
            change_count: 1,
            operation_ids: ['op-6'],
          }],
          accepted_operations: {
            'op-6': '6',
          },
          updated_at: '2026-03-18T00:01:00.000Z',
        });
      }
      if (init?.method === 'GET' && url.endsWith('/lease.json')) {
        return new Response('', { status: 404 });
      }
      if (init?.method === 'PUT' && url.endsWith('/manifest.json')) {
        writtenManifest = JSON.parse(String(init.body || '{}')) as Record<string, unknown>;
        currentManifest = writtenManifest;
        return new Response('', { status: 200 });
      }
      throw new Error(`unexpected request ${init?.method || 'GET'} ${url}`);
    },
    async () => {
      const state = await readWebDavRemoteState('https://dav.example.com/base/bemo-sync', {});
      assert.equal(state.manifest.latest_cursor, '6');
      assert.equal(state.manifest.latest_snapshot, null);
      assert.equal(state.manifest.batches.length, 1);
      assert.ok(writtenManifest);
      assert.equal(writtenManifest.latest_cursor, '6');
    },
  );
}

async function testVerifyWebDavPushResultDetectsConcurrentOverwrite() {
  await withMockedWebDav(
    (url, init) => {
      if (init?.method === 'GET' && url.endsWith('/pending-write.json')) {
        return new Response('', { status: 404 });
      }
      if (init?.method === 'GET' && url.endsWith('/manifest.json')) {
        return createJsonResponse({
          format_version: 2,
          latest_cursor: '6',
          snapshot_cursor: '0',
          latest_snapshot: null,
          batches: [{
            batch_id: 'batch_00000006_00000006',
            file: 'batch_00000006_00000006.json',
            started_after_cursor: '5',
            latest_cursor: '6',
            change_count: 1,
          }],
          updated_at: '2026-03-18T00:00:00.000Z',
        });
      }
      if (init?.method === 'GET' && url.endsWith('/batch-index.json')) {
        return createJsonResponse({
          format_version: 2,
          latest_cursor: '6',
          snapshot_cursor: '0',
          latest_snapshot: null,
          batches: [{
            batch_id: 'batch_00000006_00000006',
            file: 'batch_00000006_00000006.json',
            started_after_cursor: '5',
            latest_cursor: '6',
            change_count: 1,
            operation_ids: ['other-op'],
          }],
          accepted_operations: {
            'other-op': '6',
          },
          updated_at: '2026-03-18T00:01:00.000Z',
        });
      }
      throw new Error(`unexpected request ${init?.method || 'GET'} ${url}`);
    },
    async () => {
      await assert.rejects(
        verifyWebDavPushResult('https://dav.example.com/base/bemo-sync', {}, [{
          operation_id: 'op-6',
          cursor: '6',
        }], '6'),
        /并发写入冲突/,
      );
    },
  );
}

async function testPushWebDavBatchUsesConditionalMetadataCommit() {
  const metadataHeaders: Array<{ url: string; ifMatch: string | null }> = [];
  let pendingWriteBody: Record<string, unknown> | null = null;

  await withMockedWebDav(
    (url, init) => {
      if (init?.method === 'GET' && url.endsWith('/pending-write.json')) {
        return new Response('', { status: 404 });
      }
      if (init?.method === 'GET' && url.endsWith('/manifest.json')) {
        return new Response(JSON.stringify({
          format_version: 2,
          latest_cursor: '0',
          snapshot_cursor: '0',
          latest_snapshot: null,
          batches: [],
          updated_at: '2026-03-18T00:00:00.000Z',
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ETag: '"manifest-v1"',
          },
        });
      }
      if (init?.method === 'GET' && url.endsWith('/batch-index.json')) {
        return new Response(JSON.stringify({
          format_version: 2,
          latest_cursor: '0',
          snapshot_cursor: '0',
          latest_snapshot: null,
          batches: [],
          accepted_operations: {},
          updated_at: '2026-03-18T00:00:00.000Z',
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ETag: '"batch-v1"',
          },
        });
      }
      if (init?.method === 'PUT' && url.endsWith('/pending-write.json')) {
        pendingWriteBody = JSON.parse(String(init.body || '{}')) as Record<string, unknown>;
        return new Response('', { status: 200 });
      }
      if (init?.method === 'PUT' && (url.endsWith('/batch-index.json') || url.endsWith('/manifest.json'))) {
        metadataHeaders.push({
          url,
          ifMatch: new Headers(init.headers).get('If-Match'),
        });
        return new Response('', { status: 200 });
      }
      if (init?.method === 'DELETE' && url.endsWith('/pending-write.json')) {
        return new Response(null, { status: 204 });
      }
      if (init?.method === 'PUT') {
        return new Response('', { status: 200 });
      }
      throw new Error(`unexpected request ${init?.method || 'GET'} ${url}`);
    },
    async (calls) => {
      const result = await pushWebDavBatch(
        'https://dav.example.com/base/bemo-sync',
        {},
        [{ operation_id: 'op-1', entity_id: 'note-1', type: 'note.create', payload: { revision: 1, content: 'hello' } }],
      );
      const typedPendingWrite = pendingWriteBody as { next_manifest?: { latest_cursor?: string } };
      assert.equal(result.latestCursor, '1');
      assert.ok(pendingWriteBody);
      assert.equal(typedPendingWrite.next_manifest?.latest_cursor, '1');
      assert.deepEqual(metadataHeaders, [
        {
          url: 'https://dav.example.com/base/bemo-sync/batch-index.json',
          ifMatch: '"batch-v1"',
        },
        {
          url: 'https://dav.example.com/base/bemo-sync/manifest.json',
          ifMatch: '"manifest-v1"',
        },
      ]);
      const pendingWriteIndex = calls.findIndex((call) => call.url.endsWith('/pending-write.json') && call.method === 'PUT');
      const batchIndexIndex = calls.findIndex((call) => call.url.endsWith('/batch-index.json') && call.method === 'PUT');
      const manifestIndex = calls.findIndex((call) => call.url.endsWith('/manifest.json') && call.method === 'PUT');
      const deletePendingIndex = calls.findIndex((call) => call.url.endsWith('/pending-write.json') && call.method === 'DELETE');
      assert.ok(pendingWriteIndex >= 0 && pendingWriteIndex < batchIndexIndex);
      assert.ok(batchIndexIndex >= 0 && batchIndexIndex < manifestIndex);
      assert.ok(manifestIndex >= 0 && manifestIndex < deletePendingIndex);
    },
  );
}

async function testReadWebDavRemoteStateRecoversPendingWriteAfterBatchIndexCommit() {
  let manifestRewriteHeaders: Headers | null = null;
  let currentManifest: Record<string, unknown> = {
    format_version: 2,
    latest_cursor: '0',
    snapshot_cursor: '0',
    latest_snapshot: null,
    batches: [],
    updated_at: '2026-03-18T00:00:00.000Z',
  };

  await withMockedWebDav(
    (url, init) => {
      if (init?.method === 'GET' && url.endsWith('/pending-write.json')) {
        return createJsonResponse({
          format_version: 2,
          transaction_id: 'pending-1',
          created_at: '2026-03-18T00:00:00.000Z',
          previous_manifest: {
            format_version: 2,
            latest_cursor: '0',
            snapshot_cursor: '0',
            latest_snapshot: null,
            batches: [],
            updated_at: '2026-03-18T00:00:00.000Z',
          },
          previous_batch_index: {
            format_version: 2,
            latest_cursor: '0',
            snapshot_cursor: '0',
            latest_snapshot: null,
            batches: [],
            accepted_operations: {},
            updated_at: '2026-03-18T00:00:00.000Z',
          },
          next_manifest: {
            format_version: 2,
            latest_cursor: '1',
            snapshot_cursor: '1',
            latest_snapshot: 'snapshot_00000001.json',
            batches: [{
              batch_id: 'batch_00000001_00000001',
              file: 'batch_00000001_00000001.json',
              started_after_cursor: '0',
              latest_cursor: '1',
              change_count: 1,
            }],
            updated_at: '2026-03-18T00:01:00.000Z',
          },
          next_batch_index: {
            format_version: 2,
            latest_cursor: '1',
            snapshot_cursor: '1',
            latest_snapshot: 'snapshot_00000001.json',
            batches: [{
              batch_id: 'batch_00000001_00000001',
              file: 'batch_00000001_00000001.json',
              started_after_cursor: '0',
              latest_cursor: '1',
              change_count: 1,
              operation_ids: ['op-1'],
            }],
            accepted_operations: {
              'op-1': '1',
            },
            updated_at: '2026-03-18T00:01:00.000Z',
          },
        });
      }
      if (init?.method === 'GET' && url.endsWith('/lease.json')) {
        return new Response('', { status: 404 });
      }
      if (init?.method === 'GET' && url.endsWith('/manifest.json')) {
        return new Response(JSON.stringify(currentManifest), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ETag: '"manifest-v1"',
          },
        });
      }
      if (init?.method === 'GET' && url.endsWith('/batch-index.json')) {
        return createJsonResponse({
          format_version: 2,
          latest_cursor: '1',
          snapshot_cursor: '1',
          latest_snapshot: 'snapshot_00000001.json',
          batches: [{
            batch_id: 'batch_00000001_00000001',
            file: 'batch_00000001_00000001.json',
            started_after_cursor: '0',
            latest_cursor: '1',
            change_count: 1,
            operation_ids: ['op-1'],
          }],
          accepted_operations: {
            'op-1': '1',
          },
          updated_at: '2026-03-18T00:01:00.000Z',
        });
      }
      if (init?.method === 'PUT' && url.endsWith('/manifest.json')) {
        manifestRewriteHeaders = new Headers(init.headers);
        currentManifest = JSON.parse(String(init.body || '{}')) as Record<string, unknown>;
        return new Response('', { status: 200 });
      }
      if (init?.method === 'DELETE' && url.endsWith('/pending-write.json')) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected request ${init?.method || 'GET'} ${url}`);
    },
    async () => {
      const state = await readWebDavRemoteState('https://dav.example.com/base/bemo-sync', {});
      assert.equal(state.manifest.latest_cursor, '1');
      assert.equal(state.batchIndex.latest_cursor, '1');
      assert.equal(manifestRewriteHeaders?.get('If-Match'), '"manifest-v1"');
    },
  );
}

async function testReadWebDavRemoteStateCleansIncompletePendingArtifacts() {
  const deletedUrls: string[] = [];

  await withMockedWebDav(
    (url, init) => {
      if (init?.method === 'GET' && url.endsWith('/pending-write.json')) {
        return createJsonResponse({
          format_version: 2,
          transaction_id: 'pending-2',
          created_at: '2026-03-18T00:00:00.000Z',
          previous_manifest: {
            format_version: 2,
            latest_cursor: '0',
            snapshot_cursor: '0',
            latest_snapshot: null,
            batches: [],
            updated_at: '2026-03-18T00:00:00.000Z',
          },
          previous_batch_index: {
            format_version: 2,
            latest_cursor: '0',
            snapshot_cursor: '0',
            latest_snapshot: null,
            batches: [],
            accepted_operations: {},
            updated_at: '2026-03-18T00:00:00.000Z',
          },
          next_manifest: {
            format_version: 2,
            latest_cursor: '1',
            snapshot_cursor: '1',
            latest_snapshot: 'snapshot_00000001.json',
            batches: [{
              batch_id: 'batch_00000001_00000001',
              file: 'batch_00000001_00000001.json',
              started_after_cursor: '0',
              latest_cursor: '1',
              change_count: 1,
            }],
            updated_at: '2026-03-18T00:01:00.000Z',
          },
          next_batch_index: {
            format_version: 2,
            latest_cursor: '1',
            snapshot_cursor: '1',
            latest_snapshot: 'snapshot_00000001.json',
            batches: [{
              batch_id: 'batch_00000001_00000001',
              file: 'batch_00000001_00000001.json',
              started_after_cursor: '0',
              latest_cursor: '1',
              change_count: 1,
              operation_ids: ['op-1'],
            }],
            accepted_operations: {
              'op-1': '1',
            },
            updated_at: '2026-03-18T00:01:00.000Z',
          },
          staged_files: {
            batch_files: ['batch_00000001_00000001.json'],
            snapshot_files: ['snapshot_00000001.json'],
          },
        });
      }
      if (init?.method === 'GET' && url.endsWith('/lease.json')) {
        return new Response('', { status: 404 });
      }
      if (init?.method === 'GET' && url.endsWith('/manifest.json')) {
        return createJsonResponse({
          format_version: 2,
          latest_cursor: '0',
          snapshot_cursor: '0',
          latest_snapshot: null,
          batches: [],
          updated_at: '2026-03-18T00:00:00.000Z',
        });
      }
      if (init?.method === 'GET' && url.endsWith('/batch-index.json')) {
        return createJsonResponse({
          format_version: 2,
          latest_cursor: '0',
          snapshot_cursor: '0',
          latest_snapshot: null,
          batches: [],
          accepted_operations: {},
          updated_at: '2026-03-18T00:00:00.000Z',
        });
      }
      if (init?.method === 'HEAD' && url.endsWith('/batches/batch_00000001_00000001.json')) {
        return new Response('', { status: 404 });
      }
      if (init?.method === 'DELETE' && (
        url.endsWith('/batches/batch_00000001_00000001.json')
        || url.endsWith('/snapshots/snapshot_00000001.json')
        || url.endsWith('/pending-write.json')
      )) {
        deletedUrls.push(url);
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected request ${init?.method || 'GET'} ${url}`);
    },
    async () => {
      const state = await readWebDavRemoteState('https://dav.example.com/base/bemo-sync', {});
      assert.equal(state.manifest.latest_cursor, '0');
      assert.equal(state.batchIndex.latest_cursor, '0');
      assert.deepEqual(deletedUrls, [
        'https://dav.example.com/base/bemo-sync/batches/batch_00000001_00000001.json',
        'https://dav.example.com/base/bemo-sync/snapshots/snapshot_00000001.json',
        'https://dav.example.com/base/bemo-sync/pending-write.json',
      ]);
    },
  );
}

async function testCleanupUnusedBlobsDeletesOnlyUnreferencedRemoteBlobs() {
  await withMockedWebDav(
    (url, init) => {
      if (init?.method === 'MKCOL') return new Response('', { status: 405 });
      if (init?.method === 'GET' && url.endsWith('/pending-write.json')) {
        return new Response('', { status: 404 });
      }
      if (init?.method === 'GET' && url.endsWith('/manifest.json')) {
        return createJsonResponse({
          format_version: 2,
          latest_cursor: '5',
          snapshot_cursor: '5',
          latest_snapshot: 'snapshot_00000005.json',
          batches: [],
          updated_at: '2026-03-18T00:00:00.000Z',
        });
      }
      if (init?.method === 'GET' && url.endsWith('/batch-index.json')) {
        return new Response('', { status: 404 });
      }
      if (init?.method === 'GET' && url.endsWith('/snapshots/snapshot_00000005.json')) {
        return createJsonResponse({
          format_version: 2,
          latest_cursor: '5',
          generated_at: '2026-03-18T00:00:00.000Z',
          notes: {
            'note-1': {
              note_id: 'note-1',
              revision: 1,
              filename: 'note-1.md',
              content: 'with attachment',
              tags: [],
              pinned: false,
              created_at: '2026-03-18T00:00:00.000Z',
              updated_at: '2026-03-18T00:00:00.000Z',
              attachments: [{
                filename: 'keep.png',
                blob_hash: 'sha256:keep',
                mime_type: 'image/png',
              }],
            },
          },
        });
      }
      if (init?.method === 'PROPFIND' && url.endsWith('/blobs/')) {
        return new Response(
          [
            '<?xml version="1.0"?>',
            '<multistatus xmlns="DAV:">',
            '<response><href>/base/bemo-sync/blobs/sha256/ke/keep</href></response>',
            '<response><href>/base/bemo-sync/blobs/sha256/dr/drop</href></response>',
            '</multistatus>',
          ].join(''),
          { status: 207 },
        );
      }
      if (init?.method === 'DELETE' && url.endsWith('/blobs/sha256/dr/drop')) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected request ${init?.method || 'GET'} ${url}`);
    },
    async (calls) => {
      const transport = createWebDavTransport({
        webdavUrl: 'https://dav.example.com/base',
        username: 'demo',
        password: 'secret',
        basePath: '',
      });
      const result = await transport.cleanupUnusedBlobs?.();
      assert.deepEqual(result, { deleted: 1, retained: 1 });
      const deleteCalls = calls.filter((call) => call.method === 'DELETE').map((call) => call.url);
      assert.deepEqual(deleteCalls, ['https://dav.example.com/base/bemo-sync/blobs/sha256/dr/drop']);
    },
  );
}

await testEnsureWebDavLayoutRecursivelyCreatesParents();
await testAcquireWebDavLeaseFailsWhenConfirmationChanges();
await testAcquireWebDavLeaseUsesConditionalCreateWhenLeaseIsMissing();
await testPullWebDavChangesReadsBatchTailWithoutDirectoryScan();
await testPushWebDavBatchSkipsDuplicateOperationFromManifest();
await testTransportPullUsesSnapshotBootstrapWhenCursorMissing();
await testPullWebDavChangesReadsShardedSnapshotIncrementally();
await testHasWebDavBlobFallsBackToPropfindWhenHeadIsUnsupported();
await testListWebDavBlobHashesFallsBackWhenDepthInfinityIsRejected();
await testReadWebDavRemoteStateRepairsManifestWithoutSnapshot();
await testVerifyWebDavPushResultDetectsConcurrentOverwrite();
await testPushWebDavBatchUsesConditionalMetadataCommit();
await testReadWebDavRemoteStateRecoversPendingWriteAfterBatchIndexCommit();
await testReadWebDavRemoteStateCleansIncompletePendingArtifacts();
await testCleanupUnusedBlobsDeletesOnlyUnreferencedRemoteBlobs();

console.log('webdavProtocol.spec passed');
