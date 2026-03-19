import type { NoteMeta } from './notesTypes.js';
import { openIndexedDb } from '../../utils/indexedDb.js';

export async function setTrashNotes(notes: NoteMeta[]): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('trashNotes', 'readwrite');
  const store = tx.objectStore('trashNotes');
  store.clear();
  notes.forEach((note) => store.put(note));
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function getTrashNotes(): Promise<NoteMeta[]> {
  const db = await openIndexedDb();
  const tx = db.transaction('trashNotes', 'readonly');
  const store = tx.objectStore('trashNotes');
  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result || []) as NoteMeta[]);
  });
}

export async function putTrashNote(note: NoteMeta): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('trashNotes', 'readwrite');
  tx.objectStore('trashNotes').put(note);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function getTrashNote(filename: string): Promise<NoteMeta | null> {
  const db = await openIndexedDb();
  const tx = db.transaction('trashNotes', 'readonly');
  return new Promise((resolve) => {
    const req = tx.objectStore('trashNotes').get(filename);
    req.onsuccess = () => resolve((req.result as NoteMeta | undefined) ?? null);
  });
}

export async function deleteTrashNote(filename: string): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('trashNotes', 'readwrite');
  tx.objectStore('trashNotes').delete(filename);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}
