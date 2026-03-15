/**
 * IndexedDB wrapper for Bemo offline storage.
 * Two object stores:
 *   - cachedNotes: full copy of server notes for offline reading
 *   - pendingQueue: notes created offline, waiting to sync
 */

const DB_NAME = 'bemo-offline';
const DB_VERSION = 1;

interface PendingNote {
  id?: number;          // Auto-increment key
  content: string;
  tags: string[];
  createdAt: number;    // Timestamp when created offline
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('cachedNotes')) {
        db.createObjectStore('cachedNotes', { keyPath: 'filename' });
      }
      if (!db.objectStoreNames.contains('pendingQueue')) {
        db.createObjectStore('pendingQueue', { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ──────────── Cached Notes ────────────

export async function setCachedNotes(notes: any[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('cachedNotes', 'readwrite');
  const store = tx.objectStore('cachedNotes');
  store.clear();
  notes.forEach((n) => store.put(n));
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function getCachedNotes(): Promise<any[]> {
  const db = await openDB();
  const tx = db.transaction('cachedNotes', 'readonly');
  const store = tx.objectStore('cachedNotes');
  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
  });
}

// ──────────── Pending Queue ────────────

export async function addToPendingQueue(note: { content: string; tags: string[] }): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('pendingQueue', 'readwrite');
  const store = tx.objectStore('pendingQueue');
  const entry: PendingNote = { content: note.content, tags: note.tags, createdAt: Date.now() };
  store.add(entry);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function getPendingQueue(): Promise<PendingNote[]> {
  const db = await openDB();
  const tx = db.transaction('pendingQueue', 'readonly');
  const store = tx.objectStore('pendingQueue');
  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
  });
}

export async function removePendingItem(id: number): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('pendingQueue', 'readwrite');
  const store = tx.objectStore('pendingQueue');
  store.delete(id);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function getPendingCount(): Promise<number> {
  const queue = await getPendingQueue();
  return queue.length;
}
