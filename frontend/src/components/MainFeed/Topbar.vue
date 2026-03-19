<template>
  <header class="topbar">
    <div class="topbar-row topbar-row-main">
      <button v-if="showSidebarToggle" class="icon-btn menu-btn" title="打开导航" @click="$emit('openSidebar')">
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
        <button class="icon-btn" title="设置" @click="$emit('openSettings')">
          <Settings :size="20" />
        </button>
      </div>
    </div>
    <div class="sync-status" v-if="syncStatus !== 'online' || pendingCount > 0 || syncError || otherTargetPendingHint">
      <span v-if="syncStatus === 'offline'" class="sync-status-main">
        <CloudOff class="sync-status-icon" :size="14" />
        {{ syncTarget }}{{ pendingCount > 0 ? ` · ${pendingCount}条待同步` : '' }}
      </span>
      <span v-else-if="syncStatus === 'syncing'" class="sync-status-main">
        <RefreshCw class="sync-status-icon spin" :size="14" />
        {{ syncTarget }}同步中 · 剩余{{ pendingCount }}条
      </span>
      <span v-else class="sync-status-main">
        <Cloud class="sync-status-icon" :size="14" />
        {{ syncTarget }} · {{ pendingCount }}条待同步
      </span>
      <span v-if="otherTargetPendingHint" class="sync-other-target"> · {{ otherTargetPendingHint }}</span>
      <span v-if="syncError" class="sync-error"> · {{ syncError }}</span>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { Search, Settings, ArrowUpDown, Cloud, CloudOff, RefreshCw, PanelLeftOpen, Sun, Moon } from 'lucide-vue-next';
import { pendingCount, serverPendingCount, syncError, syncStatus, syncTarget, webdavPendingCount } from '../../store/sync';
import { searchQuery, performSearch, sortOrder, toggleSortOrder } from '../../store/notes';
import { isDarkMode, toggleTheme } from '../../store/ui';

withDefaults(defineProps<{
  showSidebarToggle?: boolean;
}>(), {
  showSidebarToggle: false,
});

defineEmits(['openSettings', 'openSidebar']);

const otherTargetPendingHint = computed(() => {
  const hints: string[] = [];
  if (syncTarget.value !== '自部署服务器' && serverPendingCount.value > 0) {
    hints.push(`Server 还有${serverPendingCount.value}条`);
  }
  if (syncTarget.value !== 'WebDAV' && webdavPendingCount.value > 0) {
    hints.push(`WebDAV 还有${webdavPendingCount.value}条`);
  }
  return hints.join('，');
});

watch(searchQuery, (q) => {
  performSearch(q);
});
</script>

<style scoped>
.topbar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  max-width: 760px;
  padding: calc(20px + var(--safe-top)) 0 18px 0;
  margin: 0;
  background: color-mix(in srgb, var(--bg-main) 88%, transparent);
  backdrop-filter: blur(16px);
  gap: 10px;
}

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

.sync-status {
  font-size: 0.78rem;
  color: #fbbf24;
  background-color: #fef3c7;
  padding: 6px 10px;
  border-radius: 14px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
}

.sync-status-main {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.sync-status-icon {
  flex-shrink: 0;
}

.spin {
  animation: sync-spin 1s linear infinite;
}

.sync-error {
  color: #b91c1c;
}

.sync-other-target {
  color: #92400e;
}

:root.dark .sync-status {
  background-color: #422006;
  color: #fbbf24;
}

@keyframes sync-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 1023px) {
  .topbar {
    max-width: 720px;
    padding-top: calc(16px + var(--safe-top));
    padding-bottom: 16px;
  }
}

@media (max-width: 767px) {
  .topbar {
    max-width: none;
    padding-top: calc(12px + var(--safe-top));
    padding-bottom: 14px;
    gap: 8px;
  }

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
    gap: 4px;
  }

  .sync-status {
    width: 100%;
    white-space: normal;
    font-size: 0.75rem;
  }

  .topbar-actions {
    justify-content: flex-end;
    margin-left: 0;
  }

  .icon-btn {
    width: 34px;
    height: 34px;
  }
}
</style>
