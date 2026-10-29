<template>
  <teleport to="body">
    <div v-if="open" class="settings-overlay" @click.self="emit('close')">
      <div class="settings-shell">
        <section v-modal-focus="() => emit('close')" class="settings-panel" role="dialog" aria-modal="true" aria-label="设置">
          <header class="settings-header">
            <div>
              <h2>设置</h2>
            </div>
            <button class="close-btn" type="button" @click="emit('close')">关闭</button>
          </header>

          <div class="settings-body">
            <SettingsTabNav v-model:activeTab="activeTab" :tabs="tabs" :layout="settingsNavLayout" />
            <SettingsSectionOutlet
              :active-tab="activeTab"
              @notesImported="emit('notesImported')"
            />
          </div>
        </section>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { vModalFocus } from '../../../directives/modalFocus';
import SettingsSectionOutlet from '../../settings/SettingsSectionOutlet.vue';
import SettingsTabNav from '../../settings/SettingsTabNav.vue';
import { useSettingsTabs } from '../../../composables/useSettingsTabs';
import { useScrollLock } from '../../../composables/useScrollLock';
import { useViewport } from '../../../composables/useViewport';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  notesImported: [];
}>();

const { activeTab, tabs } = useSettingsTabs();
const { isMobile } = useViewport();
const settingsNavLayout = computed(() => (isMobile.value ? 'mobile-tabs' : 'sidebar'));
useScrollLock(computed(() => props.open));
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-color);
  z-index: 400;
  display: flex;
  justify-content: center;
  align-items: stretch;
  padding: max(12px, var(--safe-top)) 0 max(12px, var(--safe-bottom));
}

.settings-shell {
  width: min(100%, var(--layout-max-width));
  padding-left: max(var(--layout-shell-padding), var(--safe-left));
  padding-right: max(var(--layout-shell-padding), var(--safe-right));
  display: flex;
  justify-content: center;
  align-items: stretch;
  margin: 0 auto;
}

.settings-panel {
  width: min(100%, var(--layout-settings-width));
  height: 100%;
  min-height: 0;
  background: var(--bg-main);
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-dialog);
  overflow: hidden;
}

.settings-header {
  padding: 18px 24px;
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  border-bottom: 1px solid var(--border-color, #e4e4e7);
  background: var(--bg-card);
}

.settings-header h2 {
  margin: 0;
  color: var(--text-primary, #18181b);
  font-size: 1.25rem;
  font-weight: 650;
}

.close-btn {
  min-height: 40px;
  padding: 10px 14px;
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-primary, #18181b);
  cursor: pointer;
  font-size: var(--font-size-supporting);
  transition: background-color 0.15s, border-color 0.15s;
}

.close-btn:hover {
  background: var(--bg-card);
  border-color: color-mix(in srgb, var(--accent-color, #31d279) 25%, var(--border-color, #e4e4e7));
}

.settings-body {
  min-height: 0;
  display: flex;
  flex: 1;
  overflow: hidden;
}

@media (max-width: 1023px) {
  .settings-shell {
    padding-left: max(var(--layout-shell-padding-compact), var(--safe-left));
    padding-right: max(var(--layout-shell-padding-compact), var(--safe-right));
    justify-content: center;
  }
}

@media (max-width: 767px) {
  .settings-overlay {
    padding: 0;
  }

  .settings-shell {
    padding: 0;
  }

  .settings-panel {
    width: 100vw;
    height: 100dvh;
    border: none;
    border-radius: 0;
  }

  .settings-header {
    padding: calc(16px + var(--safe-top)) 16px 14px;
  }

  .settings-body {
    flex-direction: column;
  }
}

</style>
