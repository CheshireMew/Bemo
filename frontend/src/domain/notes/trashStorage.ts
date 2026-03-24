import type { NoteMeta } from './notesTypes.js';
import { openIndexedDb } from '../storage/indexedDb.js';

function getFilenameLookup(store: IDBObjectStore, filename: string) {
  if (store.indexNames.contains('filename')) {
    return store.index('filename').get(filename);
  }

  const request = store.getAll();
  return {
    set onsuccess(handler: ((this: IDBRequest<NoteMeta[]>, ev: Event) => any) | null) {
      request.onsuccess = handler;
    },
    set onerror(handler: ((this: IDBRequest<NoteMeta[]>, ev: Event) => any) | null) {
      request.onerror = handler;
    },
    get result() {
      return ((request.result || []) as NoteMeta[]).find((note) => note.filename === filename) ?? null;
    },
    get error() {
      return request.error;
    },
  } as IDBRequest<NoteMeta | null>;
}

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

export async function getTrashNote(noteId: string): Promise<NoteMeta | null> {
  const db = await openIndexedDb();
  const tx = db.transaction('trashNotes', 'readonly');
  return new Promise((resolve) => {
    const req = tx.objectStore('trashNotes').get(noteId);
    req.onsuccess = () => resolve((req.result as NoteMeta | undefined) ?? null);
  });
}

export async function getTrashNoteByFilename(filename: string): Promise<NoteMeta | null> {
  const db = await openIndexedDb();
  const tx = db.transaction('trashNotes', 'readonly');
  return new Promise((resolve, reject) => {
    const req = getFilenameLookup(tx.objectStore('trashNotes'), filename);
    req.onsuccess = () => resolve((req.result as NoteMeta | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteTrashNote(noteId: string): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('trashNotes', 'readwrite');
  tx.objectStore('trashNotes').delete(noteId);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}
