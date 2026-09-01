import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { enqueueChange } from '../src/domain/sync/mutationLogStorage.js';
import { getCachedNotes, putCachedNote } from '../src/domain/notes/notesStorage.js';
import { applyBackupPayload } from '../src/domain/importExport/backupPayload.js';
import { setRuntimeConfigOverride } from '../src/config.js';

Object.assign(globalThis, { indexedDB: new IDBFactory() });
setRuntimeConfigOverride({ appStorageMode: 'local' });
const note = { note_id: 'original', filename: 'original.md', title: 'original', content: 'keep', tags: [], pinned: false, revision: 1, created_at: 1000, updated_at: 1000 };
const cases: Array<[string, () => Promise<void>]> = [
  ['012 enqueue rejects abort after request succeeds', async () => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(...args) {
      const request = original.apply(this, args);
      if (this.name === 'mutationLog') request.addEventListener('success', () => this.transaction.abort());
      return request;
    };
    try {
      await assert.rejects(enqueueChange({ target: 'server', deviceId: 'test', entityId: 'n', type: 'note.create', payload: {} }));
    } finally { IDBObjectStore.prototype.add = original; }
  }],
  ['004 local invalid backup preserves primary data', async () => {
    await putCachedNote(note);
    await assert.rejects(applyBackupPayload({ format: 'bemo-backup', version: 3 }));
    assert.equal((await getCachedNotes()).find(n => n.note_id === note.note_id)?.content, 'keep');
  }],
  ['004 local replacement transaction rollback preserves primary data', async () => {
    await putCachedNote(note);
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      const request = original.apply(this, args);
      if (this.name === 'cachedNotes') request.addEventListener('success', () => this.transaction.abort());
      return request;
    };
    try {
      await assert.rejects(applyBackupPayload({ format: 'bemo-backup', version: 3, notes: [{ ...note, content: 'replace' }], trash: [], attachments: [] }));
    } finally { IDBObjectStore.prototype.put = original; }
    assert.equal((await getCachedNotes())[0]?.content, 'keep');
  }],
];
let failures = 0;
for (const [name, run] of cases) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([run(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('operation did not settle')), 2000); })]);
    console.log(`PASS ${name}`);
  } catch (error) { failures++; console.error(`FAIL ${name}`, error); }
  finally { clearTimeout(timer); }
}
assert.equal(failures, 0);
