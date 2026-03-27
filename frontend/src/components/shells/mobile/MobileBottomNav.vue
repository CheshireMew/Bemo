<template>
  <nav class="mobile-bottom-nav" aria-label="移动端主导航">
    <button class="nav-btn" :class="{ active: currentView === 'all' }" @click="openAllNotes">
      <LayoutGrid :size="18" />
      <span>笔记</span>
    </button>
    <button class="nav-btn" :class="{ active: currentView === 'random' }" @click="openRandomWalkView">
      <Dices :size="18" />
      <span>漫步</span>
    </button>
    <button class="nav-btn nav-btn-compose" type="button" aria-label="记录" title="记录" @click="emit('compose')">
      <div class="compose-pill">
        <Plus :size="20" />
      </div>
    </button>
    <button class="nav-btn" @click="openDefaultAiChat">
      <MessagesSquare :size="18" />
      <span>AI</span>
    </button>
    <button class="nav-btn" :class="{ active: currentView === 'trash' }" @click="openTrashView">
      <Trash2 :size="18" />
      <span>回收站</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { Dices, LayoutGrid, MessagesSquare, Plus, Trash2 } from 'lucide-vue-next';
import { usePrimaryNavigation } from '../../../composables/usePrimaryNavigation';

const emit = defineEmits<{
  compose: [];
}>();

const {
  currentView,
  openAllNotes,
  openRandomWalkView,
  openTrashView,
  openDefaultAiChat,
} = usePrimaryNavigation();
</script>

<style scoped>
.mobile-bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  padding: 6px max(12px, var(--safe-left)) calc(8px + var(--safe-bottom)) max(12px, var(--safe-right));
  border-top: 1px solid color-mix(in srgb, var(--border-color, #e4e4e7) 88%, white);
  background: color-mix(in srgb, var(--bg-card, #fff) 92%, rgba(255, 255, 255, 0.72));
  backdrop-filter: blur(20px);
}

.nav-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary, #71717a);
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  min-height: 48px;
  padding: 4px 0 0;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
}

.nav-btn.active {
  color: var(--accent-color, #31d279);
}

.nav-btn-compose {
  justify-content: center;
}

.compose-pill {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-color, #31d279);
  color: white;
  box-shadow: 0 10px 24px rgba(49, 210, 121, 0.28);
  transform: translateY(-6px);
}
</style>
