import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { JSDOM } from 'jsdom';
import type { NoteMeta } from '../src/domain/notes/notesTypes.js';

const dom = new JSDOM('<!doctype html><div id="editor"></div>', { url: 'https://bemo.test' });
Object.assign(globalThis, { indexedDB: new IDBFactory(), window: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, Element: dom.window.Element, SVGElement: dom.window.SVGElement });
const { createApp, ref, nextTick } = await import('vue');
const { setRuntimeConfigOverride } = await import('../src/config.js');
const { settings } = await import('../src/domain/settings/settingsState.js');
const { putCachedNote, getCachedNotes } = await import('../src/domain/notes/notesStorage.js');
const { getTrashNotes } = await import('../src/domain/notes/trashStorage.js');
const { updateLocalNote, patchLocalNote } = await import('../src/domain/notes/localNoteMutations.js');
const { deleteLocalNote, restoreLocalTrashNote } = await import('../src/domain/notes/localTrashMutations.js');
const { getAllAttachmentRefs, replaceNoteAttachmentRefsForScope } = await import('../src/domain/attachments/attachmentRefStorage.js');
const { putAttachmentBlob } = await import('../src/domain/attachments/blobStorage.js');
const { buildBackupPayload, applyBackupPayload } = await import('../src/domain/importExport/backupPayload.js');
const { exportFlomoCsv, importFlomoArchive } = await import('../src/domain/importExport/flomoImportExport.js');
const { parseFlomoCsv } = await import('../src/domain/importExport/flomoArchiveParser.js');
const { useEditorDraft } = await import('../src/composables/useEditorDraft.js');
const { useNoteEditSession } = await import('../src/composables/useNoteEditSession.js');
const { flushEditorDrafts } = await import('../src/domain/runtime/draftLifecycle.js');
setRuntimeConfigOverride({ appStorageMode: 'local' });
settings.sync.mode = 'local';
const note: NoteMeta = { note_id: 'audit', filename: 'audit.md', content: '![image](/images/audit.png)', title: 'audit',
  tags: [], pinned: false, revision: 1, created_at: 1000, updated_at: 1000 };
await putCachedNote(note);
await replaceNoteAttachmentRefsForScope('active', [note]);
await putAttachmentBlob({ filename: 'audit.png', blob: new Blob([new Uint8Array([1, 2, 3])]), mimeType: 'image/png' });

await updateLocalNote(note.note_id, { content: note.content + '\nnew', tags: [] }, note.revision);
await assert.rejects(updateLocalNote(note.note_id, { content: 'stale overwrite', tags: [] }, note.revision), /已更新/);
await assert.rejects(patchLocalNote(note.note_id, { pinned: true }, note.revision), /已更新/);
assert.match((await getCachedNotes())[0]!.content, /new$/);
console.log('PASS BEMO-01 local stale save rejects without overwriting the primary');

for (const destination of ['trashNotes', 'cachedNotes']) {
  if (destination === 'cachedNotes') await deleteLocalNote(note.note_id);
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(...args) {
    const request = original.apply(this, args);
    if (this.name === destination) request.addEventListener('success', () => this.transaction.abort());
    return request;
  };
  try {
    await assert.rejects(destination === 'trashNotes' ? deleteLocalNote(note.note_id) : restoreLocalTrashNote(note.note_id));
  } finally { IDBObjectStore.prototype.put = original; }
  const backup = await buildBackupPayload();
  assert.equal(backup.notes.length + (backup.trash?.length ?? 0), 1);
  const scope = destination === 'trashNotes' ? 'active' : 'trash';
  assert.equal((await getAllAttachmentRefs())[0]!.scope, scope);
  assert.deepEqual(backup.attachments?.[0]?.data, [1, 2, 3]);
  await applyBackupPayload(backup);
}
assert.equal((await getTrashNotes()).length, 1);
await restoreLocalTrashNote(note.note_id);
assert.equal((await getCachedNotes()).length, 1);
assert.equal((await getTrashNotes()).length, 0);
assert.equal((await getAllAttachmentRefs())[0]?.scope, 'active');
console.log('PASS BEMO-06 interrupted trash/restore rolls back note ownership and attachment refs; backup reimports');

let restore: Promise<unknown> | undefined;
await deleteLocalNote(note.note_id);
const originalGetAll = IDBObjectStore.prototype.getAll;
IDBObjectStore.prototype.getAll = function(...args) {
  const request = originalGetAll.apply(this, args);
  if (this.name === 'cachedNotes' && this.transaction.mode === 'readonly') {
    request.addEventListener('success', () => { restore ??= restoreLocalTrashNote(note.note_id); });
  }
  return request;
};
let snapshot;
try { snapshot = await buildBackupPayload(); } finally { IDBObjectStore.prototype.getAll = originalGetAll; }
await restore;
assert.deepEqual([...snapshot.notes, ...(snapshot.trash ?? [])].map(n => n.note_id), [note.note_id]);
assert.deepEqual(snapshot.attachments?.[0]?.data, [1, 2, 3]);
await applyBackupPayload(snapshot);
console.log('PASS BEMO-02 local backup holds notes/trash/blob snapshot during concurrent restore');

const body = '  第一段, "引号"\r\n\r\n第二段\n最后一行  ';
await applyBackupPayload({ format: 'bemo-backup', version: 2, notes: [{ ...note, content: body }], trash: [], attachments: [] });
let exported: Blob | undefined;
Object.assign(dom.window.URL, { createObjectURL: (blob: Blob) => { exported = blob; return 'blob:audit'; }, revokeObjectURL: () => {} });
dom.window.HTMLAnchorElement.prototype.click = () => {};
await exportFlomoCsv();
assert.ok(exported);
const file = new File([await exported.text()], 'roundtrip.csv', { type: 'text/csv' });
assert.equal((await parseFlomoCsv(file))[0]?.content, body);
await applyBackupPayload({ format: 'bemo-backup', version: 2, notes: [], trash: [], attachments: [] });
const result = await importFlomoArchive(file);
assert.equal(result.imported_count, 1);
assert.equal((await getCachedNotes())[0]?.content, body);
await assert.rejects(parseFlomoCsv(new File(['content,created_at\r\n"unfinished'], 'bad.csv')), /未结束/);
console.log('PASS BEMO-04 formal CSV export/import preserves multiline CRLF, quotes, commas and note count');

const open = ref(true);
const current = ref({ ...note });
const content = ref('');
let draft: ReturnType<typeof useEditorDraft>;
let base: ReturnType<typeof useNoteEditSession>;
const mount = () => {
  const app = createApp({ setup() {
    base = useNoteEditSession(() => open.value, () => current.value);
    draft = useEditorDraft({ content, attachmentSessionKey: ref('audit-draft'), tagInput: ref('tag'),
      showTagInput: ref(true), showPreview: ref(false), autosaveDraft: true, draftStorageKey: 'audit-draft' });
    return () => null;
  } });
  app.mount('#editor');
  return app;
};
settings.editor.autoSaveEnabled = true;
settings.editor.autoSaveDelaySec = 60;
let app = mount();
current.value = { ...note, revision: 8, content: 'other saved edit' };
assert.equal(base!.value?.revision, 1);
open.value = false; open.value = true;
assert.equal(base!.value?.revision, 8);
content.value = 'last input before debounce';
window.dispatchEvent(new dom.window.Event('beforeunload'));
assert.equal(JSON.parse(localStorage.getItem('audit-draft')!).content, content.value);
content.value = 'last input before native close';
flushEditorDrafts();
assert.equal(JSON.parse(localStorage.getItem('audit-draft')!).content, content.value);
app.unmount();
content.value = '';
app = mount();
assert.equal(draft!.restoreDraft()?.content, 'last input before native close');
content.value = 'page hide input';
await nextTick();
window.dispatchEvent(new dom.window.Event('pagehide'));
assert.equal(draft!.restoreDraft()?.content, 'page hide input');
app.unmount();
dom.window.close();
console.log('PASS BEMO-01/05 edit baseline stays fixed; refresh/native-close/pagehide flush and reopen restores final draft');
