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
          <aside class="settings-nav" aria-label="设置分组">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              type="button"
              class="tab-btn"
              :class="{ active: activeTab === tab.id }"
              @click="activeTab = tab.id"
            >
              <span class="tab-label">{{ tab.label }}</span>
            </button>
          </aside>

          <div class="settings-content">
            <SettingsSyncSection v-if="activeTab === 'sync'" />

            <SettingsImportExportSection v-else-if="activeTab === 'import-export'" @imported="emit('notesImported')" />

            <SettingsEditorSection v-else-if="activeTab === 'editor'" />

            <SettingsShortcutsSection v-else-if="activeTab === 'shortcuts'" />

            <SettingsAiSection v-else />
          </div>
        </div>
      </section>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import SettingsAiSection from './SettingsAiSection.vue';
import SettingsEditorSection from './SettingsEditorSection.vue';
import SettingsImportExportSection from './SettingsImportExportSection.vue';
import SettingsShortcutsSection from './SettingsShortcutsSection.vue';
import SettingsSyncSection from './SettingsSyncSection.vue';
import { settings } from '../store/settings';
import { saveSettings } from '../services/localSettings';
import { useScrollLock } from '../composables/useScrollLock';

type TabId = 'sync' | 'import-export' | 'editor' | 'shortcuts' | 'ai';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  notesImported: [];
}>();

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'sync', label: '同步' },
  { id: 'import-export', label: '导入导出' },
  { id: 'editor', label: '编辑器' },
  { id: 'shortcuts', label: '快捷键说明' },
  { id: 'ai', label: 'AI' },
];

const activeTab = ref<TabId>('sync');

watch(activeTab, (tab) => {
  if (tab === 'import-export') {
    settings.importExport.lastSection = 'export';
    saveSettings();
  }
});

useScrollLock(computed(() => props.open));
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, var(--bg-main) 92%, rgba(15, 23, 42, 0.18));
  z-index: 200;
  display: flex;
  justify-content: center;
  padding: 0 max(20px, var(--safe-right)) 0 max(20px, var(--safe-left));
}

.settings-panel {
  width: min(980px, calc(100vw - 120px));
  height: 100dvh;
  background: var(--bg-main);
  display: flex;
  flex-direction: column;
}

.settings-header {
  padding: 32px 0 24px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.settings-header h2,
.section-header h3,
.settings-card h4 {
  margin: 0;
  color: var(--text-primary, #18181b);
}

.settings-header p,
.section-header p,
.settings-card p,
.field-hint {
  margin: 6px 0 0;
  color: var(--text-secondary, #71717a);
  font-size: 0.92rem;
  line-height: 1.5;
}

.close-btn,
.primary-btn,
.secondary-btn {
  border: none;
  border-radius: var(--radius-md, 0.5rem);
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn,
.tab-btn,
.secondary-btn {
  background: transparent;
  color: var(--text-primary, #18181b);
}

.close-btn {
  align-self: flex-start;
  padding: 6px;
}

.close-btn:hover {
  background: var(--bg-card);
}

.settings-body {
  min-height: 0;
  display: flex;
  flex: 1;
}

.tab-btn {
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-md, 0.5rem);
  background: transparent;
  color: var(--text-secondary, #888888);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  font-size: 0.95rem;
  font-weight: 500;
  line-height: 1.45;
}

.tab-btn.active {
  background: var(--accent-color, #31d279);
  color: white;
  font-weight: 600;
}

.tab-btn:hover {
  background: var(--border-color, #eaeaea);
  color: var(--text-primary, #333333);
}

.tab-label {
  display: inline-block;
}

.settings-nav {
  width: 220px;
  flex-shrink: 0;
  padding: 0 20px 24px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-content {
  padding: 0 0 32px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  border-left: 1px solid var(--border-color, #eaeaea);
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-header,
.toggle-row,
.field-row,
.shortcut-list div,
.button-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.section-badge {
  background: var(--accent-sidebar-bg, #e6f7ef);
  color: var(--accent-color, #31d279);
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  align-self: flex-start;
}

.card-grid {
  display: grid;
  gap: 16px;
}

.card-grid.two-up {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.settings-card {
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: var(--radius-lg, 0.75rem);
  padding: 18px;
}

.form-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.toggle-row,
.field-row {
  align-items: center;
}

.field-row {
  flex-wrap: wrap;
}

.field-row-top {
  align-items: flex-start;
}

.field-label {
  display: block;
  font-weight: 600;
  color: var(--text-primary, #18181b);
}

.field-input,
.field-row input,
.field-row select {
  min-width: 220px;
}

.field-input-stack {
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field-row input,
.field-row select {
  border: 1px solid var(--border-color, #d4d4d8);
  background: var(--bg-card, #fff);
  color: var(--text-primary, #18181b);
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
}

.field-row input:focus,
.field-row select:focus {
  outline: 2px solid color-mix(in srgb, var(--accent-color, #31d279) 20%, transparent);
  border-color: var(--accent-color, #31d279);
}

.system-prompt-input {
  width: min(460px, 100%);
  min-height: 110px;
  border: 1px solid var(--border-color, #d4d4d8);
  background: var(--bg-card, #fff);
  color: var(--text-primary, #18181b);
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
  line-height: 1.6;
  resize: vertical;
}

.system-prompt-input:focus {
  outline: 2px solid color-mix(in srgb, var(--accent-color, #31d279) 20%, transparent);
  border-color: var(--accent-color, #31d279);
}

.ai-hint {
  margin-top: -4px;
}

.ai-warning {
  margin-top: -10px;
  color: #b45309;
}

.with-suffix {
  display: flex;
  align-items: center;
  gap: 10px;
}

.with-suffix input {
  width: 88px;
  min-width: 88px;
}

.button-row {
  margin-top: 16px;
  justify-content: flex-start;
  flex-wrap: wrap;
}

.primary-btn,
.secondary-btn {
  padding: 10px 14px;
  font-weight: 600;
}

.primary-btn {
  background: var(--accent-color, #31d279);
  color: #fff;
}

.secondary-btn {
  background: var(--bg-main, #f4f5f7);
}

.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}

.shortcut-list div {
  align-items: center;
}

kbd {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-color, #d4d4d8);
  border-bottom-width: 2px;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.85rem;
}

@media (max-width: 767px) {
  .settings-overlay {
    padding: 0;
  }

  .settings-panel {
    width: 100vw;
    height: 100dvh;
  }

  .settings-header {
    padding: calc(16px + var(--safe-top)) 16px 14px;
    border-bottom: 1px solid var(--border-color, #e4e4e7);
    background: color-mix(in srgb, var(--bg-main) 92%, transparent);
    backdrop-filter: blur(14px);
  }

  .settings-body {
    flex-direction: column;
  }

  .settings-nav {
    width: auto;
    border-right: none;
    border-bottom: 1px solid var(--border-color, #e4e4e7);
    padding: 12px 16px;
    overflow-x: auto;
    flex-direction: row;
    gap: 8px;
  }

  .settings-content {
    border-left: none;
    padding: 18px 16px calc(24px + var(--safe-bottom));
  }

  .card-grid.two-up {
    grid-template-columns: 1fr;
  }

  .toggle-row,
  .field-row,
  .shortcut-list div {
    flex-direction: column;
    align-items: flex-start;
  }

  .field-row input,
  .field-row select,
  .field-input {
    width: 100%;
  }

  .tab-btn {
    width: auto;
    white-space: nowrap;
    flex-shrink: 0;
  }
}
</style>
