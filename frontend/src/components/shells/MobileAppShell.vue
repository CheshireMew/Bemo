<template>
  <div id="app" class="flomo-layout app-shell mobile-shell">
    <MobileSidebarDrawer :open="isSidebarOpen" @close="isSidebarOpen = false" />

    <main class="main-content">
      <div class="mobile-header-stack">
        <MobileTopbar
          @openSidebar="isSidebarOpen = true"
          @openSettings="isSettingsOpen = true"
        />
        <MobileComposerShell
          v-if="currentView !== 'trash' && currentView !== 'random'"
          @saved="onNoteSaved"
        />
      </div>

      <AppFeedContent />
    </main>

    <MobileSettingsPanel
      :open="isSettingsOpen"
      @close="isSettingsOpen = false"
      @notesImported="onNoteSaved"
    />
    <AppNotifications />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import AppNotifications from '../AppNotifications.vue';
import AppFeedContent from './shared/AppFeedContent.vue';
import { currentView } from '../../store/ui';
import { useAppBootstrap } from '../../composables/useAppBootstrap';
import MobileComposerShell from './mobile/MobileComposerShell.vue';
import MobileSettingsPanel from './mobile/MobileSettingsPanel.vue';
import MobileSidebarDrawer from './mobile/MobileSidebarDrawer.vue';
import MobileTopbar from './mobile/MobileTopbar.vue';

const isSettingsOpen = ref(false);
const isSidebarOpen = ref(false);
const { onNoteSaved } = useAppBootstrap();
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
  padding: 0;
}

.mobile-header-stack {
  width: 100%;
  max-width: none;
  background: var(--bg-main);
}
</style>
