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
      <button class="btn-empty-trash" @click="emptyTrash">清空回收站</button>
    </div>

    <div v-if="trashNotes.length === 0" class="trash-empty">回收站是空的</div>

    <NoteCard
      v-for="note in trashNotes"
      :key="note.note_id"
      :note="note"
      isTrash
      class="trash-card"
      @restore="restoreNote(note.note_id)"
      @permanentDelete="permanentDelete(note.note_id)"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { Trash2 } from 'lucide-vue-next';
import { emptyTrash, fetchTrash, permanentDelete, restoreNote, trashNotes } from '../../store/notes';
import NoteCard from './NoteCard.vue';

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
  background: #fee2e2;
  color: #ef4444;
  border: none;
  padding: 6px 14px;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.15s;
}

.btn-empty-trash:hover {
  background: #fecaca;
}

.trash-empty {
  text-align: center;
  color: #ccc;
  padding: 40px;
  font-size: 0.9rem;
}

:deep(.trash-card) {
  opacity: 0.7;
  border-style: dashed;
}

:deep(.trash-card:hover) {
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
