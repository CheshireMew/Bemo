import {
  createOfflineNoteId,
} from '../../utils/db.js';
import {
  deleteCachedNote,
  getCachedNote,
  getCachedNotes,
  putCachedNote,
  setCachedNotes,
} from './notesStorage.js';
import {
  deleteTrashNote,
  getTrashNote,
  getTrashNotes,
  putTrashNote,
  setTrashNotes,
} from './trashStorage.js';
import {
  deleteAttachmentRefsForOwner,
  extractAttachmentFilenames,
  replaceAttachmentRefsForOwner,
  replaceNoteAttachmentRefsForScope,
} from '../attachments/attachmentRefStorage.js';
import { cleanupOrphanImagesRequest } from '../importExport/attachmentCleanup.js';
import type { NoteMeta } from './notesTypes.js';

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

function deriveTitle(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => stripMarkdown(line.replace(/^#+\s*/, '')).trim())
    .filter(Boolean);
  return lines[0] || '未命名笔记';
}

function deriveConflictTitle(note: NoteMeta) {
  return `冲突副本 - ${note.title || deriveTitle(note.content)}`;
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

async function listAllFilenames(): Promise<Set<string>> {
  const [active, trash] = await Promise.all([getCachedNotes(), getTrashNotes()]);
  return new Set([...active, ...trash].map((note) => note.filename));
}

async function ensureUniqueFilename(baseName: string, currentFilename?: string) {
  const existing = await listAllFilenames();
  let next = `${baseName}.md`;
  let counter = 2;
  while (existing.has(next) && next !== currentFilename) {
    next = `${baseName}-${counter}.md`;
    counter += 1;
  }
  return next;
}

function searchInNote(note: NoteMeta, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    note.title,
    note.content,
    ...(note.tags || []),
  ].some((value) => String(value || '').toLowerCase().includes(needle));
}

export async function listLocalNotes(): Promise<NoteMeta[]> {
  const notes = await getCachedNotes();
  return notes.sort((a: NoteMeta, b: NoteMeta) => b.created_at - a.created_at);
}

export async function listLocalTrashNotes(): Promise<NoteMeta[]> {
  const notes = await getTrashNotes();
  return notes.sort((a: NoteMeta, b: NoteMeta) => b.updated_at - a.updated_at);
}

export async function findLocalNoteById(noteId: string): Promise<NoteMeta | null> {
  const notes = await getCachedNotes();
  return notes.find((note: NoteMeta) => note.note_id === noteId) || null;
}

export async function findLocalNoteByFilename(filename: string): Promise<NoteMeta | null> {
  return getCachedNote(filename);
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
  const timestamp = input.created_at ? Date.parse(input.created_at) : Date.now();
  const seconds = Math.floor((Number.isNaN(timestamp) ? Date.now() : timestamp) / 1000);
  const title = deriveTitle(input.content);
  const fallbackBase = `${seconds}-${slugifyTitle(title)}`;
  const filename = await ensureUniqueFilename(
    (input.filename || `${fallbackBase}.md`).replace(/\.md$/i, ''),
    input.filename,
  );
  const note: NoteMeta = {
    note_id: input.note_id,
    revision: Math.max(1, input.revision || 1),
    filename,
    title,
    created_at: seconds,
    updated_at: Math.floor(Date.now() / 1000),
    content: input.content,
    tags: input.tags,
    pinned: input.pinned,
  };
  await putCachedNote(note);
  await replaceAttachmentRefsForOwner({
    ownerType: 'note',
    ownerId: note.note_id,
    noteId: note.note_id,
    scope: 'active',
    filenames: extractAttachmentFilenames(note.content),
  });
  return note;
}

export async function updateLocalNoteById(
  noteId: string,
  apply: (current: NoteMeta) => NoteMeta,
): Promise<NoteMeta | null> {
  const current = await findLocalNoteById(noteId);
  if (!current) return null;
  const next = apply(current);
  await putCachedNote(next);
  await replaceAttachmentRefsForOwner({
    ownerType: 'note',
    ownerId: next.note_id,
    noteId: next.note_id,
    scope: 'active',
    filenames: extractAttachmentFilenames(next.content),
  });
  return next;
}

export async function moveLocalNoteToTrashById(noteId: string): Promise<NoteMeta | null> {
  const current = await findLocalNoteById(noteId);
  if (!current) return null;
  await putTrashNote({
    ...current,
    revision: current.revision + 1,
    updated_at: Math.floor(Date.now() / 1000),
  });
  await deleteCachedNote(current.filename);
  await replaceAttachmentRefsForOwner({
    ownerType: 'note',
    ownerId: current.note_id,
    noteId: current.note_id,
    scope: 'trash',
    filenames: extractAttachmentFilenames(current.content),
  });
  return current;
}

export async function createLocalConflictCopy(note: NoteMeta): Promise<NoteMeta> {
  const filename = await ensureUniqueFilename(`${Math.floor(Date.now() / 1000)}-${slugifyTitle(deriveConflictTitle(note))}`);
  const copy: NoteMeta = {
    ...note,
    note_id: createOfflineNoteId(),
    filename,
    title: deriveConflictTitle(note),
    revision: 1,
    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000),
    pinned: false,
  };
  await putCachedNote(copy);
  await replaceAttachmentRefsForOwner({
    ownerType: 'note',
    ownerId: copy.note_id,
    noteId: copy.note_id,
    scope: 'active',
    filenames: extractAttachmentFilenames(copy.content),
  });
  return copy;
}

export async function searchLocalNotes(query: string): Promise<NoteMeta[]> {
  const notes = await listLocalNotes();
  return notes.filter((note) => searchInNote(note, query));
}

export async function createLocalNote(payload: { content: string; tags: string[] }) {
  const now = Math.floor(Date.now() / 1000);
  const title = deriveTitle(payload.content);
  const filename = await ensureUniqueFilename(`${now}-${slugifyTitle(title)}`);
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
  await putCachedNote(note);
  await replaceAttachmentRefsForOwner({
    ownerType: 'note',
    ownerId: note.note_id,
    noteId: note.note_id,
    scope: 'active',
    filenames: extractAttachmentFilenames(note.content),
  });
  return {
    note_id: note.note_id,
    revision: note.revision,
    filename: note.filename,
  };
}

export async function updateLocalNote(filename: string, payload: { content: string; tags: string[] }) {
  const current = await getCachedNote(filename);
  if (!current) {
    throw new Error(`Note not found: ${filename}`);
  }
  const updated: NoteMeta = {
    ...current,
    title: deriveTitle(payload.content),
    content: payload.content,
    tags: payload.tags,
    revision: current.revision + 1,
    updated_at: Math.floor(Date.now() / 1000),
  };
  await putCachedNote(updated);
  await replaceAttachmentRefsForOwner({
    ownerType: 'note',
    ownerId: updated.note_id,
    noteId: updated.note_id,
    scope: 'active',
    filenames: extractAttachmentFilenames(updated.content),
  });
  return updated;
}

export async function patchLocalNote(filename: string, payload: { pinned?: boolean; tags?: string[] }) {
  const current = await getCachedNote(filename);
  if (!current) {
    throw new Error(`Note not found: ${filename}`);
  }
  const updated: NoteMeta = {
    ...current,
    pinned: payload.pinned ?? current.pinned,
    tags: payload.tags ?? current.tags,
    revision: current.revision + 1,
    updated_at: Math.floor(Date.now() / 1000),
  };
  await putCachedNote(updated);
  await replaceAttachmentRefsForOwner({
    ownerType: 'note',
    ownerId: updated.note_id,
    noteId: updated.note_id,
    scope: 'active',
    filenames: extractAttachmentFilenames(updated.content),
  });
  return updated;
}

export async function deleteLocalNote(filename: string) {
  const current = await getCachedNote(filename);
  if (!current) {
    throw new Error(`Note not found: ${filename}`);
  }
  const trashed: NoteMeta = {
    ...current,
    revision: current.revision + 1,
    updated_at: Math.floor(Date.now() / 1000),
  };
  await putTrashNote(trashed);
  await deleteCachedNote(filename);
  await replaceAttachmentRefsForOwner({
    ownerType: 'note',
    ownerId: trashed.note_id,
    noteId: trashed.note_id,
    scope: 'trash',
    filenames: extractAttachmentFilenames(trashed.content),
  });
  return trashed;
}

export async function restoreLocalTrashNote(filename: string) {
  const current = await getTrashNote(filename);
  if (!current) {
    throw new Error(`Trash note not found: ${filename}`);
  }
  const restoredFilename = await ensureUniqueFilename(current.filename.replace(/\.md$/i, ''), current.filename);
  const restored: NoteMeta = {
    ...current,
    filename: restoredFilename,
    revision: current.revision + 1,
    updated_at: Math.floor(Date.now() / 1000),
  };
  await putCachedNote(restored);
  await deleteTrashNote(filename);
  await replaceAttachmentRefsForOwner({
    ownerType: 'note',
    ownerId: restored.note_id,
    noteId: restored.note_id,
    scope: 'active',
    filenames: extractAttachmentFilenames(restored.content),
  });
  return restored;
}

export async function permanentlyDeleteLocalTrashNote(filename: string) {
  const current = await getTrashNote(filename);
  await deleteTrashNote(filename);
  if (current) {
    await deleteAttachmentRefsForOwner('note', current.note_id);
    await cleanupOrphanImagesRequest();
  }
  return { ok: true };
}

export async function emptyLocalTrashNotes() {
  await setTrashNotes([]);
  await replaceNoteAttachmentRefsForScope('trash', []);
  await cleanupOrphanImagesRequest();
  return { ok: true };
}

export async function importRemoteNotesAsLocal(notes: NoteMeta[]) {
  if (!notes.length) return;
  await setCachedNotes(notes);
  await replaceNoteAttachmentRefsForScope('active', notes);
}

export async function importRemoteTrashAsLocal(notes: NoteMeta[]) {
  if (!notes.length) return;
  await setTrashNotes(notes);
  await replaceNoteAttachmentRefsForScope('trash', notes);
}
