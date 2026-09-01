import { openIndexedDb } from './indexedDb.js';

/** Schedule requests synchronously; evaluate the result only after COMMIT. */
export async function withIndexedDb<T = void>(stores: string | string[], mode: IDBTransactionMode, schedule: (tx: IDBTransaction) => (() => T) | void): Promise<T> {
  const db = await openIndexedDb();
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    let result: (() => T) | void;
    const fail = (error: unknown) => { db.close(); reject(error ?? new Error('本地存储操作失败。')); };
    try {
      tx = db.transaction(stores, mode);
      tx.onabort = () => fail(tx.error ?? new DOMException('本地存储事务已中止。', 'AbortError'));
      tx.onerror = () => fail(tx.error);
      tx.oncomplete = () => {
        db.close();
        try { resolve(result ? result() : undefined as T); } catch (error) { reject(error); }
      };
      try { result = schedule(tx); }
      catch (error) { tx.abort(); fail(error); }
    } catch (error) { fail(error); }
  });
}

export function readStore<T>(storeName: string, request: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return withIndexedDb(storeName, 'readonly', tx => {
    const pending = request(tx.objectStore(storeName));
    return () => pending.result;
  });
}

export function writeStore(storeName: string, write: (store: IDBObjectStore) => void): Promise<void> {
  return withIndexedDb(storeName, 'readwrite', tx => { write(tx.objectStore(storeName)); });
}
