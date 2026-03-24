import type { NoteMeta } from './notesTypes.js';

export type NormalizedNotePayload = {
  filename?: string;
  content: string;
  tags: string[];
  pinned?: boolean;
  revision: number;
  created_at?: string;
  updated_at?: string;
};

function stripMarkdown(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\(([^)]+)\)/g, ' ')
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1')
    .replace(/[*_~>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeNoteTags(tags: unknown) {
  return Array.isArray(tags) ? tags.map((tag) => String(tag)) : [];
}

export function normalizeNoteRevision(value: unknown, fallback = 1) {
  const next = Number(value);
  return Math.max(1, Number.isFinite(next) ? next : fallback);
}

export function normalizeIsoTimestamp(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

export function normalizeNoteTimestampSeconds(value: unknown, fallback = Date.now()) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return Math.floor(parsed / 1000);
    }
  }
  return Math.floor(fallback / 1000);
}

export function deriveNoteTitle(content: string, fallback = '未命名笔记', maxLength?: number) {
  const lines = String(content || '')
    .split(/\r?\n/)
    .map((line) => stripMarkdown(line.replace(/^#+\s*/, '')).trim())
    .filter(Boolean);
  const title = lines[0] || fallback;
  return maxLength ? title.slice(0, maxLength) : title;
}

export function normalizeNoteContentPayload(
  payload: Record<string, unknown>,
  fallbackRevision = 1,
): NormalizedNotePayload {
  return {
    filename: typeof payload.filename === 'string' ? payload.filename : undefined,
    content: String(payload.content || ''),
    tags: normalizeNoteTags(payload.tags),
    pinned: payload.pinned === undefined ? undefined : Boolean(payload.pinned),
    revision: normalizeNoteRevision(payload.revision, fallbackRevision),
    created_at: normalizeIsoTimestamp(payload.created_at),
    updated_at: normalizeIsoTimestamp(payload.updated_at),
  };
}

export function normalizeLegacyNoteRecord(input: unknown): NoteMeta | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const note = input as Record<string, unknown>;
  const filename = typeof note.filename === 'string' ? note.filename : '';
  const noteId = typeof note.note_id === 'string' && note.note_id ? note.note_id : '';
  if (!filename || !noteId) {
    return null;
  }

  const createdAt = normalizeNoteTimestampSeconds(note.created_at);
  const updatedAt = normalizeNoteTimestampSeconds(note.updated_at);

  return {
    note_id: noteId,
    revision: normalizeNoteRevision(note.revision, 1),
    filename,
    title: typeof note.title === 'string' && note.title ? note.title : filename.replace(/\.md$/i, ''),
    created_at: createdAt,
    updated_at: updatedAt,
    content: typeof note.content === 'string' ? note.content : '',
    tags: normalizeNoteTags(note.tags),
    pinned: Boolean(note.pinned),
  };
}
