import { IDBFactory } from 'fake-indexeddb';

export function installMemoryIndexedDb() {
  Object.assign(globalThis, { indexedDB: new IDBFactory() });
}
