<template>
  <div id="app" class="flomo-layout app-shell mobile-shell">
    <MobileSidebarDrawer :open="isSidebarOpen" @close="closeSidebar" />

    <main class="main-content">
      <div class="mobile-header-stack">
        <MobileTopbar
          @openSidebar="openSidebar"
          @openSettings="openMobileSettings"
        />
      </div>

      <AppFeedContent />
    </main>

    <MobileBottomNav @compose="openMobileCompose" />
    <MobileComposeSheet
      :open="isMobileComposeOpen"
      @close="closeMobileCompose"
      @saved="handleComposeSaved"
    />
    <MobileSettingsPanel
      :open="isMobileSettingsOpen"
      @close="closeMobileSettings"
      @notesImported="onNoteSaved"
    />
    <AiChatModal />
    <AppImagePreviewOverlay />
    <AppNotifications />
  </div>
</template>

<script setup lang="ts">
import AiChatModal from '../AiChatModal.vue';
import AppNotifications from '../AppNotifications.vue';
import AppImagePreviewOverlay from '../media/AppImagePreviewOverlay.vue';
import AppFeedContent from './shared/AppFeedContent.vue';
import { useAppBootstrap } from '../../composables/useAppBootstrap';
import MobileBottomNav from './mobile/MobileBottomNav.vue';
import MobileComposeSheet from './mobile/MobileComposeSheet.vue';
import MobileSettingsPanel from './mobile/MobileSettingsPanel.vue';
import MobileSidebarDrawer from './mobile/MobileSidebarDrawer.vue';
import MobileTopbar from './mobile/MobileTopbar.vue';
import {
  closeMobileCompose,
  closeMobileSettings,
  closeSidebar,
  isMobileComposeOpen,
  isMobileSettingsOpen,
  isSidebarOpen,
  openMobileCompose,
  openMobileSettings,
  openSidebar,
} from '../../store/ui';

const { onNoteSaved } = useAppBootstrap();

const handleComposeSaved = () => {
  closeMobileCompose();
  onNoteSaved();
};
</script>

<style scoped>
.mobile-shell {
  position: relative;
  width: 100%;
  height: 100dvh;
  min-height: 100dvh;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  position: relative;
  padding: 0;
}

.mobile-header-stack {
  flex-shrink: 0;
  width: 100%;
  max-width: none;
  background: var(--bg-main);
}
</style>
