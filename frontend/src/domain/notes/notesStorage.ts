import type { NoteMeta } from './notesTypes.js';
import { openIndexedDb } from '../../utils/indexedDb.js';

export async function setCachedNotes(notes: NoteMeta[]): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('cachedNotes', 'readwrite');
  const store = tx.objectStore('cachedNotes');
  store.clear();
  notes.forEach((note) => store.put(note));
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function getCachedNotes(): Promise<NoteMeta[]> {
  const db = await openIndexedDb();
  const tx = db.transaction('cachedNotes', 'readonly');
  const store = tx.objectStore('cachedNotes');
  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result || []) as NoteMeta[]);
  });
}

export async function putCachedNote(note: NoteMeta): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('cachedNotes', 'readwrite');
  tx.objectStore('cachedNotes').put(note);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function getCachedNote(filename: string): Promise<NoteMeta | null> {
  const db = await openIndexedDb();
  const tx = db.transaction('cachedNotes', 'readonly');
  return new Promise((resolve) => {
    const req = tx.objectStore('cachedNotes').get(filename);
    req.onsuccess = () => resolve((req.result as NoteMeta | undefined) ?? null);
  });
}

export async function deleteCachedNote(filename: string): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('cachedNotes', 'readwrite');
  tx.objectStore('cachedNotes').delete(filename);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}
