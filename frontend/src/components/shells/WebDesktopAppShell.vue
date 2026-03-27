<template>
  <div id="app" class="flomo-layout app-shell web-desktop-shell">
    <WebDesktopSidebar v-if="!isCompactShell" />
    <WebDesktopSidebarDrawer v-else :open="isSidebarOpen" @close="isSidebarOpen = false" />

    <main class="main-content">
      <div class="sticky-stack">
        <WebDesktopTopbar
          :show-sidebar-toggle="isCompactShell"
          @openSidebar="isSidebarOpen = true"
          @openSettings="isSettingsOpen = true"
        />
        <WebDesktopComposerShell
          v-if="currentView !== 'trash' && currentView !== 'random'"
          @saved="onNoteSaved"
        />
      </div>

      <AppFeedContent />
    </main>

    <WebDesktopSettingsPanel
      :open="isSettingsOpen"
      @close="isSettingsOpen = false"
      @notesImported="onNoteSaved"
    />
    <AiChatModal />
    <AppImagePreviewOverlay />
    <AppNotifications />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import AiChatModal from '../AiChatModal.vue';
import AppNotifications from '../AppNotifications.vue';
import AppImagePreviewOverlay from '../media/AppImagePreviewOverlay.vue';
import AppFeedContent from './shared/AppFeedContent.vue';
import { currentView } from '../../store/ui';
import { useViewport } from '../../composables/useViewport';
import { useAppBootstrap } from '../../composables/useAppBootstrap';
import WebDesktopComposerShell from './web-desktop/WebDesktopComposerShell.vue';
import WebDesktopSettingsPanel from './web-desktop/WebDesktopSettingsPanel.vue';
import WebDesktopSidebar from './web-desktop/WebDesktopSidebar.vue';
import WebDesktopSidebarDrawer from './web-desktop/WebDesktopSidebarDrawer.vue';
import WebDesktopTopbar from './web-desktop/WebDesktopTopbar.vue';

const isSettingsOpen = ref(false);
const isSidebarOpen = ref(false);
const { isMobile, isTablet } = useViewport();
const { onNoteSaved } = useAppBootstrap();

const isCompactShell = computed(() => isMobile.value || isTablet.value);
</script>

<style scoped>
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

.sticky-stack {
  position: sticky;
  top: 0;
  z-index: 10;
  width: 100%;
  max-width: var(--layout-content-width);
  background: var(--bg-main);
}

@media (max-width: 1023px) {
  .main-content {
    padding-left: 0;
  }

  .sticky-stack {
    max-width: var(--layout-content-width-compact);
  }
}

@media (max-width: 767px) {
  .main-content {
    min-height: auto;
    padding: 0;
  }

  .sticky-stack {
    position: static;
    max-width: none;
  }
}
</style>
