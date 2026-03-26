<template>
  <teleport to="body">
    <div v-if="open" class="settings-overlay" @click.self="emit('close')">
      <section class="settings-panel" role="dialog" aria-modal="true" aria-label="设置">
        <header class="settings-header">
          <div>
            <h2>设置</h2>
            <p>管理导入导出、编辑器与 AI 配置。</p>
          </div>
          <button class="close-btn" type="button" @click="emit('close')">关闭</button>
        </header>

        <div class="settings-body">
          <SettingsTabNav v-model:activeTab="activeTab" :tabs="tabs" layout="sidebar" />
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
  background: linear-gradient(135deg, color-mix(in srgb, var(--bg-main) 88%, rgba(255, 255, 255, 0.22)) 0%, rgba(255, 255, 255, 0.62) 100%);
  backdrop-filter: blur(18px);
  z-index: 400;
  display: flex;
  justify-content: center;
  align-items: stretch;
  padding: max(12px, var(--safe-top)) max(12px, var(--safe-right)) max(12px, var(--safe-bottom)) max(12px, var(--safe-left));
}

.settings-panel {
  width: min(1060px, calc(100vw - 40px - var(--safe-left) - var(--safe-right)));
  height: calc(100dvh - 28px - var(--safe-top) - var(--safe-bottom));
  background: var(--bg-main);
  display: flex;
  flex-direction: column;
  border-radius: 28px;
  border: 1px solid color-mix(in srgb, var(--border-color, #e4e4e7) 88%, white);
  box-shadow: 0 30px 80px rgba(15, 23, 42, 0.12);
  overflow: hidden;
  transform: translateX(-60px);
}

.settings-header {
  padding: 28px 28px 20px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  border-bottom: 1px solid var(--border-color, #e4e4e7);
  background: linear-gradient(180deg, color-mix(in srgb, var(--bg-main) 94%, #eefbf3) 0%, var(--bg-main) 100%);
}

.settings-header h2 {
  margin: 0;
  color: var(--text-primary, #18181b);
}

.settings-header p {
  margin: 6px 0 0;
  color: var(--text-secondary, #71717a);
  font-size: 0.92rem;
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
  border-color: color-mix(in srgb, var(--accent-color, #31d279) 25%, var(--border-color, #e4e4e7));
}

.settings-body {
  min-height: 0;
  display: flex;
  flex: 1;
  overflow: hidden;
}
</style>
