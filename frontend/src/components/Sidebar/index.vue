<template>
  <aside class="sidebar">
    <UserProfile />
    <MiniCalendar />
    <Heatmap />
    <NavMenu>
      <template #taglist>
        <TagList />
      </template>
    </NavMenu>
  </aside>
  <AiChatModal />
</template>

<script setup lang="ts">
import AiChatModal from '../AiChatModal.vue';
import UserProfile from './UserProfile.vue';
import MiniCalendar from './MiniCalendar.vue';
import Heatmap from './Heatmap.vue';
import NavMenu from './NavMenu.vue';
import TagList from './TagList.vue';
</script>

<style scoped>
.sidebar {
  width: 300px;
  background-color: var(--bg-sidebar);
  display: flex;
  flex-direction: column;
  padding: 32px 20px;
  overflow-y: auto;
  overflow-x: hidden;
  /* 隐藏滚动条但保留滚动功能 */
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.sidebar::-webkit-scrollbar {
  display: none;
}
@media (max-width: 768px) {
  .sidebar {
    width: 100%;
    position: static;
    height: auto;
    padding: 16px;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }
}
</style>
