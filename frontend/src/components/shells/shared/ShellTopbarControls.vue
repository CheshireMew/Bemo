<template>
  <div class="topbar-row topbar-row-main" :class="{ 'has-settings': showSettings }">
    <button v-if="showSidebarToggle" type="button" class="icon-btn menu-btn" title="打开导航" aria-label="打开导航" @click="emit('openSidebar')">
      <PanelLeftOpen :size="18" />
    </button>
    <div class="search-box" role="search" aria-label="笔记搜索">
      <Search class="search-icon" :size="18" aria-hidden="true" />
      <input ref="searchInputRef" type="search" aria-label="搜索笔记" aria-keyshortcuts="Control+K Meta+K" v-model="searchQuery" :placeholder="searchPlaceholder" />
      <button v-if="searchQuery" type="button" class="search-clear" aria-label="清空搜索" @click="clearAndFocus"><X :size="16" /></button>
    </div>
    <div class="topbar-actions">
      <button
        class="icon-btn"
        type="button"
        :class="{ active: sortOrder === 'asc' }"
        :aria-pressed="sortOrder === 'asc'"
        :aria-label="sortOrder === 'desc' ? '当前从新到旧，点击切换为从旧到新' : '当前从旧到新，点击切换为从新到旧'"
        :title="sortOrder === 'desc' ? '当前从新到旧，点击切换为从旧到新' : '当前从旧到新，点击切换为从新到旧'"
        @click="toggleSortOrder"
      >
        <ArrowUpDown :size="18" />
      </button>
      <button class="icon-btn" type="button" :aria-label="isDarkMode ? '切换浅色模式' : '切换深色模式'" :title="isDarkMode ? '切换浅色模式' : '切换深色模式'" @click="toggleTheme">
        <Sun v-if="isDarkMode" :size="20" />
        <Moon v-else :size="20" />
      </button>
      <button v-if="showSettings" class="icon-btn" type="button" title="设置" aria-label="打开设置" @click="emit('openSettings')">
        <Settings :size="20" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Search, Settings, ArrowUpDown, PanelLeftOpen, Sun, Moon, X } from 'lucide-vue-next';
import { searchQuery, performSearch, sortOrder, toggleSortOrder } from '../../../store/notes';
import { isDarkMode, toggleTheme } from '../../../store/ui';

withDefaults(defineProps<{
  showSidebarToggle?: boolean;
  showSettings?: boolean;
  searchPlaceholder?: string;
}>(), {
  showSidebarToggle: false,
  showSettings: true,
  searchPlaceholder: '搜索笔记…',
});

const emit = defineEmits<{
  openSettings: [];
  openSidebar: [];
}>();

const searchInputRef = ref<HTMLInputElement | null>(null);
const clearAndFocus = () => {
  searchQuery.value = '';
  searchInputRef.value?.focus();
};

const handleGlobalSearchShortcut = (event: KeyboardEvent) => {
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'k') return;
  if (document.querySelector('[aria-modal="true"]')) return;
  const target = event.target as HTMLElement | null;
  const isEditing = target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target?.isContentEditable;
  if (isEditing) return;
  event.preventDefault();
  searchInputRef.value?.focus();
  searchInputRef.value?.select();
};

onMounted(() => window.addEventListener('keydown', handleGlobalSearchShortcut));
onBeforeUnmount(() => window.removeEventListener('keydown', handleGlobalSearchShortcut));

watch(searchQuery, (q) => {
  performSearch(q);
});
</script>

<style scoped>
.topbar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.topbar-row-main {
  justify-content: space-between;
}

.search-box {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  min-height: 44px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  position: relative;
  transition: border-color 0.15s;
  flex: 1;
  min-width: 0;
}

.search-box:focus-within {
  outline: 2px solid var(--accent-color);
  outline-offset: 2px;
  border-color: var(--accent-color);
}

.search-box input {
  border: none;
  background: transparent;
  outline: none;
  width: 100%;
  min-width: 0;
  min-height: 40px;
  font-family: inherit;
  font-size: 0.9375rem;
  color: var(--text-primary);
}

.search-box input::placeholder {
  color: var(--text-secondary, #888);
}

.search-icon {
  color: var(--text-secondary, #888);
  flex-shrink: 0;
}

.search-clear {
  background: none;
  border: none;
  font-size: 1rem;
  color: var(--text-secondary, #888);
  cursor: pointer;
  display: grid;
  place-items: center;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
}

.search-clear:hover {
  background: var(--surface-hover);
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: auto;
  padding: 0;
}

.icon-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary, #a1a1aa);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: var(--radius-md);
  transition: background-color 0.15s, color 0.15s;
}

.icon-btn:hover {
  color: var(--text-primary);
  background-color: var(--surface-hover);
}

.icon-btn.active {
  color: var(--accent-text);
  background-color: var(--accent-sidebar-bg);
}

@media (max-width: 767px) {
  .topbar-row {
    flex-wrap: nowrap;
    gap: 6px;
  }

  .menu-btn {
    flex-shrink: 0;
  }

  .search-box {
    height: 44px;
    box-sizing: border-box;
    padding: 0 12px;
    border-radius: var(--radius-md);
    gap: 8px;
  }

  .search-box input {
    height: 100%;
    min-height: 0 !important;
    padding: 0;
    font-size: var(--font-size-body);
  }

  .topbar-actions {
    justify-content: flex-end;
    gap: 0;
    margin-left: 0;
    padding: 0;
    background: transparent;
  }

  .icon-btn {
    width: 40px;
    height: 40px;
    min-width: 40px !important;
    min-height: 40px !important;
  }
}

@media (max-width: 420px) {
  .topbar-row-main.has-settings { flex-wrap: wrap; }
  .has-settings .search-box { flex-basis: calc(100% - 50px); }
  .has-settings .topbar-actions { margin-left: auto; }
}

@media (pointer: coarse) {
  .icon-btn, .search-clear { min-width: 44px !important; min-height: 44px !important; }
}
</style>
