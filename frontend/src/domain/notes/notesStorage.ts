import type { NoteMeta } from './notesTypes.js';
import { readStore, writeStore } from '../storage/transactions.js';

export function setCachedNotes(notes: NoteMeta[]): Promise<void> {
  return writeStore('cachedNotes', store => {
    store.clear();
    notes.forEach(note => store.put(note));
  });
}

export function getCachedNotes(): Promise<NoteMeta[]> {
  return readStore('cachedNotes', store => store.getAll());
}

export function putCachedNote(note: NoteMeta): Promise<void> {
  return writeStore('cachedNotes', store => { store.put(note); });
}

export async function getCachedNote(noteId: string): Promise<NoteMeta | null> {
  return (await readStore<NoteMeta | undefined>('cachedNotes', store => store.get(noteId))) ?? null;
}

export async function getCachedNoteByFilename(filename: string): Promise<NoteMeta | null> {
  return (await readStore<NoteMeta | undefined>('cachedNotes', store => store.index('filename').get(filename))) ?? null;
}

export function deleteCachedNote(noteId: string): Promise<void> {
  return writeStore('cachedNotes', store => { store.delete(noteId); });
}
