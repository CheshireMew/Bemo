<template>
  <div class="topbar-row topbar-row-main">
    <button v-if="showSidebarToggle" class="icon-btn menu-btn" title="打开导航" @click="emit('openSidebar')">
      <PanelLeftOpen :size="18" />
    </button>
    <div class="search-box">
      <Search class="search-icon" :size="16" />
      <input type="text" v-model="searchQuery" placeholder="Ctrl+K 或直接搜索..." />
      <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">×</button>
    </div>
    <div class="topbar-actions">
      <button
        class="icon-btn"
        :class="{ active: sortOrder === 'asc' }"
        :title="sortOrder === 'desc' ? '当前从新到旧，点击切换为从旧到新' : '当前从旧到新，点击切换为从新到旧'"
        @click="toggleSortOrder"
      >
        <ArrowUpDown :size="18" />
      </button>
      <button class="icon-btn" :title="isDarkMode ? '切换浅色模式' : '切换深色模式'" @click="toggleTheme">
        <Sun v-if="isDarkMode" :size="20" />
        <Moon v-else :size="20" />
      </button>
      <button class="icon-btn" title="设置" @click="emit('openSettings')">
        <Settings :size="20" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { Search, Settings, ArrowUpDown, PanelLeftOpen, Sun, Moon } from 'lucide-vue-next';
import { searchQuery, performSearch, sortOrder, toggleSortOrder } from '../../../store/notes';
import { isDarkMode, toggleTheme } from '../../../store/ui';

withDefaults(defineProps<{
  showSidebarToggle?: boolean;
}>(), {
  showSidebarToggle: false,
});

const emit = defineEmits<{
  openSettings: [];
  openSidebar: [];
}>();

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
  background: color-mix(in srgb, var(--border-color, #e8eaed) 88%, var(--bg-card, #fff));
  border-radius: 18px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  position: relative;
  transition: background 0.2s, box-shadow 0.2s;
  flex: 1;
  min-width: 0;
}

.search-box:focus-within {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-color) 18%, transparent);
}

.search-box input {
  border: none;
  background: transparent;
  outline: none;
  width: 100%;
  min-width: 0;
  font-size: 0.94rem;
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
  padding: 0 2px;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: auto;
  padding: 2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-card, #fff) 76%, transparent);
}

.icon-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary, #a1a1aa);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 999px;
  transition: all 0.2s ease;
}

.icon-btn:hover {
  color: var(--text-primary);
  background-color: var(--bg-main, #f4f4f5);
}

.icon-btn.active {
  color: var(--accent-color);
  background-color: var(--border-color, #e8eaed);
}

@media (max-width: 767px) {
  .topbar-row {
    flex-wrap: nowrap;
    gap: 8px;
  }

  .menu-btn {
    flex-shrink: 0;
  }

  .search-box {
    padding: 7px 12px;
    border-radius: 16px;
    gap: 8px;
  }

  .search-box input {
    font-size: 0.88rem;
  }

  .topbar-actions {
    justify-content: flex-end;
    gap: 4px;
    margin-left: 0;
  }

  .icon-btn {
    width: 34px;
    height: 34px;
  }
}
</style>
