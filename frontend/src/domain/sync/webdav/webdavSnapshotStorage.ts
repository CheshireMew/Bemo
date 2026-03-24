import { listWebDavChangeFiles } from './webdavChanges.js';
import { readJson, webdavRequest, writeJson } from './webdavRequest.js';
import type { ManifestRecord, SnapshotRecord, WebDavSnapshotNote } from './webdavTypes.js';
import { applyChangesToSnapshotState } from './webdavSnapshotState.js';

export async function readWebDavSnapshot(
  baseUrl: string,
  headers: HeadersInit,
  manifest: ManifestRecord | null,
): Promise<SnapshotRecord | null> {
  if (!manifest?.latest_snapshot) return null;
  return readJson<SnapshotRecord>(`${baseUrl}/snapshots/${manifest.latest_snapshot}`, headers);
}

async function fetchRemoteChanges(baseUrl: string, headers: HeadersInit, latestCursor: string) {
  const files = await listWebDavChangeFiles(baseUrl, headers, null, latestCursor);
  const changes: Array<{
    operation_id?: string;
    device_id?: string;
    entity_id?: string;
    type?: string;
    timestamp?: string;
    payload?: Record<string, unknown>;
  }> = [];

  for (const file of files) {
    const response = await webdavRequest(file, { method: 'GET', headers });
    if (response.status === 404) continue;
    changes.push(await response.json());
  }

  return changes;
}

export async function buildSnapshotStateFromRemote(
  baseUrl: string,
  headers: HeadersInit,
  manifest: ManifestRecord | null,
): Promise<Record<string, WebDavSnapshotNote>> {
  if (!manifest?.latest_cursor || manifest.latest_cursor === '0') {
    return {};
  }

  const snapshot = await readWebDavSnapshot(baseUrl, headers, manifest);
  if (snapshot?.notes) {
    return snapshot.notes;
  }

  const changes = await fetchRemoteChanges(baseUrl, headers, manifest.latest_cursor);
  return applyChangesToSnapshotState({}, changes);
}

export async function writeWebDavSnapshot(
  baseUrl: string,
  headers: HeadersInit,
  latestCursor: string,
  notes: Record<string, WebDavSnapshotNote>,
) {
  const snapshotName = `snapshot_${latestCursor.padStart(8, '0')}.json`;
  const payload: SnapshotRecord = {
    format_version: 1,
    latest_cursor: latestCursor,
    generated_at: new Date().toISOString(),
    notes,
  };
  await writeJson(`${baseUrl}/snapshots/${snapshotName}`, headers, payload);
  return snapshotName;
}
