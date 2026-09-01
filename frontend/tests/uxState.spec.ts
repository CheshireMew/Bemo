import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { computed, ref } from 'vue';
import { installMemoryIndexedDb } from './memoryIndexedDb.js';
import { setRuntimeConfigOverride } from '../src/config.js';
import type { NoteMeta } from '../src/domain/notes/notesTypes.js';
import { clearSearch, displayedNotes, fetchNotes, fetchTrash, notes, performSearch, searchLoading, searchQuery, searchResults, selectedDate, selectedTag, trashNotes, trashLoading } from '../src/store/notes.js';
import { useEditorSubmit } from '../src/composables/useEditorSubmit.js';
import { initSync } from '../src/store/sync.js';
import { notifySyncListeners, setSyncState } from '../src/domain/sync/syncStatusBus.js';
import { activeDialog, requestConfirmation, resolveDialog } from '../src/store/dialogs.js';
import { toUserErrorMessage } from '../src/utils/errorMessage.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://bemo.test' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage });
installMemoryIndexedDb();
const originalFetch = globalThis.fetch;
const pause = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
const makeNote = (id: string, tags: string[] = [], created = new Date(2026, 7, 31).getTime() / 1000): NoteMeta => ({ note_id: id, filename: `${id}.md`, title: id, content: id, tags, pinned: false, revision: 1, created_at: created, updated_at: created });
const startSearch = (query: string) => { searchQuery.value = query; performSearch(query); };

try {
  setRuntimeConfigOverride({ apiBase: 'https://backend.test', appStorageMode: 'backend' });
  const replies = new Map<string, (response: Response) => void>();
  globalThis.fetch = async input => new Promise(resolve => { replies.set(new URL(String(input)).searchParams.get('q') || 'list', resolve); });
  startSearch('slow');
  await pause(320);
  startSearch('fast');
  await pause(320);
  replies.get('fast')!(Response.json([makeNote('new')]));
  await pause();
  replies.get('slow')!(Response.json([makeNote('old')]));
  await pause();
  assert.equal(searchResults.value?.[0]?.note_id, 'new');
  assert.equal(searchLoading.value, false);
  startSearch('clear');
  await pause(320);
  clearSearch();
  replies.get('clear')!(Response.json([makeNote('late')]));
  await pause();
  assert.equal(searchResults.value, null);
  console.log('PASS search race and clear invalidate old requests');

  const trashReplies: Array<(response: Response) => void> = [];
  globalThis.fetch = async () => new Promise(resolve => { trashReplies.push(resolve); });
  const oldTrashRead = fetchTrash();
  const newTrashRead = fetchTrash();
  trashReplies[1]!(Response.json([makeNote('latest-trash')]));
  await newTrashRead;
  trashReplies[0]!(Response.json([makeNote('stale-trash')]));
  await oldTrashRead;
  assert.equal(trashNotes.value[0]?.note_id, 'latest-trash');
  assert.equal(trashLoading.value, false);
  console.log('PASS latest trash refresh wins over earlier in-flight reads');

  notes.value = [makeNote('a', ['体验']), makeNote('b', ['工作'])];
  searchResults.value = [...notes.value, makeNote('yesterday', ['体验'], new Date(2026, 7, 30).getTime() / 1000)];
  selectedTag.value = '体验';
  selectedDate.value = new Date(2026, 7, 31);
  assert.deepEqual(displayedNotes.value.map(note => note.note_id), ['a']);
  clearSearch(); selectedDate.value = null; selectedTag.value = null;
  globalThis.fetch = async () => Response.json(notes.value);
  await fetchNotes();
  console.log('PASS search, tag and date filters intersect');

  let emitted = 0;
  let failSave = true;
  const content = ref('保留的草稿');
  const tags = ref('体验，工作');
  const blocked = ref('');
  const editor = useEditorSubmit({
    content, tagInput: tags, showTagInput: ref(false), showPreview: ref(false), previewRef: ref(null), isUploading: ref(false),
    attachmentSessionKey: ref('ux-save-test'), blockedReason: computed(() => blocked.value), resetOnSuccess: true,
    handlePreviewInput: () => {}, clearDraft: () => {}, resetHistory: () => {}, emitSaved: () => { emitted++; },
    submitAction: async payload => {
      assert.deepEqual(payload.tags, ['体验', '工作']);
      if (failSave) throw new TypeError('Failed to fetch');
    },
  });
  await editor.saveNote();
  assert.match(editor.saveError.value, /保存失败.*保留/);
  assert.equal(content.value, '保留的草稿');
  assert.equal(emitted, 0);
  assert.equal(editor.isSaving.value, false);
  failSave = false;
  await editor.saveNote();
  assert.equal(emitted, 1);
  assert.equal(content.value, '');
  content.value = '离线仍可编辑'; blocked.value = '无法连接数据服务';
  await editor.saveNote();
  assert.equal(emitted, 1);
  assert.equal(content.value, '离线仍可编辑');
  console.log('PASS save failure preserves draft; success and blocked state are distinct');

  setRuntimeConfigOverride({ apiBase: '', appStorageMode: 'local' });
  setSyncState({ status: 'online', pendingCount: 0 });
  let syncCompletions = 0;
  const stop = initSync(() => { syncCompletions++; });
  await pause(50);
  assert.equal(syncCompletions, 0);
  setSyncState({ status: 'syncing' }); notifySyncListeners();
  setSyncState({ status: 'online' }); notifySyncListeners(); notifySyncListeners();
  assert.equal(syncCompletions, 1);
  stop();
  setSyncState({ status: 'syncing' }); notifySyncListeners();
  setSyncState({ status: 'online' }); notifySyncListeners();
  assert.equal(syncCompletions, 1);
  console.log('PASS initial sync snapshot does not refresh; completed sync refreshes once');

  const cancelled = requestConfirmation({ title: '删除？', message: '不会在取消时执行' });
  assert.equal(activeDialog.value?.title, '删除？');
  resolveDialog(false);
  assert.equal(await cancelled, false);
  assert.match(toUserErrorMessage(new TypeError('Failed to fetch'), ''), /无法连接数据服务/);
  assert.match(toUserErrorMessage(new Error('The operation was aborted due to timeout'), ''), /请求超时/);
  console.log('PASS explicit confirmation and readable network errors');
} finally {
  clearSearch();
  globalThis.fetch = originalFetch;
  dom.window.close();
}
