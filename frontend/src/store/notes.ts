import { ref, computed } from 'vue';
import {
  clearTrash,
  createNote,
  listDisplayNotes,
  listDisplayTrash,
  moveNoteToTrash,
  purgeTrashNote,
  restoreTrashNote,
  searchDisplayNotes,
  togglePinned,
  updateNote,
} from '../domain/appStore/notesAdapter.js';
import type { NoteMeta } from '../domain/notes/notesTypes.js';
import { setView } from './ui.js';
import { requestSyncNow } from '../domain/sync/syncCoordinator.js';
import { requestConfirmation } from './dialogs.js';
import { pushNotification } from './notifications.js';
import { toUserErrorMessage } from '../utils/errorMessage.js';

export type { NoteMeta } from '../domain/notes/notesTypes.js';

// ==========================
// 状态 (State)
// ==========================
export const notes = ref<NoteMeta[]>([]);
export const trashNotes = ref<NoteMeta[]>([]);
export const searchResults = ref<NoteMeta[] | null>(null);
export const notesReadError = ref('');
export const notesLoading = ref(false);
export const searchLoading = ref(false);
export const searchError = ref('');
export const pendingNoteIds = ref(new Set<string>());
export const trashLoading = ref(false);
export const trashReadError = ref('');
let readGeneration = 0;
let trashReadGeneration = 0;

// 过滤筛选
export const selectedDate = ref<Date | null>(null);
export const selectedTag = ref<string | null>(null);
export const searchQuery = ref('');
export const sortOrder = ref<'desc' | 'asc'>('desc');

// ==========================
// 计算派生状态 (Getters)
// ==========================

// 收集所有去重且排序过的标签
export const allTags = computed(() => {
  const set = new Set<string>();
  notes.value.forEach((n: NoteMeta) => (n.tags || []).forEach((t: string) => set.add(t)));
  return Array.from(set).sort();
});

// 计算日期和标签交叉过滤后的列表
export const filteredNotes = computed(() => {
  return filterByActiveSelections(notes.value);
});

function filterByActiveSelections(source: NoteMeta[]) {
  let result = source;

  if (selectedDate.value) {
    const sel = selectedDate.value;
    result = result.filter((n: NoteMeta) => {
      const d = new Date(n.created_at * 1000);
      return (
        d.getFullYear() === sel.getFullYear() &&
        d.getMonth() === sel.getMonth() &&
        d.getDate() === sel.getDate()
      );
    });
  }

  if (selectedTag.value) {
    const tag = selectedTag.value;
    result = result.filter((n: NoteMeta) => n.tags && n.tags.includes(tag));
  }

  return result;
}

// 呈现到界面上的笔记（如果处于搜索状态优先显示搜索结果）
export const displayedNotes = computed(() => {
  const source = searchResults.value !== null
    ? filterByActiveSelections(searchResults.value)
    : filteredNotes.value;
  const direction = sortOrder.value === 'desc' ? -1 : 1;

  return [...source].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    return (a.created_at - b.created_at) * direction;
  });
});

function removeNoteFromVisibleCollections(noteId: string) {
  notes.value = notes.value.filter((item: NoteMeta) => item.note_id !== noteId);
  if (searchResults.value !== null) {
    searchResults.value = searchResults.value.filter((item: NoteMeta) => item.note_id !== noteId);
  }
}

function resolveVisibleNote(input: NoteMeta | string) {
  if (typeof input !== 'string') {
    return input;
  }

  return notes.value.find((item: NoteMeta) => item.note_id === input)
    || searchResults.value?.find((item: NoteMeta) => item.note_id === input)
    || null;
}

async function refreshVisibleNotes() {
  const generation = ++readGeneration;
  notesLoading.value = true;
  let result: Awaited<ReturnType<typeof listDisplayNotes>>;
  try {
    result = await listDisplayNotes();
  } catch (error) {
    if (generation === readGeneration) notesReadError.value = toUserErrorMessage(error, '无法读取笔记，请重试。');
    return;
  } finally {
    if (generation === readGeneration) notesLoading.value = false;
  }
  if (generation !== readGeneration) return;
  notesReadError.value = result.error
    ? toUserErrorMessage(result.error, '无法读取笔记，请重试。')
    : '';
  if (result.source === 'primary' || notes.value.length === 0) notes.value = result.notes;
  const query = searchQuery.value.trim();
  if (!query) {
    searchResults.value = null;
    return;
  }
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  const searchRequest = ++searchGeneration;
  searchResults.value = [];
  searchLoading.value = true;
  await executeSearch(query, searchRequest);
}

// ==========================
// 操作行为 (Actions)
// ==========================

export async function fetchNotes() {
  await refreshVisibleNotes();
}

export async function deleteNote(input: NoteMeta | string) {
  const note = resolveVisibleNote(input);
  if (!note || pendingNoteIds.value.has(note.note_id)) return;
  pendingNoteIds.value.add(note.note_id);
  try {
    const queued = await moveNoteToTrash(note);
    removeNoteFromVisibleCollections(note.note_id);
    if (queued) requestSyncNow();
    void fetchNotes();
  } catch (e) {
    console.error('Error deleting note:', e);
    pushNotification(toUserErrorMessage(e, '删除失败，请重试。'), 'error', 4200);
  } finally {
    pendingNoteIds.value.delete(note.note_id);
  }
}

export async function togglePin(note: NoteMeta) {
  if (pendingNoteIds.value.has(note.note_id)) return;
  pendingNoteIds.value.add(note.note_id);
  try {
    const queued = await togglePinned(note);
    if (queued) requestSyncNow();
    await fetchNotes();
  } catch (e) {
    console.error('Error pinning note:', e);
    pushNotification(toUserErrorMessage(e, '置顶修改失败，请重试。'), 'error', 4200);
  } finally {
    pendingNoteIds.value.delete(note.note_id);
  }
}

export async function updateNoteContent(note: NoteMeta, payload: { content: string; tags: string[] }) {
  const queued = await updateNote(note, payload);
  if (queued) requestSyncNow();
  await fetchNotes();
}

export async function createNoteContent(payload: { content: string; tags: string[] }) {
  const created = await createNote(payload);
  if ('content' in created) notes.value = [created, ...notes.value.filter(note => note.note_id !== created.note_id)];
  if (created.syncQueued) requestSyncNow();
  await fetchNotes();
  return created;
}

// 回收站相关
export async function fetchTrash() {
  const generation = ++trashReadGeneration;
  trashLoading.value = true;
  trashReadError.value = '';
  try {
    const result = await listDisplayTrash();
    if (generation === trashReadGeneration) trashNotes.value = result;
  } catch (e) {
    if (generation === trashReadGeneration) trashReadError.value = toUserErrorMessage(e, '无法读取回收站，请重试。');
  } finally {
    if (generation === trashReadGeneration) trashLoading.value = false;
  }
}

export async function restoreNote(noteId: string) {
  if (pendingNoteIds.value.has(noteId)) return;
  pendingNoteIds.value.add(noteId);
  try {
    const queued = await restoreTrashNote(noteId);
    if (queued) requestSyncNow();
    await fetchTrash();
    await fetchNotes();
    pushNotification('笔记已恢复', 'success');
  } catch (e) {
    console.error(e);
    pushNotification(toUserErrorMessage(e, '恢复失败，请重试。'), 'error', 4200);
  } finally {
    pendingNoteIds.value.delete(noteId);
  }
}

export async function permanentDelete(noteId: string) {
  if (pendingNoteIds.value.has(noteId)) return;
  pendingNoteIds.value.add(noteId);
  try {
    const queued = await purgeTrashNote(noteId);
    if (queued) requestSyncNow();
    await fetchTrash();
  } catch (e) {
    console.error(e);
    pushNotification(toUserErrorMessage(e, '永久删除失败，请重试。'), 'error', 4200);
  } finally {
    pendingNoteIds.value.delete(noteId);
  }
}

export async function emptyTrash() {
  const confirmed = await requestConfirmation({
    title: '清空回收站？',
    message: `回收站中的 ${trashNotes.value.length} 条笔记将被永久删除，此操作无法撤销。`,
    confirmLabel: '清空回收站',
    danger: true,
  });
  if (!confirmed) return;
  try {
    const queued = await clearTrash();
    if (queued) requestSyncNow();
    trashReadGeneration += 1;
    trashLoading.value = false;
    trashReadError.value = '';
    trashNotes.value = [];
    pushNotification('回收站已清空', 'success');
  } catch (e) {
    console.error(e);
    pushNotification(toUserErrorMessage(e, '清空回收站失败，请重试。'), 'error', 4200);
  }
}

// 标签功能
export function toggleTag(tag: string) {
  setView('all');
  selectedTag.value = selectedTag.value === tag ? null : tag;
}

export function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc';
}

export function clearSelectedFilters() {
  const hadActiveFilters = Boolean(selectedDate.value || selectedTag.value);
  selectedDate.value = null;
  selectedTag.value = null;
  return hadActiveFilters;
}

// 日期过滤
export function selectDate(date: Date) {
  if (selectedDate.value && selectedDate.value.toDateString() === date.toDateString()) {
    selectedDate.value = null; // 取消筛选
  } else {
    selectedDate.value = new Date(date);
    selectedDate.value.setHours(0, 0, 0, 0);
    setView('all'); // 在非主界面点击日期时，自动切换回全维视角以展示筛选后的笔记
  }
}

// 搜索行为
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchGeneration = 0;

function searchCachedNotes(query: string) {
  const normalized = query.toLocaleLowerCase();
  return notes.value.filter((note) => [note.title, note.content, ...(note.tags || [])]
    .some((value) => String(value || '').toLocaleLowerCase().includes(normalized)));
}

async function executeSearch(query: string, generation: number) {
  try {
    const result = notesReadError.value
      ? searchCachedNotes(query)
      : await searchDisplayNotes(query);
    if (generation !== searchGeneration || searchQuery.value.trim() !== query) return;
    searchResults.value = result;
    searchError.value = '';
  } catch (error) {
    if (generation !== searchGeneration) return;
    console.error('Failed to search notes:', error);
    searchResults.value = [];
    searchError.value = toUserErrorMessage(error, '搜索失败，请重试。');
  } finally {
    if (generation === searchGeneration) searchLoading.value = false;
  }
}

export function clearSearch() {
  const hadSearch = Boolean(searchQuery.value.trim() || searchResults.value !== null);
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  searchGeneration += 1;
  searchQuery.value = '';
  searchResults.value = null;
  searchLoading.value = false;
  searchError.value = '';
  return hadSearch;
}

export function performSearch(q: string) {
  if (searchTimer) clearTimeout(searchTimer);
  const normalized = q.trim();
  const generation = ++searchGeneration;
  searchError.value = '';
  if (!normalized) {
    searchResults.value = null;
    searchLoading.value = false;
    return;
  }
  searchResults.value = [];
  searchLoading.value = true;
  searchTimer = setTimeout(() => {
    searchTimer = null;
    void executeSearch(normalized, generation);
  }, 300);
}
