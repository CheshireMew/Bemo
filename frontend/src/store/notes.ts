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
} from '../domain/appStore/notesAdapter';
import type { NoteMeta } from '../domain/notes/notesTypes';
import { setView } from './ui';
import { requestSyncNow } from '../domain/sync/syncCoordinator.js';

export type { NoteMeta } from '../domain/notes/notesTypes';

// ==========================
// 状态 (State)
// ==========================
export const notes = ref<NoteMeta[]>([]);
export const trashNotes = ref<NoteMeta[]>([]);
export const searchResults = ref<NoteMeta[] | null>(null);

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
  notes.value.forEach((n) => (n.tags || []).forEach((t) => set.add(t)));
  return Array.from(set).sort();
});

// 计算日期和标签交叉过滤后的列表
export const filteredNotes = computed(() => {
  let result = notes.value;

  if (selectedDate.value) {
    const sel = selectedDate.value;
    result = result.filter((n) => {
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
    result = result.filter((n) => n.tags && n.tags.includes(tag));
  }

  return result;
});

// 呈现到界面上的笔记（如果处于搜索状态优先显示搜索结果）
export const displayedNotes = computed(() => {
  const source = searchResults.value !== null ? searchResults.value : filteredNotes.value;
  const direction = sortOrder.value === 'desc' ? -1 : 1;

  return [...source].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    return (a.created_at - b.created_at) * direction;
  });
});

function removeNoteFromVisibleCollections(noteId: string) {
  notes.value = notes.value.filter((item) => item.note_id !== noteId);
  if (searchResults.value !== null) {
    searchResults.value = searchResults.value.filter((item) => item.note_id !== noteId);
  }
}

async function refreshVisibleNotes() {
  notes.value = await listDisplayNotes();

  const query = searchQuery.value.trim();
  if (!query) {
    searchResults.value = null;
    return;
  }

  try {
    searchResults.value = await searchDisplayNotes(query);
  } catch (error) {
    console.error('Failed to refresh search results:', error);
    searchResults.value = null;
  }
}

// ==========================
// 操作行为 (Actions)
// ==========================

export async function fetchNotes() {
  try {
    await refreshVisibleNotes();
  } catch (error) {
    console.error(error);
  }
}

export async function deleteNote(noteId: string) {
  const previousNotes = [...notes.value];
  const previousSearchResults = searchResults.value ? [...searchResults.value] : null;

  try {
    const note = notes.value.find((item) => item.note_id === noteId);
    if (!note) return;
    removeNoteFromVisibleCollections(noteId);
    const queued = await moveNoteToTrash(note);
    if (queued) requestSyncNow();
    await refreshVisibleNotes();
  } catch (e) {
    notes.value = previousNotes;
    searchResults.value = previousSearchResults;
    console.error('Error deleting note:', e);
  }
}

export async function togglePin(note: NoteMeta) {
  try {
    const queued = await togglePinned(note);
    if (queued) requestSyncNow();
    await refreshVisibleNotes();
  } catch (e) {
    console.error('Error pinning note:', e);
  }
}

export async function updateNoteContent(note: NoteMeta, payload: { content: string; tags: string[] }) {
  const queued = await updateNote(note, payload);
  if (queued) requestSyncNow();
  await refreshVisibleNotes();
}

export async function createNoteContent(payload: { content: string; tags: string[] }) {
  const created = await createNote(payload);
  if (created.syncQueued) requestSyncNow();
  await refreshVisibleNotes();
  return created;
}

// 回收站相关
export async function fetchTrash() {
  try {
    trashNotes.value = await listDisplayTrash();
  } catch (e) {
    console.error(e);
  }
}

export async function restoreNote(noteId: string) {
  try {
    const queued = await restoreTrashNote(noteId);
    if (queued) requestSyncNow();
    await fetchTrash();
    await fetchNotes();
  } catch (e) {
    console.error(e);
  }
}

export async function permanentDelete(noteId: string) {
  if (!confirm('永久删除后无法恢复，确定吗？')) return;
  try {
    const queued = await purgeTrashNote(noteId);
    if (queued) requestSyncNow();
    await fetchTrash();
  } catch (e) {
    console.error(e);
  }
}

export async function emptyTrash() {
  if (!confirm('清空回收站后无法恢复，确定吗？')) return;
  try {
    const queued = await clearTrash();
    if (queued) requestSyncNow();
    trashNotes.value = [];
  } catch (e) {
    console.error(e);
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
export function clearSearch() {
  const hadSearch = Boolean(searchQuery.value.trim() || searchResults.value !== null);
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  searchQuery.value = '';
  searchResults.value = null;
  return hadSearch;
}

export function performSearch(q: string) {
  if (searchTimer) clearTimeout(searchTimer);
  if (!q.trim()) {
    searchResults.value = null;
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      searchResults.value = await searchDisplayNotes(q);
    } catch (e) {
      console.error(e);
    }
  }, 300);
}
