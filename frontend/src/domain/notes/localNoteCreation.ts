import { createOfflineNoteId } from '../storage/deviceIdentity.js';
import {
  deriveNoteTitle,
  normalizeNoteRevision,
  normalizeNoteTimestampSeconds,
} from './noteContract.js';
import {
  syncActiveNoteArtifacts,
  syncTrashNoteArtifacts,
} from './localNoteArtifacts.js';
import type { NoteMeta } from './notesTypes.js';
import { listAllLocalNoteFilenames } from './localNoteQueries.js';
import { saveActiveNoteRecord, saveTrashNoteRecord } from './localNotePersistence.js';

function deriveConflictTitle(note: NoteMeta) {
  return `冲突副本 - ${note.title || deriveNoteTitle(note.content)}`;
}

function slugifyTitle(title: string) {
  const ascii = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return ascii || 'note';
}

export async function ensureUniqueNoteFilename(baseName: string, currentFilename?: string) {
  const existing = await listAllLocalNoteFilenames();
  let next = `${baseName}.md`;
  let counter = 2;
  while (existing.has(next) && next !== currentFilename) {
    next = `${baseName}-${counter}.md`;
    counter += 1;
  }
  return next;
}

async function buildIncomingNote(input: {
  note_id: string;
  revision: number;
  filename?: string;
  content: string;
  tags: string[];
  pinned: boolean;
  created_at?: string;
}): Promise<NoteMeta> {
  const seconds = normalizeNoteTimestampSeconds(input.created_at);
  const title = deriveNoteTitle(input.content);
  const fallbackBase = `${seconds}-${slugifyTitle(title)}`;
  const filename = await ensureUniqueNoteFilename(
    (input.filename || `${fallbackBase}.md`).replace(/\.md$/i, ''),
    input.filename,
  );

  return {
    note_id: input.note_id,
    revision: normalizeNoteRevision(input.revision, 1),
    filename,
    title,
    created_at: seconds,
    updated_at: Math.floor(Date.now() / 1000),
    content: input.content,
    tags: input.tags,
    pinned: input.pinned,
  };
}

export async function createLocalNoteFromSync(input: {
  note_id: string;
  revision: number;
  filename?: string;
  content: string;
  tags: string[];
  pinned: boolean;
  created_at?: string;
}): Promise<NoteMeta> {
  const note = await buildIncomingNote(input);
  await saveActiveNoteRecord(note);
  await syncActiveNoteArtifacts(note);
  return note;
}

export async function createLocalTrashNoteFromSync(input: {
  note_id: string;
  revision: number;
  filename?: string;
  content: string;
  tags: string[];
  pinned: boolean;
  created_at?: string;
}): Promise<NoteMeta> {
  const note = await buildIncomingNote(input);
  await saveTrashNoteRecord(note);
  await syncTrashNoteArtifacts(note);
  return note;
}

export async function createLocalConflictCopy(note: NoteMeta): Promise<NoteMeta> {
  const now = Math.floor(Date.now() / 1000);
  const filename = await ensureUniqueNoteFilename(`${now}-${slugifyTitle(deriveConflictTitle(note))}`);
  const copy: NoteMeta = {
    ...note,
    note_id: createOfflineNoteId(),
    filename,
    title: deriveConflictTitle(note),
    revision: 1,
    created_at: now,
    updated_at: now,
    pinned: false,
  };
  await saveActiveNoteRecord(copy);
  await syncActiveNoteArtifacts(copy);
  return copy;
}

export async function createLocalNote(payload: { content: string; tags: string[] }) {
  const now = Math.floor(Date.now() / 1000);
  const title = deriveNoteTitle(payload.content);
  const filename = await ensureUniqueNoteFilename(`${now}-${slugifyTitle(title)}`);
  const note: NoteMeta = {
    note_id: createOfflineNoteId(),
    revision: 1,
    filename,
    title,
    created_at: now,
    updated_at: now,
    content: payload.content,
    tags: payload.tags,
    pinned: false,
  };
  await saveActiveNoteRecord(note);
  await syncActiveNoteArtifacts(note);
  return {
    note_id: note.note_id,
    revision: note.revision,
    filename: note.filename,
  };
}
