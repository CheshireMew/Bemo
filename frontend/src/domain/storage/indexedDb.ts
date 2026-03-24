const DB_NAME = 'bemo-offline';
const DB_VERSION = 10;

const STORE_DEFINITIONS = [
  ['cachedNotes', { keyPath: 'note_id' }],
  ['trashNotes', { keyPath: 'note_id' }],
  ['mutationLog', { keyPath: 'id', autoIncrement: true }],
  ['syncState', { keyPath: 'key' }],
  ['conflicts', { keyPath: 'id', autoIncrement: true }],
  ['blobIndex', { keyPath: 'blob_hash' }],
  ['attachmentBlobs', { keyPath: 'filename' }],
  ['draftAttachmentBlobs', { keyPath: 'filename' }],
  ['attachmentRefs', { keyPath: 'id' }],
] as const;

function createLegacyNoteId(storeName: string, record: Record<string, unknown>, index: number) {
  const filename = typeof record.filename === 'string' ? record.filename : `${storeName}-${index}`;
  const normalized = filename.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  return `migrated_${storeName}_${normalized || index}_${Date.now()}_${index}`;
}

function rebuildNoteStore(
  db: IDBDatabase,
  transaction: IDBTransaction,
  storeName: 'cachedNotes' | 'trashNotes',
) {
  if (!db.objectStoreNames.contains(storeName)) {
    const store = db.createObjectStore(storeName, { keyPath: 'note_id' });
    store.createIndex('filename', 'filename', { unique: true });
    return;
  }

  const store = transaction.objectStore(storeName);
  const keyPath = Array.isArray(store.keyPath) ? store.keyPath.join('.') : store.keyPath;
  const hasFilenameIndex = store.indexNames.contains('filename');
  if (keyPath === 'note_id' && hasFilenameIndex) {
    return;
  }

  const getAllRequest = store.getAll();
  getAllRequest.onsuccess = () => {
    const records = ((getAllRequest.result || []) as Array<Record<string, unknown>>).map((record, index) => ({
      ...record,
      note_id: typeof record.note_id === 'string' && record.note_id ? record.note_id : createLegacyNoteId(storeName, record, index),
    }));

    db.deleteObjectStore(storeName);
    const nextStore = db.createObjectStore(storeName, { keyPath: 'note_id' });
    nextStore.createIndex('filename', 'filename', { unique: true });
    records.forEach((record) => nextStore.put(record));
  };
}

export function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      rebuildNoteStore(db, request.transaction!, 'cachedNotes');
      rebuildNoteStore(db, request.transaction!, 'trashNotes');

      for (const [storeName, options] of STORE_DEFINITIONS.slice(2)) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, options);
        }
      }
      if (db.objectStoreNames.contains('pendingQueue')) {
        db.deleteObjectStore('pendingQueue');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
