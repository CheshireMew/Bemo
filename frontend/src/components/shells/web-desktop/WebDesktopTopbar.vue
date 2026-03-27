<template>
  <header class="topbar desktop-topbar">
    <ShellTopbarControls
      :show-sidebar-toggle="showSidebarToggle"
      @openSidebar="emit('openSidebar')"
      @openSettings="emit('openSettings')"
    />
  </header>
</template>

<script setup lang="ts">
import ShellTopbarControls from '../shared/ShellTopbarControls.vue';

withDefaults(defineProps<{
  showSidebarToggle?: boolean;
}>(), {
  showSidebarToggle: false,
});

const emit = defineEmits<{
  openSettings: [];
  openSidebar: [];
}>();
</script>

<style scoped>
.topbar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  max-width: var(--layout-content-width);
  padding: calc(20px + var(--safe-top)) 0 18px 0;
  margin: 0;
  background: color-mix(in srgb, var(--bg-main) 88%, transparent);
  backdrop-filter: blur(16px);
  gap: 10px;
}

@media (max-width: 1023px) {
  .topbar {
    max-width: var(--layout-content-width-compact);
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
}
</style>
