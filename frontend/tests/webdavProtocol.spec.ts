import assert from 'node:assert/strict';

import { listWebDavChangeFiles, pushWebDavChanges } from '../src/domain/sync/webdav/webdavChanges.js';
import { acquireWebDavLease } from '../src/domain/sync/webdav/webdavLease.js';
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
    return handler(url, init);
  }) as typeof fetch;
  (globalThis as typeof globalThis & { DOMParser?: unknown }).DOMParser = FakeDomParser as unknown as typeof DOMParser;

  try {
    return await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as typeof globalThis & { DOMParser?: unknown }).DOMParser = originalDomParser;
  }
}

async function testListWebDavChangeFilesHandlesHrefVariants() {
  await withMockedWebDav(
    (url, init) => {
      if (init?.method === 'PROPFIND' && url.endsWith('/changes/')) {
        return new Response(
          [
            '<?xml version="1.0"?>',
            '<multistatus xmlns="DAV:">',
            '<response><href>https://dav.example.com/base/bemo-sync/changes/0000/00000001_abs.json</href></response>',
            '<response><href>/base/bemo-sync/changes/0000/00000002_root.json</href></response>',
            '<response><href>0000/00000003_relative.json</href></response>',
            '</multistatus>',
          ].join(''),
          { status: 207 },
        );
      }
      if (init?.method === 'PROPFIND' && url.endsWith('/changes/0000/')) {
        return new Response(
          [
            '<?xml version="1.0"?>',
            '<multistatus xmlns="DAV:">',
            '<response><href>https://dav.example.com/base/bemo-sync/changes/0000/00000001_abs.json</href></response>',
            '<response><href>/base/bemo-sync/changes/0000/00000002_root.json</href></response>',
            '<response><href>00000003_relative.json</href></response>',
            '</multistatus>',
          ].join(''),
          { status: 207 },
        );
      }
      return new Response('', { status: 404 });
    },
    async () => {
      const files = await listWebDavChangeFiles(
        'https://dav.example.com/base/bemo-sync',
        {},
        '0',
        '3',
      );
      assert.deepEqual(files, [
        'https://dav.example.com/base/bemo-sync/changes/0000/00000001_abs.json',
        'https://dav.example.com/base/bemo-sync/changes/0000/00000002_root.json',
        'https://dav.example.com/base/bemo-sync/changes/0000/00000003_relative.json',
      ]);
    },
  );
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
      assert.deepEqual(mkcolUrls.slice(0, 3), [
        'https://dav.example.com/base/bemo-sync',
        'https://dav.example.com/base',
        'https://dav.example.com/base/bemo-sync',
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

async function testPushWebDavChangesSkipsExistingOperationMarker() {
  await withMockedWebDav(
    (url, init) => {
      if (init?.method === 'GET' && url.includes('/operations/op-1.json')) {
        return createJsonResponse({
          operation_id: 'op-1',
          cursor: '9',
          path: 'https://dav.example.com/base/bemo-sync/changes/0000/00000009_op-1.json',
          timestamp: '2026-03-18T00:00:00.000Z',
        });
      }
      if (init?.method === 'PUT') {
        throw new Error(`unexpected PUT ${url}`);
      }
      return new Response('', { status: 404 });
    },
    async () => {
      const result = await pushWebDavChanges('https://dav.example.com/base/bemo-sync', {}, 3, [
        { operation_id: 'op-1', entity_id: 'note-1', type: 'note.update', payload: {} },
      ]);
      assert.equal(result.latestCursor, 9);
      assert.equal(result.accepted[0].deduplicated, true);
    },
  );
}

async function testTransportPullUsesSnapshotBootstrapWhenCursorMissing() {
  await withMockedWebDav(
    (url, init) => {
      if (init?.method === 'MKCOL') return new Response('', { status: 405 });
      if (init?.method === 'GET' && url.endsWith('/manifest.json')) {
        return createJsonResponse({
          format_version: 1,
          latest_cursor: '12',
          latest_snapshot: 'snapshot_00000012.json',
          bootstrap: {
            status: 'completed',
            fingerprint: 'webdav:test',
            operation_ids: [],
            updated_at: '2026-03-18T00:00:00.000Z',
          },
          updated_at: '2026-03-18T00:00:00.000Z',
        });
      }
      if (init?.method === 'GET' && url.endsWith('/snapshots/snapshot_00000012.json')) {
        return createJsonResponse({
          format_version: 1,
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
        bootstrapFingerprint: 'webdav:test',
      });
      const result = await transport.pull(null);
      assert.equal(result.latest_cursor, '12');
      assert.equal(result.changes.length, 1);
      assert.equal(result.changes[0].device_id, 'snapshot');
      assert.equal(result.changes[0].payload.content, 'from snapshot');
    },
  );
}

async function testCleanupUnusedBlobsDeletesOnlyUnreferencedRemoteBlobs() {
  await withMockedWebDav(
    (url, init) => {
      if (init?.method === 'MKCOL') return new Response('', { status: 405 });
      if (init?.method === 'GET' && url.endsWith('/manifest.json')) {
        return createJsonResponse({
          format_version: 1,
          latest_cursor: '5',
          latest_snapshot: 'snapshot_00000005.json',
          bootstrap: {
            status: 'completed',
            fingerprint: 'webdav:test',
            operation_ids: [],
            updated_at: '2026-03-18T00:00:00.000Z',
          },
          updated_at: '2026-03-18T00:00:00.000Z',
        });
      }
      if (init?.method === 'GET' && url.endsWith('/snapshots/snapshot_00000005.json')) {
        return createJsonResponse({
          format_version: 1,
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
        bootstrapFingerprint: 'webdav:test',
      });
      const result = await transport.cleanupUnusedBlobs?.();
      assert.deepEqual(result, { deleted: 1, retained: 1 });
      const deleteCalls = calls.filter((call) => call.method === 'DELETE').map((call) => call.url);
      assert.deepEqual(deleteCalls, ['https://dav.example.com/base/bemo-sync/blobs/sha256/dr/drop']);
    },
  );
}

await testListWebDavChangeFilesHandlesHrefVariants();
await testEnsureWebDavLayoutRecursivelyCreatesParents();
await testAcquireWebDavLeaseFailsWhenConfirmationChanges();
await testPushWebDavChangesSkipsExistingOperationMarker();
await testTransportPullUsesSnapshotBootstrapWhenCursorMissing();
await testCleanupUnusedBlobsDeletesOnlyUnreferencedRemoteBlobs();

console.log('webdavProtocol.spec passed');
