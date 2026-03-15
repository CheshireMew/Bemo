<template>
  <div class="random-walk-view">
    <div class="random-walk-header">
      <h3>🎲 随机漫步</h3>
      <div class="random-walk-actions">
        <!-- eslint-disable-next-line vue/valid-v-on -->
        <button class="btn-random-next" @click="pickRandomNote">↔️ 换一篇</button>
        <button class="btn-random-close" @click="closeView">×</button>
      </div>
    </div>
    
    <NoteCard 
      v-if="randomNote" 
      :note="randomNote"
      isRandom
    />
    <div v-else class="trash-empty">还没有笔记，快去记录灵感吧！</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { notes } from '../../store/notes';
import type { NoteMeta } from '../../store/notes';
import { setView } from '../../store/ui';
import NoteCard from './NoteCard.vue';

const randomNote = ref<NoteMeta | null>(null);

const pickRandomNote = () => {
  if (notes.value.length === 0) {
    randomNote.value = null;
    return;
  }
  const idx = Math.floor(Math.random() * notes.value.length);
  randomNote.value = notes.value[idx];
};

const closeView = () => {
  setView('all');
};

onMounted(() => {
  pickRandomNote();
});
</script>

<style scoped>
.random-walk-view { margin-top: 24px; }
.random-walk-header {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;
}
.random-walk-header h3 { font-size: 1.1rem; font-weight: 600; color: var(--text-primary); }
.random-walk-actions { display: flex; gap: 8px; align-items: center; }
.btn-random-next {
  background: var(--accent-sidebar-bg); color: var(--accent-color); border: none;
  padding: 6px 14px; border-radius: var(--radius-md); cursor: pointer;
  font-size: 0.8rem; font-weight: 500; transition: all 0.15s;
}
.btn-random-next:hover { background: var(--accent-color); color: white; }
.btn-random-close {
  background: none; border: none; font-size: 1.3rem; color: var(--text-secondary);
  cursor: pointer; padding: 2px 6px; border-radius: 4px; line-height: 1;
}
.btn-random-close:hover { background: var(--bg-main); }
.trash-empty { text-align: center; color: #ccc; padding: 40px; font-size: 0.9rem; }
</style>
