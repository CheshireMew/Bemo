<template>
  <div class="notes-feed">
    <div v-if="selectedDate" class="filter-bar">
      <span>筛选：{{ selectedDate.toLocaleDateString() }}</span>
      <button class="filter-clear" @click="selectedDate = null">×</button>
    </div>
    <div v-if="selectedTag" class="filter-bar">
      <span>标签：#{{ selectedTag }}</span>
      <button class="filter-clear" @click="selectedTag = null">×</button>
    </div>
    
    <NoteCard 
      v-for="note in displayedNotes" 
      :key="note.filename" 
      :note="note"
    />
  </div>
</template>

<script setup lang="ts">
import { displayedNotes, selectedDate, selectedTag } from '../../store/notes';
import NoteCard from './NoteCard.vue';
</script>

<style scoped>
.notes-feed { 
  display: flex; 
  flex-direction: column; 
  gap: 16px; 
  margin-top: 24px; 
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
</style>
