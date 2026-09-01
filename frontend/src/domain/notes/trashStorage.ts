import type { NoteMeta } from './notesTypes.js';
import { readStore, writeStore } from '../storage/transactions.js';

export function setTrashNotes(notes: NoteMeta[]): Promise<void> {
  return writeStore('trashNotes', store => {
    store.clear();
    notes.forEach(note => store.put(note));
  });
}

export function getTrashNotes(): Promise<NoteMeta[]> {
  return readStore('trashNotes', store => store.getAll());
}

export function putTrashNote(note: NoteMeta): Promise<void> {
  return writeStore('trashNotes', store => { store.put(note); });
}

export async function getTrashNote(noteId: string): Promise<NoteMeta | null> {
  return (await readStore<NoteMeta | undefined>('trashNotes', store => store.get(noteId))) ?? null;
}

export async function getTrashNoteByFilename(filename: string): Promise<NoteMeta | null> {
  return (await readStore<NoteMeta | undefined>('trashNotes', store => store.index('filename').get(filename))) ?? null;
}

export function deleteTrashNote(noteId: string): Promise<void> {
  return writeStore('trashNotes', store => { store.delete(noteId); });
}
