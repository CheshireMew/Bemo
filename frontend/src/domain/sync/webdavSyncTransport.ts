import { getOrCreateDeviceId } from '../storage/deviceIdentity.js';
import type { SyncTransport } from './syncTransport.js';
import {
  deleteWebDavBlob,
  getWebDavBlob,
  hasWebDavBlob,
  listWebDavBlobHashes,
  putWebDavBlob,
} from './webdav/webdavBlobs.js';
import { pullWebDavChanges, pushWebDavChanges } from './webdav/webdavChanges.js';
import { acquireWebDavLease, releaseWebDavLease } from './webdav/webdavLease.js';
import { readWebDavManifest } from './webdav/webdavManifest.js';
import { encodeBasicAuth, ensureWebDavLayout, normalizeWebDavBase } from './webdav/webdavRequest.js';
import {
  applyChangesToSnapshotState,
  buildBootstrapChangesFromSnapshot,
  collectReferencedBlobHashes,
} from './webdav/webdavSnapshotState.js';
import {
  buildSnapshotStateFromRemote,
  readWebDavSnapshot,
  writeWebDavSnapshot,
} from './webdav/webdavSnapshotStorage.js';
import {
  bootstrapWebDavRemoteState,
  createWebDavBootstrapState,
  inspectWebDavBootstrapState,
  normalizeWebDavBootstrapState,
  normalizeWebDavOperationId,
  shouldPullWebDavSnapshot,
  shouldTreatManifestSnapshotAsBootstrap,
  writeWebDavSyncManifest,
} from './webdav/webdavBootstrap.js';

export function createWebDavTransport(config: {
  webdavUrl: string;
  username: string;
  password: string;
  basePath: string;
  bootstrapFingerprint: string;
}): SyncTransport {
  const baseUrl = normalizeWebDavBase(config.webdavUrl, config.basePath);
  const headers = {
    Authorization: encodeBasicAuth(config.username, config.password),
  };

  return {
    async pull(cursor: string | null) {
      await ensureWebDavLayout(baseUrl, headers);
      const manifest = await readWebDavManifest(baseUrl, headers);

      if (shouldTreatManifestSnapshotAsBootstrap(manifest) && shouldPullWebDavSnapshot(cursor)) {
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
    async inspectBootstrap() {
      await ensureWebDavLayout(baseUrl, headers);
      const manifest = await readWebDavManifest(baseUrl, headers);
      return inspectWebDavBootstrapState({ baseUrl, headers, manifest });
    },
    async push(changes: any[]) {
      if (!changes.length) {
        const manifest = await readWebDavManifest(baseUrl, headers);
        return {
          accepted: [],
          conflicts: [],
          latest_cursor: String(manifest?.latest_cursor || '0'),
        };
      }

      await ensureWebDavLayout(baseUrl, headers);
      const deviceId = await getOrCreateDeviceId();
      const lease = await acquireWebDavLease(baseUrl, headers, deviceId);
      if (!lease) {
        throw new Error('WebDAV sync lease is held by another device');
      }

      try {
        const manifest = await readWebDavManifest(baseUrl, headers);
        const startingCursor = Number(manifest?.latest_cursor || '0');
        const bootstrap = normalizeWebDavBootstrapState(manifest);
        const bootstrapAcceptedIds = new Set(
          bootstrap.status === 'completed' ? bootstrap.operation_ids : [],
        );
        const alreadyAccepted = changes
          .filter((change) => bootstrapAcceptedIds.has(normalizeWebDavOperationId(change)))
          .map((change) => ({
            operation_id: normalizeWebDavOperationId(change),
            cursor: String(manifest?.latest_cursor || '0'),
            change,
            deduplicated: true,
          }));
        const pendingChanges = changes.filter((change) => !bootstrapAcceptedIds.has(normalizeWebDavOperationId(change)));

        if (bootstrap.status !== 'completed' && startingCursor === 0 && pendingChanges.length > 0) {
          await writeWebDavSyncManifest({
            baseUrl,
            headers,
            latestCursor: '0',
            latestSnapshot: null,
            bootstrap: createWebDavBootstrapState(
              config.bootstrapFingerprint,
              'in_progress',
              pendingChanges.map(normalizeWebDavOperationId).filter(Boolean),
            ),
          });

          const bootstrapResult = await bootstrapWebDavRemoteState({
            baseUrl,
            headers,
            bootstrapFingerprint: config.bootstrapFingerprint,
            changes: pendingChanges,
          });
          return {
            ...bootstrapResult,
            accepted: [
              ...alreadyAccepted,
              ...bootstrapResult.accepted,
            ],
          };
        }

        const { accepted, latestCursor } = await pushWebDavChanges(baseUrl, headers, startingCursor, pendingChanges);
        const latestCursorString = String(latestCursor);
        const allAccepted = [...alreadyAccepted, ...accepted];
        const writtenChanges = accepted.filter((item: { deduplicated?: boolean }) => !item.deduplicated);

        if (!writtenChanges.length) {
          return { accepted: allAccepted, conflicts: [], latest_cursor: latestCursorString };
        }

        const previousNotes = await buildSnapshotStateFromRemote(baseUrl, headers, manifest);
        const nextNotes = applyChangesToSnapshotState(
          previousNotes,
          writtenChanges.map((item: { change: Record<string, unknown> }) => item.change),
        );
        const latestSnapshot = await writeWebDavSnapshot(baseUrl, headers, latestCursorString, nextNotes);

        await writeWebDavSyncManifest({
          baseUrl,
          headers,
          latestCursor: latestCursorString,
          latestSnapshot,
          bootstrap: bootstrap.status === 'completed'
            ? bootstrap
            : createWebDavBootstrapState(config.bootstrapFingerprint, 'completed'),
        });

        return { accepted: allAccepted, conflicts: [], latest_cursor: latestCursorString };
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
