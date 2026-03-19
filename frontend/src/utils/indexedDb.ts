const DB_NAME = 'bemo-offline';
const DB_VERSION = 9;

const STORE_DEFINITIONS = [
  ['cachedNotes', { keyPath: 'filename' }],
  ['trashNotes', { keyPath: 'filename' }],
  ['mutationLog', { keyPath: 'id', autoIncrement: true }],
  ['syncState', { keyPath: 'key' }],
  ['conflicts', { keyPath: 'id', autoIncrement: true }],
  ['blobIndex', { keyPath: 'blob_hash' }],
  ['attachmentBlobs', { keyPath: 'filename' }],
  ['draftAttachmentBlobs', { keyPath: 'filename' }],
  ['attachmentRefs', { keyPath: 'id' }],
] as const;

export function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [storeName, options] of STORE_DEFINITIONS) {
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
