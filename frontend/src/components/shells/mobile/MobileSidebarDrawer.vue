<template>
  <teleport to="body">
    <Transition name="mobile-drawer">
      <div v-if="open" class="sidebar-overlay" @click.self="emit('close')">
        <aside
          v-modal-focus="() => emit('close')"
          class="sidebar sidebar-drawer surface-scroll"
          :class="{ 'is-touch-dragging': drawerDragging }"
          :style="drawerStyle"
          role="dialog"
          aria-modal="true"
          aria-label="导航"
          @pointerdown="handleDrawerPointerDown"
          @pointermove="handleDrawerPointerMove"
          @pointerup="handleDrawerPointerUp"
          @pointercancel="handleDrawerPointerCancel"
          @click.capture="handleDrawerClickCapture"
        >
          <SidebarContent show-close @close="emit('close')" @navigate="emit('close')" />
          <div class="drawer-edge-indicator" aria-hidden="true"></div>
        </aside>
      </div>
    </Transition>
  </teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { vModalFocus } from '../../../directives/modalFocus';
import SidebarContent from '../shared/SidebarContent.vue';
import { useMobileBackHandler } from '../../../composables/useMobileBackHandler';
import { useScrollLock } from '../../../composables/useScrollLock';
import { useTouchSwipe } from '../../../composables/useTouchSwipe';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const {
  offset: drawerOffset,
  dragging: drawerDragging,
  handlePointerDown: handleDrawerPointerDown,
  handlePointerMove: handleDrawerPointerMove,
  handlePointerUp: handleDrawerPointerUp,
  handlePointerCancel: handleDrawerPointerCancel,
  handleClickCapture: handleDrawerClickCapture,
} = useTouchSwipe({
  axis: 'x',
  enabled: computed(() => props.open),
  threshold: 72,
  maxDistance: 180,
  canStart: (event) => {
    const target = event.target;
    return !(target instanceof Element && target.closest(
      'input, textarea, select, audio, video, [contenteditable="true"]',
    ));
  },
  allowsDirection: (direction) => direction === 'negative',
  onSwipe: () => emit('close'),
});

const drawerStyle = computed(() => (
  drawerOffset.value < 0
    ? { transform: `translate3d(${drawerOffset.value}px, 0, 0)` }
    : undefined
));

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
  position: relative;
  width: min(88vw, 380px);
  padding: calc(22px + var(--safe-top)) 16px calc(20px + var(--safe-bottom)) max(16px, var(--safe-left));
  background: var(--bg-main);
  border-radius: 0 24px 24px 0;
  box-shadow: 18px 0 48px rgba(15, 23, 42, 0.18);
  touch-action: pan-y;
  transition: transform 0.22s ease;
  will-change: transform;
}

.sidebar-drawer.is-touch-dragging {
  transition: none;
}

.drawer-edge-indicator {
  position: absolute;
  top: 50%;
  right: 5px;
  width: 4px;
  height: 42px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-secondary) 28%, transparent);
  transform: translateY(-50%);
  pointer-events: none;
}

.mobile-drawer-enter-active,
.mobile-drawer-leave-active {
  transition: background-color 0.22s ease;
}

.mobile-drawer-enter-active .sidebar-drawer,
.mobile-drawer-leave-active .sidebar-drawer {
  transition: transform 0.22s ease;
}

.mobile-drawer-enter-from,
.mobile-drawer-leave-to {
  background: rgba(15, 23, 42, 0);
}

.mobile-drawer-enter-from .sidebar-drawer,
.mobile-drawer-leave-to .sidebar-drawer {
  transform: translate3d(-100%, 0, 0);
}
</style>
