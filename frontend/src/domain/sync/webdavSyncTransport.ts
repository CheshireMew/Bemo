import { getOrCreateDeviceId } from '../storage/deviceIdentity.js';
import type { SyncChange, SyncTransport } from './syncTransport.js';
import {
  buildSnapshotStateFromRemote,
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
import { acquireWebDavLease, releaseWebDavLease } from './webdav/webdavLease.js';
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

  return {
    async pull(cursor: string | null) {
      await ensureRemoteLayout();
      const { manifest } = await readCurrentRemoteState();
      const { changes, latestCursor } = await pullWebDavChanges(baseUrl, headers, cursor, manifest);
      return { changes, latest_cursor: latestCursor };
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
      const deviceId = await getOrCreateDeviceId();
      const lease = await acquireWebDavLease(baseUrl, headers, deviceId);
      if (!lease) {
        throw new Error('WebDAV sync lease is held by another device');
      }

      try {
        const { accepted, latestCursor } = await pushWebDavBatch(baseUrl, headers, changes);
        await verifyWebDavPushResult(baseUrl, headers, accepted, latestCursor);
        return { accepted, conflicts: [], latest_cursor: latestCursor };
      } finally {
        await releaseWebDavLease(baseUrl, headers, lease);
      }
    },
    async hasBlob(blobHash: string) {
      await ensureRemoteLayout();
      return hasWebDavBlob(baseUrl, headers, blobHash);
    },
    async putBlob(blobHash: string, data: Uint8Array, mimeType = 'application/octet-stream') {
      await ensureRemoteLayout();
      await ensureBlobDirectories(blobHash);
      await putWebDavBlob(baseUrl, headers, blobHash, data, mimeType, {
        skipEnsureDirectories: true,
      });
    },
    async getBlob(blobHash: string) {
      await ensureRemoteLayout();
      return getWebDavBlob(baseUrl, headers, blobHash);
    },
    async cleanupUnusedBlobs() {
      await ensureRemoteLayout();
      const { manifest } = await readCurrentRemoteState();
      const notes = await buildSnapshotStateFromRemote(baseUrl, headers, manifest);
      const referenced = collectRemoteBlobHashes(notes);
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
