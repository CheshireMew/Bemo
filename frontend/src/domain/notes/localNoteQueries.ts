import {
  getCachedNote,
  getCachedNoteByFilename,
  getCachedNotes,
} from './notesStorage.js';
import type { NoteMeta } from './notesTypes.js';
import {
  getTrashNote,
  getTrashNoteByFilename,
  getTrashNotes,
} from './trashStorage.js';

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
  return getCachedNote(noteId);
}

export async function findLocalTrashNoteById(noteId: string): Promise<NoteMeta | null> {
  return getTrashNote(noteId);
}

export async function findLocalNoteByFilename(filename: string): Promise<NoteMeta | null> {
  return getCachedNoteByFilename(filename);
}

export async function findLocalTrashNoteByFilename(filename: string): Promise<NoteMeta | null> {
  return getTrashNoteByFilename(filename);
}

export async function listAllLocalNoteFilenames(): Promise<Set<string>> {
  const [active, trash] = await Promise.all([getCachedNotes(), getTrashNotes()]);
  return new Set([...active, ...trash].map((note) => note.filename));
}

export async function searchLocalNotes(query: string): Promise<NoteMeta[]> {
  const notes = await listLocalNotes();
  return notes.filter((note) => searchInNote(note, query));
}
