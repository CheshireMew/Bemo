import { ref, computed } from 'vue';
import axios from 'axios';
import { API_BASE } from '../config';
import { enqueueChange, getCachedNotes, setCachedNotes } from '../utils/db';
import { requestSyncNow } from '../utils/sync';
import { settings } from './settings';

export interface NoteMeta {
  note_id: string;
  revision: number;
  filename: string;
  title: string;
  created_at: number;
  updated_at: number;
  content: string;
  tags: string[];
  pinned: boolean;
}

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

// ==========================
// 操作行为 (Actions)
// ==========================

export async function fetchNotes() {
  try {
    const res = await axios.get(`${API_BASE}/notes/`);
    notes.value = res.data;
    // 异步更新离线缓存
    setCachedNotes(res.data).catch(() => {});
  } catch (error) {
    console.error('Failed to fetch notes from server, falling back to cache...', error);
    try {
      const cached = await getCachedNotes();
      if (cached.length > 0) {
        notes.value = cached;
      }
    } catch (e) {
      console.error('Failed to load notes from cache either.', e);
    }
  }
}

export async function deleteNote(filename: string) {
  try {
    const note = notes.value.find((item) => item.filename === filename);
    if (!note) return;
    const baseRevision = note.revision;
    await axios.delete(`${API_BASE}/notes/${filename}`);
    await queueRemoteChange({
      entityId: note.note_id,
      type: 'note.delete',
      baseRevision,
      payload: {
        filename: note.filename,
      },
    });
    await fetchNotes();
  } catch (e) {
    console.error('Error deleting note:', e);
  }
}

export async function togglePin(note: NoteMeta) {
  try {
    const nextPinned = !note.pinned;
    const baseRevision = note.revision;
    await axios.patch(`${API_BASE}/notes/${note.filename}`, { pinned: nextPinned });
    await queueRemoteChange({
      entityId: note.note_id,
      type: 'note.patch',
      baseRevision,
      payload: {
        filename: note.filename,
        pinned: nextPinned,
      },
    });
    await fetchNotes();
  } catch (e) {
    console.error('Error pinning note:', e);
  }
}

export async function updateNoteContent(note: NoteMeta, payload: { content: string; tags: string[] }) {
  const baseRevision = note.revision;
  await axios.put(`${API_BASE}/notes/${note.filename}`, {
    content: payload.content,
    tags: payload.tags,
  });
  await queueRemoteChange({
    entityId: note.note_id,
    type: 'note.update',
    baseRevision,
    payload: {
      filename: note.filename,
      content: payload.content,
      tags: payload.tags,
    },
  });
  await fetchNotes();
}

export async function createNoteContent(payload: { content: string; tags: string[] }) {
  const response = await axios.post(`${API_BASE}/notes/`, {
    content: payload.content,
    tags: payload.tags.length ? payload.tags : undefined,
  });
  const created = response.data as { note_id: string; revision: number; filename: string };
  await queueRemoteChange({
    entityId: created.note_id,
    type: 'note.create',
    baseRevision: 0,
    payload: {
      filename: created.filename,
      content: payload.content,
      tags: payload.tags,
      pinned: false,
      created_at: new Date().toISOString(),
      revision: 1,
    },
  });
  await fetchNotes();
  return created;
}

async function queueRemoteChange(input: {
  entityId: string;
  type: 'note.create' | 'note.update' | 'note.patch' | 'note.delete';
  baseRevision: number;
  payload: Record<string, unknown>;
}) {
  if (settings.sync.mode === 'local') return;
  await enqueueChange({
    entityId: input.entityId,
    type: input.type,
    baseRevision: input.baseRevision,
    payload: input.payload,
  });
  requestSyncNow();
}

// 回收站相关
export async function fetchTrash() {
  try {
    const res = await axios.get(`${API_BASE}/notes/trash/list`);
    trashNotes.value = res.data;
  } catch (e) {
    console.error(e);
  }
}

export async function restoreNote(filename: string) {
  try {
    await axios.post(`${API_BASE}/notes/trash/restore/${filename}`);
    await fetchTrash();
    await fetchNotes();
  } catch (e) {
    console.error(e);
  }
}

export async function permanentDelete(filename: string) {
  if (!confirm('永久删除后无法恢复，确定吗？')) return;
  try {
    await axios.delete(`${API_BASE}/notes/trash/permanent/${filename}`);
    await fetchTrash();
  } catch (e) {
    console.error(e);
  }
}

export async function emptyTrash() {
  if (!confirm('清空回收站后无法恢复，确定吗？')) return;
  try {
    await axios.delete(`${API_BASE}/notes/trash/empty`);
    trashNotes.value = [];
  } catch (e) {
    console.error(e);
  }
}

// 标签功能
export function toggleTag(tag: string) {
  selectedTag.value = selectedTag.value === tag ? null : tag;
}

export function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc';
}

// 日期过滤
export function selectDate(date: Date) {
  if (selectedDate.value && selectedDate.value.toDateString() === date.toDateString()) {
    selectedDate.value = null; // 取消筛选
  } else {
    selectedDate.value = new Date(date);
    selectedDate.value.setHours(0, 0, 0, 0);
  }
}

// 搜索行为
let searchTimer: ReturnType<typeof setTimeout> | null = null;
export function performSearch(q: string) {
  if (searchTimer) clearTimeout(searchTimer);
  if (!q.trim()) {
    searchResults.value = null;
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const res = await axios.get(`${API_BASE}/notes/search`, { params: { q } });
      searchResults.value = res.data;
    } catch (e) {
      console.error(e);
    }
  }, 300);
}
