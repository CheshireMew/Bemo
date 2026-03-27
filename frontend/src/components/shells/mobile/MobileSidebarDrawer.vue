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
import { useMobileBackHandler } from '../../../composables/useMobileBackHandler';
import { useScrollLock } from '../../../composables/useScrollLock';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

useScrollLock(computed(() => props.open));
useMobileBackHandler({
  id: 'mobile-sidebar-drawer',
  priority: 640,
  enabled: computed(() => props.open),
  dismiss: () => {
    emit('close');
  },
});
</script>

<style scoped>
.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.42);
  z-index: 260;
  display: flex;
}

.sidebar {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 100dvh;
  max-height: 100dvh;
}

.sidebar-drawer {
  width: 100vw;
  padding: calc(22px + var(--safe-top)) 16px calc(20px + var(--safe-bottom));
  background: var(--bg-main);
  box-shadow: none;
}
</style>
