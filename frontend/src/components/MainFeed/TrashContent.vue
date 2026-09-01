<template>
  <div class="trash-content" :class="{ 'trash-content-embedded': embedded }">
    <div v-if="showHeader" class="trash-header">
      <h3>
        <Trash2 class="section-icon" :size="18" />
        回收站
      </h3>
      <button v-if="trashNotes.length" class="btn-empty-trash" @click="emptyTrash">清空回收站</button>
    </div>

    <div v-else-if="trashNotes.length" class="trash-toolbar">
      <p>可以使用每条笔记右上角的按钮恢复，或永久删除。</p>
      <button class="btn-empty-trash" @click="emptyTrash">清空回收站</button>
    </div>

    <p class="trash-hint">删除的笔记可以在这里恢复；永久删除后无法找回。</p>
    <div v-if="trashReadError" class="trash-error" role="alert">
      <span>{{ trashReadError }}</span>
      <button type="button" :disabled="trashLoading" @click="fetchTrash">重试</button>
    </div>
    <div v-if="trashLoading && !trashNotes.length" class="trash-empty" role="status">正在读取回收站…</div>
    <div v-else-if="trashNotes.length === 0 && !trashReadError" class="trash-empty" role="status">回收站是空的</div>

    <PagedNoteList
      :notes="trashNotes"
      isTrash
      class="trash-card"
      @restore="restoreNote"
      @permanentDelete="permanentDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { Trash2 } from 'lucide-vue-next';
import { emptyTrash, fetchTrash, permanentDelete, restoreNote, trashNotes, trashLoading, trashReadError } from '../../store/notes';
import PagedNoteList from './PagedNoteList.vue';

withDefaults(defineProps<{
  embedded?: boolean;
  showHeader?: boolean;
}>(), {
  embedded: false,
  showHeader: true,
});

onMounted(() => {
  void fetchTrash();
});
</script>

<style scoped>
.trash-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 24px;
}

.trash-content-embedded {
  margin-top: 0;
}

.trash-header,
.trash-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}
.trash-hint { color: var(--text-secondary); font-size: var(--font-size-small); font-weight: 400; line-height: 1.55; }
.trash-error { color: var(--danger-text); display: flex; justify-content: space-between; gap: 12px; }
.trash-error button { color: inherit; background: var(--bg-card); border: 1px solid currentColor; border-radius: 8px; padding: 5px 10px; cursor: pointer; }

.trash-toolbar p {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-small);
  line-height: 1.5;
}

.trash-header h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.section-icon {
  color: var(--text-secondary);
}

.btn-empty-trash {
  background: color-mix(in srgb, var(--danger-color) 12%, var(--bg-card));
  color: var(--danger-text);
  border: none;
  padding: 6px 14px;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--font-size-small);
  font-weight: 400;
  transition: all 0.15s;
}

.btn-empty-trash:hover {
  background: color-mix(in srgb, var(--danger-color) 20%, var(--bg-card));
}

.trash-empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 40px;
  font-size: var(--font-size-supporting);
}

:deep(.trash-card .note-card) {
  border-style: dashed;
}

:deep(.trash-card .note-card:hover) {
  opacity: 1;
}

@media (max-width: 767px) {
  .trash-header,
  .trash-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
