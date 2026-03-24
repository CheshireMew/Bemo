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

export async function getCachedNote(noteId: string): Promise<NoteMeta | null> {
  const db = await openIndexedDb();
  const tx = db.transaction('cachedNotes', 'readonly');
  return new Promise((resolve) => {
    const req = tx.objectStore('cachedNotes').get(noteId);
    req.onsuccess = () => resolve((req.result as NoteMeta | undefined) ?? null);
  });
}

export async function getCachedNoteByFilename(filename: string): Promise<NoteMeta | null> {
  const db = await openIndexedDb();
  const tx = db.transaction('cachedNotes', 'readonly');
  return new Promise((resolve, reject) => {
    const req = getFilenameLookup(tx.objectStore('cachedNotes'), filename);
    req.onsuccess = () => resolve((req.result as NoteMeta | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteCachedNote(noteId: string): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('cachedNotes', 'readwrite');
  tx.objectStore('cachedNotes').delete(noteId);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}
