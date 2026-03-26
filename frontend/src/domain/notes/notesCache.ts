import { getCachedNotes, setCachedNotes } from './notesStorage.js';
import type { NoteMeta } from './notesTypes.js';

export async function loadCachedNotes(): Promise<NoteMeta[]> {
  return getCachedNotes();
}

export async function storeCachedNotes(notes: NoteMeta[]): Promise<void> {
  await setCachedNotes(notes);
}
