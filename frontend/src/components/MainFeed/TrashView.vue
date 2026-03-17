<template>
  <div class="trash-view">
    <div class="trash-header">
      <h3>
        <Trash2 class="section-icon" :size="18" />
        回收站
      </h3>
      <button v-if="trashNotes.length" class="btn-empty-trash" @click="emptyTrash">清空回收站</button>
    </div>
    <div v-if="trashNotes.length === 0" class="trash-empty">回收站是空的</div>
    
    <NoteCard 
      v-for="note in trashNotes" 
      :key="note.filename" 
      :note="note"
      isTrash
      class="trash-card"
      @restore="restoreNote(note.filename)"
      @permanentDelete="permanentDelete(note.filename)"
    />
  </div>
</template>

<script setup lang="ts">
import { trashNotes, emptyTrash, restoreNote, permanentDelete } from '../../store/notes';
import { Trash2 } from 'lucide-vue-next';
import NoteCard from './NoteCard.vue';
</script>

<style scoped>
.trash-view { margin-top: 24px; }
.trash-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.trash-header h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.section-icon { color: var(--text-secondary); }
.btn-empty-trash { 
  background: #fee2e2; color: #ef4444; border: none; 
  padding: 6px 14px; border-radius: var(--radius-md); cursor: pointer;
  font-size: 0.8rem; transition: all 0.15s;
}
.btn-empty-trash:hover { background: #fecaca; }
.trash-empty { text-align: center; color: #ccc; padding: 40px; font-size: 0.9rem; }

/* 必须保证回收站的样式能正确透传至 note-card 上，所以可以通过 props 处理，也可以用深作用选择器，这里我们在 note-card 预留了 trash-card 类名 */
:deep(.trash-card) { opacity: 0.7; border-style: dashed; }
:deep(.trash-card:hover) { opacity: 1; }
</style>
