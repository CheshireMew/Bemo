<template>
  <header class="topbar">
    <div class="brand">bemo <span>v</span></div>
    <div class="sync-status" v-if="syncStatus !== 'online'">
      <span v-if="syncStatus === 'offline'">✈️ 离线模式{{ pendingCount > 0 ? ` · ${pendingCount}条待同步` : '' }}</span>
      <span v-else-if="syncStatus === 'syncing'">🔄 同步中… 剩余{{ pendingCount }}条</span>
    </div>
    <div class="search-box">
      <Search class="search-icon" :size="16" />
      <input type="text" v-model="searchQuery" placeholder="Ctrl+K 或直接搜索..." />
      <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">×</button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { Search } from 'lucide-vue-next';
import { syncStatus, pendingCount } from '../../store/sync';
import { searchQuery, performSearch } from '../../store/notes';

watch(searchQuery, (q) => {
  performSearch(q);
});

// 如果需要全局键盘事件，这里可以侦听 Ctrl+K
</script>

<style scoped>
.topbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 32px 0 24px 0; 
  position: sticky; top: 0; background: var(--bg-main); z-index: 10;
}
.brand { font-size: 1.1rem; font-weight: 700; color: #111; display: flex; align-items: baseline; gap: 4px; }
.brand span { font-size: 0.75rem; font-weight: normal; color: var(--text-secondary); }
.search-box {
  background: #e8eaed; border-radius: 20px; padding: 6px 16px;
  display: flex; align-items: center; gap: 8px; width: 260px; position: relative;
}
.search-box input { border: none; background: transparent; outline: none; width: 100%; font-size: 0.85rem; color: var(--text-primary); }
.search-box input::placeholder { color: #888; }
.search-icon { color: #888; }
.search-clear { background: none; border: none; font-size: 1rem; color: #888; cursor: pointer; padding: 0 2px; }
.sync-status {
  font-size: 0.8rem;
  color: #fbbf24;
  background-color: #fef3c7;
  padding: 4px 10px;
  border-radius: 12px;
  font-weight: 500;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .topbar {
    padding: 16px 0;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .search-box { width: 100%; }
}

:root.dark .search-box { background: #3f3f46; }
:root.dark .brand { color: var(--text-primary); }
</style>
