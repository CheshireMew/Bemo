import { getOrCreateDeviceId } from './db.js';
import type { SyncTransport } from './serverTransport.js';
import {
  deleteWebDavBlob,
  getWebDavBlob,
  hasWebDavBlob,
  listWebDavBlobHashes,
  putWebDavBlob,
} from '../domain/sync/webdav/webdavBlobs.js';
import { pullWebDavChanges, pushWebDavChanges } from '../domain/sync/webdav/webdavChanges.js';
import { acquireWebDavLease, releaseWebDavLease } from '../domain/sync/webdav/webdavLease.js';
import { readWebDavManifest, writeWebDavManifest } from '../domain/sync/webdav/webdavManifest.js';
import { encodeBasicAuth, ensureWebDavLayout, normalizeWebDavBase } from '../domain/sync/webdav/webdavRequest.js';
import {
  applyChangesToSnapshotState,
  buildBootstrapChangesFromSnapshot,
  buildSnapshotStateFromRemote,
  collectReferencedBlobHashes,
  readWebDavSnapshot,
  writeWebDavSnapshot,
} from '../domain/sync/webdav/webdavSnapshot.js';

export function createWebDavTransport(config: {
  webdavUrl: string;
  username: string;
  password: string;
  basePath: string;
}): SyncTransport {
  const baseUrl = normalizeWebDavBase(config.webdavUrl, config.basePath);
  const headers = {
    Authorization: encodeBasicAuth(config.username, config.password),
  };

  return {
    async pull(cursor: string | null) {
      await ensureWebDavLayout(baseUrl, headers);
      const manifest = await readWebDavManifest(baseUrl, headers);
      if (!cursor) {
        const snapshot = await readWebDavSnapshot(baseUrl, headers, manifest);
        if (snapshot && snapshot.latest_cursor) {
          return {
            changes: buildBootstrapChangesFromSnapshot(snapshot),
            latest_cursor: snapshot.latest_cursor,
          };
        }
      }

      const { changes, latestCursor } = await pullWebDavChanges(
        baseUrl,
        headers,
        cursor,
        manifest?.latest_cursor || null,
      );

      return { changes, latest_cursor: latestCursor };
    },
    async push(changes: any[]) {
      await ensureWebDavLayout(baseUrl, headers);
      const deviceId = await getOrCreateDeviceId();
      const lease = await acquireWebDavLease(baseUrl, headers, deviceId);
      if (!lease) {
        throw new Error('WebDAV sync lease is held by another device');
      }

      try {
        const manifest = await readWebDavManifest(baseUrl, headers);
        const startingCursor = Number(manifest?.latest_cursor || '0');
        const { accepted, latestCursor } = await pushWebDavChanges(baseUrl, headers, startingCursor, changes);
        const latestCursorString = String(latestCursor);
        const previousNotes = await buildSnapshotStateFromRemote(baseUrl, headers, manifest);
        const nextNotes = applyChangesToSnapshotState(
          previousNotes,
          accepted.map((item: { change: Record<string, unknown> }) => item.change),
        );
        const latestSnapshot = await writeWebDavSnapshot(baseUrl, headers, latestCursorString, nextNotes);

        await writeWebDavManifest(baseUrl, headers, {
          format_version: 1,
          latest_cursor: latestCursorString,
          latest_snapshot: latestSnapshot,
          updated_at: new Date().toISOString(),
        });

        return { accepted, conflicts: [], latest_cursor: latestCursorString };
      } finally {
        await releaseWebDavLease(baseUrl, headers, lease);
      }
    },
    async hasBlob(blobHash: string) {
      await ensureWebDavLayout(baseUrl, headers);
      return hasWebDavBlob(baseUrl, headers, blobHash);
    },
    async putBlob(blobHash: string, data: Uint8Array, mimeType = 'application/octet-stream') {
      await ensureWebDavLayout(baseUrl, headers);
      await putWebDavBlob(baseUrl, headers, blobHash, data, mimeType);
    },
    async getBlob(blobHash: string) {
      await ensureWebDavLayout(baseUrl, headers);
      return getWebDavBlob(baseUrl, headers, blobHash);
    },
    async cleanupUnusedBlobs() {
      await ensureWebDavLayout(baseUrl, headers);
      const manifest = await readWebDavManifest(baseUrl, headers);
      const notes = await buildSnapshotStateFromRemote(baseUrl, headers, manifest);
      const referenced = collectReferencedBlobHashes(notes);
      const remoteBlobHashes = await listWebDavBlobHashes(baseUrl, headers);
      let deleted = 0;
      let retained = 0;

      for (const blobHash of remoteBlobHashes) {
        if (referenced.has(blobHash)) {
          retained += 1;
          continue;
        }
        if (await deleteWebDavBlob(baseUrl, headers, blobHash)) {
          deleted += 1;
        }
      }

      return { deleted, retained };
    },
  };
}
