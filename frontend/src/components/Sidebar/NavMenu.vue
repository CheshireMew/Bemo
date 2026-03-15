<template>
  <div>
    <nav class="nav-menu">
      <a href="#" class="nav-item" :class="{ active: currentView === 'all' }" @click.prevent="setView('all')">
        <LayoutGrid class="icon" :size="18" /> 全部笔记
      </a>
      <a href="#" class="nav-item" :class="{ active: currentView === 'random' }" @click.prevent="setView('random')">
        <Dices class="icon" :size="18" /> 随机漫步
      </a>
      <!-- 预留其他导航菜单 -->
    </nav>

    <!-- 此处用于渲染父组件传递的 TagList -->
    <slot name="taglist"></slot>

    <nav class="nav-menu bottom-menu">
      <div class="theme-toggle" @click="toggleTheme" title="切换深色/浅色模式">
        <Moon v-if="!isDarkMode" :size="18" class="icon" />
        <Sun v-else :size="18" class="icon" />
        <span style="font-size: 0.85rem; margin-left: 8px; font-weight: 500;">{{ isDarkMode ? '浅色模式' : '深色模式' }}</span>
      </div>
      
      <div class="nav-item-dropdown">
        <a href="#" class="nav-item" @click.prevent="showExportMenu = !showExportMenu">
          <ArrowLeftRight class="icon" :size="18" />
          {{ isImporting ? '处理中...' : '导出/导入' }}
          <ChevronDown class="icon dropdown-arrow" :size="14" :class="{ rotated: showExportMenu }" />
        </a>
        <transition name="submenu-slide">
          <div v-if="showExportMenu" class="dropdown-submenu-inline">
            <a href="#" class="submenu-item" @click.prevent="exportZip">📦 导出为 ZIP 包</a>
            <a href="#" class="submenu-item" @click.prevent="exportFlomo">📝 导出为 Flomo 格式</a>
            <div class="submenu-divider"></div>
            <a href="#" class="submenu-item" @click.prevent="triggerZipImport">📦 导入 ZIP 包</a>
            <a href="#" class="submenu-item" @click.prevent="triggerFlomoImport">📝 导入 Flomo 笔记</a>
          </div>
        </transition>
      </div>
      <a href="#" class="nav-item" :class="{ active: currentView === 'trash' }" @click.prevent="openTrash">
        <Trash2 class="icon" :size="18" /> 回收站
        <span v-if="trashNotes.length" class="trash-count">{{ trashNotes.length }}</span>
      </a>
    </nav>
    
    <!-- Hidden file inputs for imports -->
    <input type="file" ref="flomoFileInput" accept=".zip" style="display: none" @change="handleFlomoImport" />
    <input type="file" ref="zipFileInput" accept=".zip" style="display: none" @change="handleZipImport" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { 
  LayoutGrid, Dices, Trash2, ArrowLeftRight, ChevronDown, Sun, Moon 
} from 'lucide-vue-next';
import { currentView, setView, isDarkMode, toggleTheme } from '../../store/ui';
import { trashNotes, fetchTrash, fetchNotes } from '../../store/notes';
import { useImportExport } from '../../composables/useImportExport';

const showExportMenu = ref(false);

const {
  isImporting,
  exportZip,
  exportFlomo,
  triggerZipImport,
  handleZipImport,
  triggerFlomoImport,
  handleFlomoImport
} = useImportExport(() => {
  // 导入成功后的回调刷新
  fetchNotes();
});

const openTrash = async () => {
  setView('trash');
  await fetchTrash();
};
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

/* Theme Toggle */
.theme-toggle {
  display: flex; align-items: center; padding: 10px 12px;
  color: var(--text-secondary); cursor: pointer;
  border-radius: var(--radius-md); transition: all 0.15s ease;
  margin-bottom: 4px; border-top: 1px dashed var(--border-color); padding-top: 14px; margin-top: 8px;
}
.theme-toggle:hover { background-color: var(--border-color); color: var(--text-primary); }
.theme-toggle .icon { color: var(--text-secondary); }
.theme-toggle:hover .icon { color: var(--text-primary); }

/* Dropdown Inline Submenu */
.nav-item-dropdown { position: relative; }
.nav-item-dropdown > .nav-item { justify-content: flex-start; }
.dropdown-arrow { margin-left: auto; transition: transform 0.25s ease; }
.dropdown-arrow.rotated { transform: rotate(180deg); }
.dropdown-submenu-inline {
  display: flex; flex-direction: column; padding: 4px 0 4px 28px; overflow: hidden;
}
.submenu-item {
  display: block; padding: 6px 12px; font-size: 0.85rem; color: var(--text-secondary);
  text-decoration: none; white-space: nowrap; border-radius: var(--radius-sm); transition: all 0.15s;
}
.submenu-item:hover { background: var(--accent-sidebar-bg); color: var(--accent-color); }
.submenu-divider { height: 1px; background: var(--border-color); margin: 3px 12px; }

/* Slide transition */
.submenu-slide-enter-active, .submenu-slide-leave-active {
  transition: max-height 0.25s ease, opacity 0.2s ease; max-height: 200px; opacity: 1;
}
.submenu-slide-enter-from, .submenu-slide-leave-to { max-height: 0; opacity: 0; }

.bottom-menu { margin-top: auto; margin-bottom: 0; }
.trash-count { 
  background: #ef4444; color: white; font-size: 0.65rem; 
  padding: 1px 6px; border-radius: 10px; margin-left: auto;
}
</style>
