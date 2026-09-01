<template>
  <div ref="listRef" class="paged-note-list">
    <NoteCard
      v-for="note in pageNotes"
      :key="note.note_id"
      :note="note"
      :is-trash="isTrash"
      @restore="emit('restore', note.note_id)"
      @permanent-delete="emit('permanentDelete', note.note_id)"
      @editing-change="setEditing(note.note_id, $event)"
    />
    <nav v-if="pageCount > 1" class="pagination pagination-bottom" aria-label="笔记分页底部">
      <span aria-live="polite">第 {{ page }} / {{ pageCount }} 页</span>
      <div class="page-controls">
        <button type="button" :disabled="page === 1" @click="changePage(page - 1)">上一页</button>
        <button type="button" :disabled="page === pageCount" @click="changePage(page + 1)">下一页</button>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { NoteMeta } from '../../store/notes';
import { requestConfirmation } from '../../store/dialogs';
import NoteCard from './NoteCard.vue';

const props = defineProps<{ notes: NoteMeta[]; isTrash?: boolean; resetKey?: string }>();
const emit = defineEmits<{ restore: [id: string]; permanentDelete: [id: string] }>();
const pageSize = 40;
const page = ref(1);
const listRef = ref<HTMLElement | null>(null);
const editingIds = new Set<string>();
const pageCount = computed(() => Math.max(1, Math.ceil(props.notes.length / pageSize)));
const pageNotes = computed(() => props.notes.slice((page.value - 1) * pageSize, page.value * pageSize));

watch(() => props.resetKey, () => { page.value = 1; editingIds.clear(); });
watch(pageCount, count => { page.value = Math.min(page.value, count); });
const setEditing = (id: string, editing: boolean) => {
  if (editing) editingIds.add(id);
  else editingIds.delete(id);
};
const changePage = async (next: number) => {
  if (next === page.value || next < 1 || next > pageCount.value) return;
  const hasEditor = pageNotes.value.some(note => editingIds.has(note.note_id));
  if (hasEditor && !(await requestConfirmation({
    title: '离开正在编辑的笔记？',
    message: '当前页有笔记处于编辑状态。请先保存，或放弃本次修改后翻页。',
    confirmLabel: '放弃修改并翻页',
    cancelLabel: '返回编辑',
  }))) return;
  page.value = next;
  editingIds.clear();
  await nextTick();
  listRef.value?.scrollIntoView({ block: 'start' });
};
</script>

<style scoped>
.paged-note-list { display: flex; flex-direction: column; gap: 10px; scroll-margin-top: 340px; }
.pagination { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; color: var(--text-secondary); font-size: var(--font-size-small); font-weight: 400; }
.page-controls { display: flex; align-items: center; gap: 6px; }
.page-controls button { min-height: 36px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-card); color: var(--text-primary); padding: 6px 9px; font: inherit; cursor: pointer; }
.page-controls button:disabled { color: var(--text-secondary); cursor: default; opacity: 0.55; }
.pagination-bottom { padding-top: 8px; }
@media (max-width: 767px) { .paged-note-list { scroll-margin-top: 16px; } }
</style>
