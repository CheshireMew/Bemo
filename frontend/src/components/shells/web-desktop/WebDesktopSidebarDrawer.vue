<template>
  <teleport to="body">
    <div v-if="open" class="sidebar-overlay" @click.self="emit('close')">
      <aside class="sidebar sidebar-drawer surface-scroll">
        <SidebarContent show-close @close="emit('close')" @navigate="emit('close')" />
      </aside>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SidebarContent from '../shared/SidebarContent.vue';
import { useScrollLock } from '../../../composables/useScrollLock';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

useScrollLock(computed(() => props.open));
</script>

<style scoped>
.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.36);
  z-index: 220;
  display: flex;
}

.sidebar {
  background-color: var(--bg-sidebar);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 100dvh;
  max-height: 100dvh;
}

.sidebar-drawer {
  width: min(88vw, 360px);
  padding: calc(24px + var(--safe-top)) 16px 24px;
  background: var(--bg-main);
  border-right: 1px solid var(--border-color);
  box-shadow: 24px 0 48px rgba(15, 23, 42, 0.16);
}
</style>
