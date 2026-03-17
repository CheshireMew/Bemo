<template>
  <div class="random-walk-view">
    <div class="random-walk-header">
      <h3>
        <Dices class="section-icon" :size="18" />
        随机漫步
      </h3>
      <div class="random-walk-actions">
        <button class="btn-random-next" @click="pickRandomNote">
          <Shuffle :size="14" />
          换一篇
        </button>
        <button class="btn-random-close" @click="closeView">
          <X :size="16" />
        </button>
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
import { ref, watch } from 'vue';
import { Dices, Shuffle, X } from 'lucide-vue-next';
import { notes } from '../../store/notes';
import type { NoteMeta } from '../../store/notes';
import { setView, randomWalkNonce } from '../../store/ui';
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

watch([randomWalkNonce, notes], () => {
  pickRandomNote();
}, { immediate: true });
</script>

<style scoped>
.random-walk-view { margin-top: 24px; }
.random-walk-header {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;
}
.random-walk-header h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.section-icon { color: var(--text-secondary); }
.random-walk-actions { display: flex; gap: 8px; align-items: center; }
.btn-random-next {
  background: var(--accent-sidebar-bg); color: var(--accent-color); border: none;
  padding: 6px 14px; border-radius: var(--radius-md); cursor: pointer;
  font-size: 0.8rem; font-weight: 500; transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.btn-random-next:hover { background: var(--accent-color); color: white; }
.btn-random-close {
  background: none; border: none; color: var(--text-secondary);
  cursor: pointer; padding: 6px; border-radius: 6px; line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.btn-random-close:hover { background: var(--bg-main); }
.trash-empty { text-align: center; color: #ccc; padding: 40px; font-size: 0.9rem; }
</style>
