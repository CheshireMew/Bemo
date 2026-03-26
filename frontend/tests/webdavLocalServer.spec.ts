import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { acquireWebDavLease, releaseWebDavLease } from '../src/domain/sync/webdav/webdavLease.js';
import {
  buildSnapshotStateFromRemote,
  readWebDavSnapshot,
} from '../src/domain/sync/webdav/webdavRemoteSnapshot.js';
import {
  getWebDavBlob,
  putWebDavBlob,
} from '../src/domain/sync/webdav/webdavRemoteBlobs.js';
import { pushWebDavBatch } from '../src/domain/sync/webdav/webdavRemoteMutation.js';
import { pullWebDavChanges, readWebDavManifest } from '../src/domain/sync/webdav/webdavRemoteState.js';
import { ensureWebDavLayout, encodeBasicAuth } from '../src/domain/sync/webdav/webdavRequest.js';

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

type StoredFile = {
  body: Uint8Array;
  contentType: string;
};

function normalizePath(path: string) {
  return path.replace(/\/+$/, '') || '/';
}

function collectBody(req: IncomingMessage): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

function createPropfindResponse(baseOrigin: string, paths: string[]) {
  const items = paths
    .map((path) => `<response><href>${baseOrigin}${path}</href></response>`)
    .join('');
  return `<?xml version="1.0"?><multistatus xmlns="DAV:">${items}</multistatus>`;
}

async function withLocalWebDavServer<T>(run: (input: { baseUrl: string; headers: HeadersInit }) => Promise<T>) {
  const expectedAuth = encodeBasicAuth('demo', 'secret');
  const collections = new Set<string>(['/dav']);
  const files = new Map<string, StoredFile>();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const path = normalizePath(requestUrl.pathname);
    if (req.headers.authorization !== expectedAuth) {
      res.writeHead(401);
      res.end();
      return;
    }

    if (req.method === 'MKCOL') {
      if (collections.has(path)) {
        res.writeHead(405);
        res.end();
        return;
      }
      const parent = normalizePath(path.slice(0, path.lastIndexOf('/')) || '/');
      if (!collections.has(parent)) {
        res.writeHead(409);
        res.end();
        return;
      }
      collections.add(path);
      res.writeHead(201);
      res.end();
      return;
    }

    if (req.method === 'PUT') {
      const parent = normalizePath(path.slice(0, path.lastIndexOf('/')) || '/');
      if (!collections.has(parent)) {
        res.writeHead(409);
        res.end();
        return;
      }
      const body = await collectBody(req);
      files.set(path, {
        body,
        contentType: req.headers['content-type'] || 'application/octet-stream',
      });
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === 'GET') {
      const file = files.get(path);
      if (!file) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': file.contentType });
      res.end(Buffer.from(file.body));
      return;
    }

    if (req.method === 'DELETE') {
      files.delete(path);
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'PROPFIND') {
      if (!collections.has(path)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const depth = req.headers.depth || '1';
      const baseOrigin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const allPaths = [
        ...Array.from(collections),
        ...Array.from(files.keys()),
      ].filter((item) => item === path || item.startsWith(`${path}/`));

      const visible = depth === 'infinity'
        ? allPaths
        : allPaths.filter((item) => item === path || normalizePath(item.slice(0, item.lastIndexOf('/')) || '/') === path);

      res.writeHead(207, { 'Content-Type': 'application/xml' });
      res.end(createPropfindResponse(baseOrigin, visible));
      return;
    }

    res.writeHead(405);
    res.end();
  });

  const originalDomParser = (globalThis as typeof globalThis & { DOMParser?: unknown }).DOMParser;
  (globalThis as typeof globalThis & { DOMParser?: unknown }).DOMParser = FakeDomParser as unknown as typeof DOMParser;

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as { port: number }).port;

  try {
    return await run({
      baseUrl: `http://127.0.0.1:${port}/dav/bemo-sync`,
      headers: {
        Authorization: expectedAuth,
      },
    });
  } finally {
    (globalThis as typeof globalThis & { DOMParser?: unknown }).DOMParser = originalDomParser;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

await withLocalWebDavServer(async ({ baseUrl, headers }) => {
  await ensureWebDavLayout(baseUrl, headers);

  const lease = await acquireWebDavLease(baseUrl, headers, 'device-a');
  assert.ok(lease);
  await releaseWebDavLease(baseUrl, headers, lease!);

  await putWebDavBlob(baseUrl, headers, 'sha256:abcdef', new Uint8Array([1, 2, 3]), 'application/octet-stream');
  assert.deepEqual(Array.from(await getWebDavBlob(baseUrl, headers, 'sha256:abcdef')), [1, 2, 3]);

  const change = {
    operation_id: 'op-local-1',
    device_id: 'device-a',
    entity_id: 'note-1',
    type: 'note.create',
    timestamp: '2026-03-18T00:00:00.000Z',
    base_revision: 0,
    payload: {
      revision: 1,
      filename: 'note-1.md',
      content: 'hello local e2e',
      tags: ['e2e'],
      pinned: false,
      created_at: '2026-03-18T00:00:00.000Z',
      attachments: [{
        filename: 'blob.bin',
        blob_hash: 'sha256:abcdef',
        mime_type: 'application/octet-stream',
      }],
    },
  };

  const pushResult = await pushWebDavBatch(baseUrl, headers, [change]);
  assert.equal(pushResult.latestCursor, '1');

  const nextManifest = await readWebDavManifest(baseUrl, headers);
  assert.equal(nextManifest.latest_snapshot, 'snapshot_00000001.json');
  assert.equal(nextManifest.batches.length, 1);

  const snapshot = await readWebDavSnapshot(baseUrl, headers, nextManifest);
  assert.equal(snapshot?.notes['note-1']?.attachments[0]?.blob_hash, 'sha256:abcdef');

  const rebuiltState = await buildSnapshotStateFromRemote(baseUrl, headers, nextManifest);
  assert.equal(rebuiltState['note-1']?.content, 'hello local e2e');

  const pullResult = await pullWebDavChanges(baseUrl, headers, '0', nextManifest);
  assert.equal(pullResult.latestCursor, '1');
  assert.equal(pullResult.changes[0].device_id, 'snapshot');
  assert.equal((pullResult.changes[0].payload as { content?: string }).content, 'hello local e2e');
});

console.log('webdavLocalServer.spec passed');
