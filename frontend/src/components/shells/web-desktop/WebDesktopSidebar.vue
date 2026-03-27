<template>
  <aside class="sidebar surface-scroll">
    <SidebarContent />
  </aside>
</template>

<script setup lang="ts">
import SidebarContent from '../shared/SidebarContent.vue';
</script>

<style scoped>
.sidebar {
  width: var(--layout-sidebar-width);
  background-color: var(--bg-sidebar);
  display: flex;
  flex-direction: column;
  padding: calc(28px + var(--safe-top)) 20px 24px;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 100dvh;
  max-height: 100dvh;
  position: sticky;
  top: 0;
  align-self: flex-start;
}

@media (max-width: 1023px) {
  .sidebar {
    width: 232px;
    padding-left: 16px;
    padding-right: 16px;
  }
}
</style>
