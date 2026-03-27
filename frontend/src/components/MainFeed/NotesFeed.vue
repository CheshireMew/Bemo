<template>
  <div class="notes-feed">
    <div v-if="showInlineFilters && selectedDate" class="filter-bar">
      <span>筛选：{{ selectedDate.toLocaleDateString() }}</span>
      <button class="filter-clear" @click="selectedDate = null">×</button>
    </div>
    <div v-if="showInlineFilters && selectedTag" class="filter-bar">
      <span>标签：#{{ selectedTag }}</span>
      <button class="filter-clear" @click="selectedTag = null">×</button>
    </div>
    
    <NoteCard 
      v-for="note in displayedNotes" 
      :key="note.note_id" 
      :note="note"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { displayedNotes, selectedDate, selectedTag } from '../../store/notes';
import { getProductShell } from '../../domain/runtime/shellRuntime';
import NoteCard from './NoteCard.vue';

const showInlineFilters = computed(() => getProductShell() !== 'mobile');
</script>

<style scoped>
.notes-feed { 
  display: flex; 
  flex-direction: column; 
  gap: 10px; 
  margin-top: 18px; 
}
.filter-bar { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  padding: 8px 12px; 
  background: var(--accent-sidebar-bg); 
  border-radius: var(--radius-md); 
  font-size: 0.85rem; 
  color: var(--accent-color); 
  margin-bottom: 12px; 
}
.filter-clear { 
  background: none; 
  border: none; 
  font-size: 1.1rem; 
  color: var(--accent-color); 
  cursor: pointer; 
  padding: 0 4px; 
}

@media (max-width: 767px) {
  .notes-feed {
    margin-top: 10px;
  }
}
</style>
