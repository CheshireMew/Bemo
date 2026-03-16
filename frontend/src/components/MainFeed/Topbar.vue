<template>
  <header class="topbar">
    <!-- 左侧：搜索框 -->
    <div class="search-box">
      <Search class="search-icon" :size="16" />
      <input type="text" v-model="searchQuery" placeholder="Ctrl+K 或直接搜索..." />
      <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">×</button>
    </div>

    <!-- 中间：同步状态（仅离线/同步中时显示） -->
    <div class="sync-status" v-if="syncStatus !== 'online'">
      <span v-if="syncStatus === 'offline'">✈️ 离线模式{{ pendingCount > 0 ? ` · ${pendingCount}条待同步` : '' }}</span>
      <span v-else-if="syncStatus === 'syncing'">🔄 同步中… 剩余{{ pendingCount }}条</span>
    </div>

    <!-- 右侧：主题切换 + 设置 -->
    <div class="topbar-actions">
      <button class="icon-btn" :title="isDarkMode ? '切换浅色模式' : '切换深色模式'" @click="toggleTheme">
        <Sun v-if="isDarkMode" :size="20" />
        <Moon v-else :size="20" />
      </button>
      <button class="icon-btn" title="设置" @click="$emit('openSettings')">
        <Settings :size="20" />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { Search, Sun, Moon, Settings } from 'lucide-vue-next';
import { syncStatus, pendingCount } from '../../store/sync';
import { searchQuery, performSearch } from '../../store/notes';
import { isDarkMode, toggleTheme } from '../../store/ui';

defineEmits(['openSettings']);

watch(searchQuery, (q) => {
  performSearch(q);
});
</script>

<style scoped>
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32px 0 24px 0;
  position: sticky;
  top: 0;
  background: var(--bg-main);
  z-index: 10;
  gap: 12px;
}

.search-box {
  background: var(--border-color, #e8eaed);
  border-radius: 20px;
  padding: 6px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 260px;
  position: relative;
  transition: background 0.2s;
}
.search-box:focus-within {
  box-shadow: 0 0 0 2px var(--accent-color);
}
.search-box input {
  border: none;
  background: transparent;
  outline: none;
  width: 100%;
  font-size: 0.85rem;
  color: var(--text-primary);
}
.search-box input::placeholder { color: var(--text-secondary, #888); }
.search-icon { color: var(--text-secondary, #888); flex-shrink: 0; }
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
  gap: 4px;
  flex-shrink: 0;
}

.icon-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary, #a1a1aa);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border-radius: var(--radius-sm, 0.375rem);
  transition: all 0.2s ease;
}
.icon-btn:hover {
  color: var(--text-primary);
  background-color: var(--bg-main, #f4f4f5);
}

.sync-status {
  font-size: 0.8rem;
  color: #fbbf24;
  background-color: #fef3c7;
  padding: 4px 10px;
  border-radius: 12px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

:root.dark .sync-status {
  background-color: #422006;
  color: #fbbf24;
}

@media (max-width: 768px) {
  .topbar {
    padding: 16px 0;
    flex-wrap: wrap;
  }
  .search-box { flex: 1; min-width: 0; }
}
</style>
