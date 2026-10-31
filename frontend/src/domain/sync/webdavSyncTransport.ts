import { getOrCreateDeviceId } from '../storage/deviceIdentity.js';
import type { SyncChange, SyncTransport } from './syncTransport.js';
import {
  buildSnapshotStateFromRemote,
  readChangesFromBatches,
  readWebDavSnapshot,
} from './webdav/webdavRemoteSnapshot.js';
import {
  deleteWebDavBlob,
  getWebDavBlob,
  getWebDavBlobCollectionUrls,
  hasWebDavBlob,
  listWebDavBlobHashes,
  collectRemoteBlobHashes,
} from './webdav/webdavRemoteBlobs.js';
import {
  inspectWebDavRemoteState,
  pullWebDavChanges,
  readWebDavRemoteState,
} from './webdav/webdavRemoteState.js';
import {
  pushWebDavBatch,
  verifyWebDavPushResult,
} from './webdav/webdavRemoteMutation.js';
import { putWebDavBlob } from './webdav/webdavRemoteBlobs.js';
import { withWebDavLease } from './webdav/webdavLease.js';
import { encodeBasicAuth, ensureCollection, ensureWebDavLayout, normalizeWebDavBase } from './webdav/webdavRequest.js';

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
  let ensuredLayout: Promise<void> | null = null;
  const knownBlobDirectories = new Set<string>();

  async function ensureRemoteLayout() {
    if (!ensuredLayout) {
      ensuredLayout = ensureWebDavLayout(baseUrl, headers).catch((error) => {
        ensuredLayout = null;
        throw error;
      });
    }
    await ensuredLayout;
  }

  async function readCurrentRemoteState() {
    return readWebDavRemoteState(baseUrl, headers);
  }

  async function ensureBlobDirectories(blobHash: string) {
    const { algorithmUrl, dirUrl } = getWebDavBlobCollectionUrls(baseUrl, blobHash);
    if (!knownBlobDirectories.has(algorithmUrl)) {
      await ensureCollection(algorithmUrl, headers);
      knownBlobDirectories.add(algorithmUrl);
    }
    if (!knownBlobDirectories.has(dirUrl)) {
      await ensureCollection(dirUrl, headers);
      knownBlobDirectories.add(dirUrl);
    }
  }

  async function withLease<T>(run: (writer: SyncTransport, assertLease: () => Promise<void>) => Promise<T>): Promise<T> {
    await ensureRemoteLayout();
    return withWebDavLease(baseUrl, headers, async assertLease => {
      await readWebDavRemoteState(baseUrl, headers, assertLease);
      const writer: SyncTransport = {
        ...transport,
        runExclusive: undefined,
        async putBlob(hash, data, mime) { await assertLease(); await uploadBlob(hash, data, mime); await assertLease(); },
        async push(changes) {
          await assertLease();
          if (!changes.length) {
            const { manifest } = await readWebDavRemoteState(baseUrl, headers, assertLease);
            return { accepted: [], conflicts: [], latest_cursor: manifest.latest_cursor };
          }
          const { accepted, latestCursor, conflicts } = await pushWebDavBatch(baseUrl, headers, changes, assertLease);
          await verifyWebDavPushResult(baseUrl, headers, accepted, latestCursor);
          return { accepted, conflicts, latest_cursor: latestCursor };
        },
      };
      return run(writer, assertLease);
    }, await getOrCreateDeviceId());
  }

  async function uploadBlob(blobHash: string, data: Uint8Array, mimeType = 'application/octet-stream') {
    await ensureRemoteLayout();
    await ensureBlobDirectories(blobHash);
    await putWebDavBlob(baseUrl, headers, blobHash, data, mimeType, { skipEnsureDirectories: true });
  }

  const transport: SyncTransport = {
    runExclusive: run => withLease(writer => run(writer)),
    async pull(cursor: string | null) {
      await ensureRemoteLayout();
      const { manifest } = await readCurrentRemoteState();
      try {
        const { changes, latestCursor } = await pullWebDavChanges(baseUrl, headers, cursor, manifest);
        return { changes, latest_cursor: latestCursor };
      } catch (error) {
        // A writer may have compacted the files referenced by the manifest we read.
        const updated = (await readCurrentRemoteState()).manifest;
        if (JSON.stringify(updated) === JSON.stringify(manifest)) throw error;
        const { changes, latestCursor } = await pullWebDavChanges(baseUrl, headers, cursor, updated);
        return { changes, latest_cursor: latestCursor };
      }
    },
    async inspectBootstrap() {
      await ensureRemoteLayout();
      const remoteState = await readCurrentRemoteState();
      return inspectWebDavRemoteState(baseUrl, headers, remoteState);
    },
    async push(changes: SyncChange[]) {
      await ensureRemoteLayout();
      if (!changes.length) {
        const { manifest } = await readCurrentRemoteState();
        return {
          accepted: [],
          conflicts: [],
          latest_cursor: manifest.latest_cursor,
        };
      }
      return withLease(writer => writer.push(changes));
    },
    async hasBlob(blobHash: string) {
      await ensureRemoteLayout();
      return hasWebDavBlob(baseUrl, headers, blobHash);
    },
    async putBlob(blobHash: string, data: Uint8Array, mimeType = 'application/octet-stream') {
      await withLease(async (_writer, assertLease) => { await uploadBlob(blobHash, data, mimeType); await assertLease(); });
    },
    async getBlob(blobHash: string) {
      await ensureRemoteLayout();
      return getWebDavBlob(baseUrl, headers, blobHash);
    },
    async cleanupUnusedBlobs() {
      await ensureRemoteLayout();
      return withLease(async (_writer, assertLease) => {
        const { manifest, batchIndex } = await readWebDavRemoteState(baseUrl, headers, assertLease);
        const notes = await buildSnapshotStateFromRemote(baseUrl, headers, manifest);
        const referenced = collectRemoteBlobHashes(notes);
        const snapshot = await readWebDavSnapshot(baseUrl, headers, manifest);
        for (const hash of collectRemoteBlobHashes(snapshot?.notes ?? {})) referenced.add(hash);
        for (const batch of batchIndex.batches) {
          const changes = await readChangesFromBatches(baseUrl, headers, [batch], Number(batch.started_after_cursor));
          for (const change of changes) {
            for (const attachment of (change.payload?.attachments ?? []) as Array<{blob_hash?: string}>) {
              if (attachment.blob_hash) referenced.add(attachment.blob_hash);
            }
          }
        }
        const remoteBlobHashes = await listWebDavBlobHashes(baseUrl, headers);
        let deleted = 0;
        let retained = 0;

        for (const blobHash of remoteBlobHashes) {
          if (referenced.has(blobHash)) {
            retained += 1;
            continue;
          }
          await assertLease();
          if (await deleteWebDavBlob(baseUrl, headers, blobHash)) {
            deleted += 1;
          }
        }

        return { deleted, retained };
      });
    },
  };
  return transport;
}
