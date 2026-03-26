import type { SyncRemoteNoteState } from '../syncTransport.js';
import type { WebDavIndexedBatchRecord, WebDavManifestBatchRecord } from './webdavTypes.js';

export type DiagnosticStatus = 'pass' | 'warn' | 'fail' | 'skip';
export type DiagnosticPhase = 'config' | 'remote' | 'contract' | 'storage' | 'runtime' | 'local';

export type DiagnosticCheck = {
  id: string;
  title: string;
  phase: DiagnosticPhase;
  status: DiagnosticStatus;
  detail: string;
  facts?: string[];
};

export type RemoteNoteIndexRecord = {
  format_version?: number;
  latest_cursor?: string;
  notes?: Array<SyncRemoteNoteState & { note_id?: string; scope?: string; revision?: number }>;
  updated_at?: string;
};

export type WebDavDiagnosticReport = {
  baseUrl: string;
  containerUrl: string;
  startedAt: string;
  finishedAt: string;
  summary: Exclude<DiagnosticStatus, 'skip'>;
  counts: Record<DiagnosticStatus, number>;
  checks: DiagnosticCheck[];
};

export function pushCheck(
  checks: DiagnosticCheck[],
  input: DiagnosticCheck,
) {
  checks.push(input);
}

export function toCursorNumber(value: unknown) {
  const normalized = Number(String(value ?? '0'));
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : 0;
}

export function snapshotUrl(baseUrl: string, snapshotName: string) {
  return `${baseUrl}/snapshots/${snapshotName}`;
}

export function snapshotShardUrl(baseUrl: string, fileName: string) {
  return `${baseUrl}/snapshots/${fileName}`;
}

export function batchUrl(baseUrl: string, fileName: string) {
  return `${baseUrl}/batches/${fileName}`;
}

export function parseBootstrapCursor(cursor: string | null) {
  const match = String(cursor || '').match(/^snapshot-bootstrap:([^:]+):(\d+)$/);
  if (!match) return null;
  return {
    snapshotName: decodeURIComponent(match[1]),
    shardIndex: Math.max(0, Number(match[2] || 0)),
  };
}

export function normalizeRemoteNoteIndex(index: RemoteNoteIndexRecord | null) {
  const notes: SyncRemoteNoteState[] = Array.isArray(index?.notes)
    ? index.notes
      .map((note): SyncRemoteNoteState | null => {
        const noteId = String(note?.note_id || '');
        if (!noteId) return null;
        return {
          note_id: noteId,
          scope: note?.scope === 'trash' ? 'trash' : 'active',
          revision: Math.max(1, Number(note?.revision || 1)),
        };
      })
      .filter((note): note is SyncRemoteNoteState => Boolean(note))
      .sort((left, right) => left.note_id.localeCompare(right.note_id))
    : [];

  return {
    formatVersion: Number(index?.format_version || 0),
    latestCursor: String(index?.latest_cursor || '0'),
    notes,
    updatedAt: String(index?.updated_at || ''),
  };
}

export function compareRemoteNotes(
  left: Record<string, SyncRemoteNoteState>,
  right: Record<string, SyncRemoteNoteState>,
) {
  const mismatches: string[] = [];
  const noteIds = Array.from(new Set([
    ...Object.keys(left),
    ...Object.keys(right),
  ])).sort();

  for (const noteId of noteIds) {
    const local = left[noteId] || null;
    const remote = right[noteId] || null;
    if (!local || !remote) {
      mismatches.push(noteId);
      continue;
    }
    if (local.scope !== remote.scope || local.revision !== remote.revision) {
      mismatches.push(noteId);
    }
  }

  return mismatches;
}

export function summarizeCounts(checks: DiagnosticCheck[]) {
  return checks.reduce<Record<DiagnosticStatus, number>>((acc, check) => {
    acc[check.status] += 1;
    return acc;
  }, {
    pass: 0,
    warn: 0,
    fail: 0,
    skip: 0,
  });
}

export function summarizeReport(checks: DiagnosticCheck[]): Exclude<DiagnosticStatus, 'skip'> {
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warn')) return 'warn';
  return 'pass';
}

export function createProbeHash() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const digest = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${digest}`;
}

export function sameBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function dedupeBatches(
  batches: Array<WebDavManifestBatchRecord | WebDavIndexedBatchRecord>,
) {
  const map = new Map<string, WebDavManifestBatchRecord | WebDavIndexedBatchRecord>();
  for (const batch of batches) {
    if (!batch?.batch_id || !batch.file) continue;
    map.set(batch.batch_id, batch);
  }
  return Array.from(map.values()).sort((left, right) => (
    toCursorNumber(left.started_after_cursor) - toCursorNumber(right.started_after_cursor)
  ));
}
