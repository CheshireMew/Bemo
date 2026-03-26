<template>
  <div id="app" class="flomo-layout">
    <Sidebar v-if="!isMobile" />
    <Sidebar
      v-else
      :drawer="true"
      :open="isSidebarOpen"
      @close="isSidebarOpen = false"
    />

    <main class="main-content">
      <div class="sticky-stack">
        <Topbar
          :show-sidebar-toggle="isMobile"
          @openSidebar="isSidebarOpen = true"
          @openSettings="isSettingsOpen = true"
        />
        <div v-if="currentView !== 'trash' && currentView !== 'random'" class="editor-sticky-shell">
          <Editor draft-key="compose" @saved="onNoteSaved" />
        </div>
      </div>

      <div class="feed-container">
        <TrashView v-if="currentView === 'trash'" />
        <RandomWalk v-else-if="currentView === 'random'" />
        <NotesFeed v-else />
      </div>
    </main>

    <SettingsPanel
      :open="isSettingsOpen"
      @close="isSettingsOpen = false"
      @notesImported="onNoteSaved"
    />
    <AppNotifications />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

// 导入全局样式
import './styles/base.css';
import './styles/markdown.css';

// 导入共有的组件
import AppNotifications from './components/AppNotifications.vue';
import Editor from './components/Editor.vue';
import Sidebar from './components/Sidebar/index.vue';
import Topbar from './components/MainFeed/Topbar.vue';
import TrashView from './components/MainFeed/TrashView.vue';
import RandomWalk from './components/MainFeed/RandomWalk.vue';
import NotesFeed from './components/MainFeed/NotesFeed.vue';
import SettingsPanel from './components/SettingsPanel.vue';

// 导入独立 Store
import { fetchNotes } from './store/notes';
import { currentView, initTheme } from './store/ui';
import { initSync } from './store/sync';
import { loadAiSettings } from './domain/ai/localAiSettings';
import { initSettings } from './services/localSettings';
import { useViewport } from './composables/useViewport';

const isSettingsOpen = ref(false);
const isSidebarOpen = ref(false);
const { isMobile } = useViewport();
initSettings();

// 生命周期处理
onMounted(() => {
  initTheme();
  initSync(() => {
    // 同步完成的回调
    fetchNotes();
  });
  // 初次加载笔记
  fetchNotes();
  loadAiSettings().catch((error) => {
    console.error('Failed to load AI settings.', error);
  });
});

const onNoteSaved = () => {
  // 编辑器保存后全局抓取列表
  fetchNotes();
};
</script>

<style scoped>
/* Main Content Styling */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 100dvh;
  overflow: visible;
  position: relative;
  padding: 0 0 0 4px;
}

.feed-container {
  width: 100%;
  max-width: 760px;
  padding: 0 0 calc(64px + var(--safe-bottom));
  margin: 0;
}

.sticky-stack {
  position: sticky;
  top: 0;
  z-index: 10;
  width: 100%;
  max-width: 760px;
  background: var(--bg-main);
}

.editor-sticky-shell {
  position: relative;
  z-index: 9;
  padding-bottom: 12px;
  background: var(--bg-main);
}

@media (max-width: 1023px) {
  .main-content {
    padding-left: 0;
  }

  .feed-container {
    max-width: 720px;
  }

  .sticky-stack {
    max-width: 720px;
  }
}

@media (max-width: 767px) {
  .main-content {
    min-height: auto;
    padding: 0;
  }

  .feed-container {
    max-width: none;
    padding-bottom: calc(40px + var(--safe-bottom));
  }

  .sticky-stack {
    position: static;
    max-width: none;
  }

  .editor-sticky-shell {
    position: static;
    padding-bottom: 0;
  }
}
</style>
