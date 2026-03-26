<template>
  <teleport to="body">
    <div v-if="open" class="settings-overlay" @click.self="emit('close')">
      <section class="settings-panel" role="dialog" aria-modal="true" aria-label="设置">
        <header class="settings-header">
          <div>
            <h2>设置</h2>
            <p>移动端入口先独立，内容仍复用同一套设置 section。</p>
          </div>
          <button class="close-btn" type="button" @click="emit('close')">关闭</button>
        </header>

        <div class="settings-body">
          <SettingsTabNav v-model:activeTab="activeTab" :tabs="tabs" layout="mobile-tabs" />
          <SettingsSectionOutlet :active-tab="activeTab" @notesImported="emit('notesImported')" />
        </div>
      </section>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SettingsSectionOutlet from '../../settings/SettingsSectionOutlet.vue';
import SettingsTabNav from '../../settings/SettingsTabNav.vue';
import { useSettingsTabs } from '../../../composables/useSettingsTabs';
import { useScrollLock } from '../../../composables/useScrollLock';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  notesImported: [];
}>();

const { activeTab, tabs } = useSettingsTabs();
useScrollLock(computed(() => props.open));
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, var(--bg-main) 78%, rgba(15, 23, 42, 0.32));
  backdrop-filter: blur(18px);
  z-index: 420;
  display: flex;
  justify-content: center;
  align-items: stretch;
  padding: 0;
}

.settings-panel {
  width: 100vw;
  height: 100dvh;
  background: var(--bg-main);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-header {
  padding: calc(16px + var(--safe-top)) 16px 14px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  border-bottom: 1px solid var(--border-color, #e4e4e7);
  background: color-mix(in srgb, var(--bg-main) 92%, transparent);
  backdrop-filter: blur(14px);
}

.settings-header h2 {
  margin: 0;
  color: var(--text-primary, #18181b);
}

.settings-header p {
  margin: 6px 0 0;
  color: var(--text-secondary, #71717a);
  font-size: 0.9rem;
  line-height: 1.5;
}

.close-btn {
  align-self: flex-start;
  padding: 10px 14px;
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: 999px;
  background: transparent;
  color: var(--text-primary, #18181b);
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: var(--bg-card);
}

.settings-body {
  min-height: 0;
  display: flex;
  flex: 1;
  overflow: hidden;
  flex-direction: column;
}
</style>
