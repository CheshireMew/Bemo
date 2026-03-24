import type { SyncBootstrapState } from '../syncTransport.js';
import type { ManifestRecord, WebDavBootstrapState } from './webdavTypes.js';
import { writeWebDavManifest } from './webdavManifest.js';
import {
  applyChangesToSnapshotState,
} from './webdavSnapshotState.js';
import {
  buildSnapshotStateFromRemote,
  writeWebDavSnapshot,
} from './webdavSnapshotStorage.js';

export function normalizeWebDavOperationId(change: Record<string, unknown>) {
  return String(change.operation_id || '');
}

export function shouldPullWebDavSnapshot(cursor: string | null) {
  if (cursor === null) return true;
  const normalized = String(cursor).trim();
  if (!normalized) return true;
  return Number(normalized) === 0;
}

export function shouldTreatManifestSnapshotAsBootstrap(manifest: ManifestRecord | null) {
  if (!manifest?.latest_snapshot) return false;
  if (manifest.bootstrap?.status === 'completed') return true;
  return !manifest.bootstrap && Number(manifest.latest_cursor || '0') > 0;
}

export function createWebDavBootstrapState(
  bootstrapFingerprint: string,
  status: WebDavBootstrapState['status'],
  operationIds: string[] = [],
): WebDavBootstrapState {
  return {
    status,
    fingerprint: bootstrapFingerprint,
    operation_ids: operationIds,
    updated_at: new Date().toISOString(),
  };
}

export function normalizeWebDavBootstrapState(manifest: ManifestRecord | null): WebDavBootstrapState {
  if (manifest?.bootstrap) {
    return {
      status: manifest.bootstrap.status,
      fingerprint: manifest.bootstrap.fingerprint || null,
      operation_ids: Array.isArray(manifest.bootstrap.operation_ids)
        ? manifest.bootstrap.operation_ids.map((item) => String(item)).filter(Boolean)
        : [],
      updated_at: manifest.bootstrap.updated_at || manifest.updated_at || new Date().toISOString(),
    };
  }

  const legacyOperationIds = Array.isArray((manifest as { bootstrap_operation_ids?: unknown } | null)?.bootstrap_operation_ids)
    ? ((manifest as { bootstrap_operation_ids?: unknown }).bootstrap_operation_ids as unknown[])
      .map((item) => String(item))
      .filter(Boolean)
    : [];

  return {
    status: 'not_started',
    fingerprint: null,
    operation_ids: legacyOperationIds,
    updated_at: manifest?.updated_at || new Date().toISOString(),
  };
}

export async function writeWebDavSyncManifest(input: {
  baseUrl: string;
  headers: HeadersInit;
  latestCursor: string;
  latestSnapshot: string | null;
  bootstrap: WebDavBootstrapState;
}) {
  const nextManifest: ManifestRecord = {
    format_version: 1,
    latest_cursor: input.latestCursor,
    latest_snapshot: input.latestSnapshot,
    bootstrap: input.bootstrap,
    updated_at: new Date().toISOString(),
  };
  await writeWebDavManifest(input.baseUrl, input.headers, nextManifest);
  return nextManifest;
}

export async function inspectWebDavBootstrapState(input: {
  baseUrl: string;
  headers: HeadersInit;
  manifest: ManifestRecord | null;
}): Promise<SyncBootstrapState> {
  const bootstrap = normalizeWebDavBootstrapState(input.manifest);
  const notes = await buildSnapshotStateFromRemote(input.baseUrl, input.headers, input.manifest);

  return {
    status: bootstrap.status,
    fingerprint: bootstrap.fingerprint,
    remoteNoteIds: Object.keys(notes),
  };
}

export async function bootstrapWebDavRemoteState(input: {
  baseUrl: string;
  headers: HeadersInit;
  bootstrapFingerprint: string;
  changes: Array<Record<string, unknown>>;
}) {
  const bootstrapNotes = applyChangesToSnapshotState({}, input.changes);
  const latestCursorString = '1';
  const latestSnapshot = await writeWebDavSnapshot(
    input.baseUrl,
    input.headers,
    latestCursorString,
    bootstrapNotes,
  );
  const operationIds = input.changes.map(normalizeWebDavOperationId).filter(Boolean);

  await writeWebDavSyncManifest({
    baseUrl: input.baseUrl,
    headers: input.headers,
    latestCursor: latestCursorString,
    latestSnapshot,
    bootstrap: createWebDavBootstrapState(input.bootstrapFingerprint, 'completed', operationIds),
  });

  return {
    accepted: input.changes.map((change) => ({
      operation_id: normalizeWebDavOperationId(change),
      cursor: latestCursorString,
      change,
    })),
    conflicts: [],
    latest_cursor: latestCursorString,
  };
}
