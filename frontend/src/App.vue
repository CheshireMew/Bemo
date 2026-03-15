<template>
  <div id="app" class="flomo-layout">
    <!-- Sidebar -->
    <Sidebar />

    <!-- Main Feed -->
    <main class="main-content">
      <Topbar />

      <div class="feed-container">
        <!-- Trash View -->
        <TrashView v-if="currentView === 'trash'" />

        <!-- Random Walk View -->
        <RandomWalk v-else-if="currentView === 'random'" />

        <!-- Normal View -->
        <template v-else>
          <Editor @saved="onNoteSaved" />
          <NotesFeed />
        </template>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';

// 导入全局样式
import './styles/base.css';
import './styles/markdown.css';

// 导入共有的组件
import Editor from './components/Editor.vue';
import Sidebar from './components/Sidebar/index.vue';
import Topbar from './components/MainFeed/Topbar.vue';
import TrashView from './components/MainFeed/TrashView.vue';
import RandomWalk from './components/MainFeed/RandomWalk.vue';
import NotesFeed from './components/MainFeed/NotesFeed.vue';

// 导入独立 Store
import { fetchNotes } from './store/notes';
import { currentView, initTheme } from './store/ui';
import { initSync } from './store/sync';

// 生命周期处理
onMounted(() => {
  initTheme();
  initSync(() => {
    // 同步完成的回调
    fetchNotes();
  });
  // 初次加载笔记
  fetchNotes();
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
  overflow-y: auto;
  position: relative;
  /* 给主内容区左侧加一点间距，使其脱离侧边栏 */
  padding-left: 20px;
  /* 隐藏主界面的垂直滚动条 */
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.main-content::-webkit-scrollbar { display: none; }

.feed-container {
  width: 100%; padding: 0 0 64px;
}

@media (max-width: 768px) {
  .main-content {
    padding-left: 0;
    padding: 16px;
  }
}
</style>
