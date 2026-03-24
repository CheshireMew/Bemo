import {
  deleteCachedNote,
  putCachedNote,
  setCachedNotes,
} from './notesStorage.js';
import type { NoteMeta } from './notesTypes.js';
import {
  deleteTrashNote,
  putTrashNote,
  setTrashNotes,
} from './trashStorage.js';

export async function saveActiveNoteRecord(note: NoteMeta): Promise<void> {
  await putCachedNote(note);
}

export async function saveTrashNoteRecord(note: NoteMeta): Promise<void> {
  await putTrashNote(note);
}

export async function deleteActiveNoteRecord(noteId: string): Promise<void> {
  await deleteCachedNote(noteId);
}

export async function deleteTrashNoteRecord(noteId: string): Promise<void> {
  await deleteTrashNote(noteId);
}

export async function replaceActiveNoteRecords(notes: NoteMeta[]): Promise<void> {
  await setCachedNotes(notes);
}

export async function replaceTrashNoteRecords(notes: NoteMeta[]): Promise<void> {
  await setTrashNotes(notes);
}
