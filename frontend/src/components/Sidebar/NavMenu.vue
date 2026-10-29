<template>
  <div>
    <nav class="nav-menu" aria-label="笔记导航">
      <a href="#" class="nav-item" :class="{ active: currentView === 'all' }" :aria-current="currentView === 'all' ? 'page' : undefined" @click.prevent="handleAllNotes">
        <LayoutGrid class="icon" :size="18" /> 全部笔记
      </a>
      <a href="#" class="nav-item" :class="{ active: currentView === 'random' }" :aria-current="currentView === 'random' ? 'page' : undefined" @click.prevent="handleRandomWalk">
        <Dices class="icon" :size="18" /> 随机漫步
      </a>
      <a href="#" class="nav-item" :class="{ active: currentView === 'trash' }" :aria-current="currentView === 'trash' ? 'page' : undefined" @click.prevent="openTrashView">
        <Trash2 class="icon" :size="18" /> 回收站
      </a>
    </nav>

    <slot name="taglist"></slot>

  </div>
</template>

<script setup lang="ts">
import { LayoutGrid, Dices, Trash2 } from 'lucide-vue-next';
import { usePrimaryNavigation } from '../../composables/usePrimaryNavigation';

const emit = defineEmits<{
  navigate: [];
}>();

const {
  currentView,
  openAllNotes: handleAllNotes,
  openRandomWalkView: handleRandomWalk,
  openTrashView,
} = usePrimaryNavigation(() => emit('navigate'));
</script>

<style scoped>
.nav-menu { display: flex; flex-direction: column; gap: 4px; margin-bottom: 24px; }
.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  min-height: 44px;
  text-decoration: none; color: var(--text-secondary); border-radius: var(--radius-md); 
  font-size: 0.9375rem; font-weight: 500;
  transition: background-color 0.15s, color 0.15s;
}
.nav-item:hover { background-color: var(--border-color); color: var(--text-primary); }
.nav-item.active { background-color: var(--accent-sidebar-bg); color: var(--accent-text); font-weight: 600;}
.nav-item.active .icon { color: var(--accent-text); }
.icon { color: var(--text-secondary); }

</style>
