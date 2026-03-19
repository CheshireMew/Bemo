import type { ManifestRecord, SnapshotRecord, WebDavSnapshotNote } from './webdavTypes.js';
import { listWebDavChangeFiles } from './webdavChanges.js';
import { readJson, webdavRequest, writeJson } from './webdavRequest.js';

type SyncChange = {
  operation_id?: string;
  device_id?: string;
  entity_id?: string;
  type?: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
};

function toSnapshotNote(change: SyncChange, existing?: WebDavSnapshotNote): WebDavSnapshotNote | null {
  const payload = change.payload || {};
  const noteId = String(change.entity_id || existing?.note_id || '');
  if (!noteId) return null;

  if (change.type === 'note.delete') return null;

  if (change.type === 'note.patch' && existing) {
    return {
      ...existing,
      revision: Math.max(existing.revision + 1, Number(payload.revision ?? existing.revision + 1)),
      pinned: payload.pinned !== undefined ? Boolean(payload.pinned) : existing.pinned,
      tags: Array.isArray(payload.tags) ? payload.tags.map((tag) => String(tag)) : existing.tags,
      updated_at: typeof change.timestamp === 'string' ? change.timestamp : existing.updated_at,
      attachments: Array.isArray(payload.attachments)
        ? payload.attachments.flatMap((attachment) => normalizeAttachment(attachment))
        : existing.attachments,
    };
  }

  if (change.type === 'note.create' || change.type === 'note.update' || change.type === 'note.patch') {
    return {
      note_id: noteId,
      revision: Math.max(1, Number(payload.revision ?? existing?.revision ?? 1)),
      filename: typeof payload.filename === 'string' ? payload.filename : existing?.filename,
      content: typeof payload.content === 'string' ? payload.content : existing?.content || '',
      tags: Array.isArray(payload.tags) ? payload.tags.map((tag) => String(tag)) : existing?.tags || [],
      pinned: payload.pinned !== undefined ? Boolean(payload.pinned) : existing?.pinned || false,
      created_at: typeof payload.created_at === 'string' ? payload.created_at : existing?.created_at,
      updated_at: typeof change.timestamp === 'string' ? change.timestamp : existing?.updated_at,
      attachments: Array.isArray(payload.attachments)
        ? payload.attachments.flatMap((attachment) => normalizeAttachment(attachment))
        : existing?.attachments || [],
    };
  }

  return existing ?? null;
}

export function applyChangesToSnapshotState(
  currentNotes: Record<string, WebDavSnapshotNote>,
  changes: SyncChange[],
): Record<string, WebDavSnapshotNote> {
  const next = { ...currentNotes };

  for (const change of changes) {
    const noteId = String(change.entity_id || '');
    if (!noteId) continue;

    if (change.type === 'note.delete') {
      delete next[noteId];
      continue;
    }

    const snapshotNote = toSnapshotNote(change, next[noteId]);
    if (snapshotNote) {
      next[noteId] = snapshotNote;
    }
  }

  return next;
}

export function buildBootstrapChangesFromSnapshot(snapshot: SnapshotRecord) {
  return Object.values(snapshot.notes)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
    .map((note, index) => ({
      operation_id: `snapshot_${snapshot.latest_cursor}_${String(index + 1).padStart(6, '0')}_${note.note_id}`,
      device_id: 'snapshot',
      entity_id: note.note_id,
      type: 'note.create',
      timestamp: note.updated_at || snapshot.generated_at,
      base_revision: 0,
      cursor: snapshot.latest_cursor,
      payload: {
        revision: note.revision,
        filename: note.filename,
        content: note.content,
        tags: note.tags,
        pinned: note.pinned,
        created_at: note.created_at || snapshot.generated_at,
        attachments: note.attachments,
      },
    }));
}

function normalizeAttachment(value: unknown) {
  if (!value || typeof value !== 'object') return [];
  const attachment = value as Record<string, unknown>;
  const filename = typeof attachment.filename === 'string' ? attachment.filename : '';
  const blobHash = typeof attachment.blob_hash === 'string' ? attachment.blob_hash : '';
  const mimeType = typeof attachment.mime_type === 'string' ? attachment.mime_type : 'application/octet-stream';
  if (!filename || !blobHash) return [];
  return [{
    filename,
    blob_hash: blobHash,
    mime_type: mimeType,
  }];
}

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
  const changes: SyncChange[] = [];

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

export function collectReferencedBlobHashes(notes: Record<string, WebDavSnapshotNote>) {
  const hashes = new Set<string>();
  for (const note of Object.values(notes)) {
    for (const attachment of note.attachments || []) {
      if (attachment.blob_hash) hashes.add(attachment.blob_hash);
    }
  }
  return hashes;
}
