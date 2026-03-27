<template>
  <div>
    <nav class="nav-menu">
      <a href="#" class="nav-item" :class="{ active: currentView === 'all' }" @click.prevent="handleAllNotes">
        <LayoutGrid class="icon" :size="18" /> 全部笔记
      </a>
      <a href="#" class="nav-item" :class="{ active: currentView === 'random' }" @click.prevent="handleRandomWalk">
        <Dices class="icon" :size="18" /> 随机漫步
      </a>
      <a href="#" class="nav-item" @click.prevent="openDefaultAiChat">
        <MessagesSquare class="icon" :size="18" /> AI 对话
      </a>
    </nav>

    <slot name="taglist"></slot>

  </div>
</template>

<script setup lang="ts">
import { 
  LayoutGrid, Dices, MessagesSquare
} from 'lucide-vue-next';
import { usePrimaryNavigation } from '../../composables/usePrimaryNavigation';

const emit = defineEmits<{
  navigate: [];
}>();

const {
  currentView,
  openAllNotes: handleAllNotes,
  openRandomWalkView: handleRandomWalk,
  openDefaultAiChat,
} = usePrimaryNavigation(() => emit('navigate'));
</script>

<style scoped>
.nav-menu { display: flex; flex-direction: column; gap: 4px; margin-bottom: 24px; }
.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  text-decoration: none; color: var(--text-secondary); border-radius: var(--radius-md); 
  font-size: 0.95rem; font-weight: 500;
  transition: all 0.15s ease;
}
.nav-item:hover { background-color: var(--border-color); color: var(--text-primary); }
.nav-item.active { background-color: var(--accent-color); color: white; font-weight: 600;}
.nav-item.active .icon { color: white; }
.icon { color: var(--text-secondary); }

</style>
