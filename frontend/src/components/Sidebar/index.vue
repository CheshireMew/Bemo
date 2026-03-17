<template>
  <teleport v-if="drawer" to="body">
    <div v-if="open" class="sidebar-overlay" @click.self="emit('close')">
      <aside class="sidebar sidebar-drawer surface-scroll">
        <UserProfile :show-close="true" @close="emit('close')" />
        <MiniCalendar />
        <Heatmap />
        <NavMenu @navigate="emit('close')">
          <template #taglist>
            <TagList />
          </template>
        </NavMenu>
      </aside>
    </div>
  </teleport>
  <aside v-else class="sidebar surface-scroll">
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
import { computed } from 'vue';
import { useScrollLock } from '../../composables/useScrollLock';

const props = withDefaults(defineProps<{
  drawer?: boolean;
  open?: boolean;
}>(), {
  drawer: false,
  open: false,
});

const emit = defineEmits<{
  close: [];
}>();

useScrollLock(computed(() => props.drawer && props.open));
</script>

<style scoped>
.sidebar {
  width: 280px;
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

.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.36);
  z-index: 220;
  display: flex;
}

.sidebar-drawer {
  width: min(88vw, 360px);
  min-height: 100dvh;
  background: var(--bg-main);
  border-right: 1px solid var(--border-color);
  box-shadow: 24px 0 48px rgba(15, 23, 42, 0.16);
}

@media (max-width: 1023px) {
  .sidebar {
    width: 232px;
    padding-left: 16px;
    padding-right: 16px;
  }
}
</style>
