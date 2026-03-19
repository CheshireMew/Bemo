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
              <component :is="tab.icon" class="tab-icon" :size="18" />
              <span class="tab-label">{{ tab.label }}</span>
            </button>
          </aside>

          <div class="settings-content">
            <SettingsSyncSection v-if="activeTab === 'sync'" />

            <SettingsAppearanceSection v-else-if="activeTab === 'appearance'" />

            <SettingsAttachmentsSection v-else-if="activeTab === 'attachments'" />

            <SettingsImportExportSection v-else-if="activeTab === 'import-export'" @imported="emit('notesImported')" />

            <SettingsEditorSection v-else-if="activeTab === 'editor'" />

            <SettingsShortcutsSection v-else-if="activeTab === 'shortcuts'" />

            <SettingsAiSection v-else-if="activeTab === 'ai'" />

            <SettingsConflictsSection v-else />
          </div>
        </div>
      </section>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Cloud, Paperclip, Download, PenTool, Keyboard, Bot, Palette, ShieldAlert } from 'lucide-vue-next';
import SettingsAppearanceSection from './SettingsAppearanceSection.vue';
import SettingsAiSection from './SettingsAiSection.vue';
import SettingsAttachmentsSection from './SettingsAttachmentsSection.vue';
import SettingsEditorSection from './SettingsEditorSection.vue';
import SettingsImportExportSection from './SettingsImportExportSection.vue';
import SettingsShortcutsSection from './SettingsShortcutsSection.vue';
import SettingsSyncSection from './SettingsSyncSection.vue';
import SettingsConflictsSection from './SettingsConflictsSection.vue';
import { settings } from '../store/settings';
import { saveSettings } from '../services/localSettings';
import { useScrollLock } from '../composables/useScrollLock';

type TabId = 'sync' | 'conflicts' | 'appearance' | 'attachments' | 'import-export' | 'editor' | 'shortcuts' | 'ai';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  notesImported: [];
}>();

const tabs: Array<{ id: TabId; label: string; icon: any }> = [
  { id: 'sync', label: '同步', icon: Cloud },
  { id: 'conflicts', label: '冲突处理', icon: ShieldAlert },
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'attachments', label: '附件', icon: Paperclip },
  { id: 'import-export', label: '导入导出', icon: Download },
  { id: 'editor', label: '编辑器', icon: PenTool },
  { id: 'shortcuts', label: '快捷键', icon: Keyboard },
  { id: 'ai', label: 'AI', icon: Bot },
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
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--bg-main) 88%, rgba(255, 255, 255, 0.22)) 0%, rgba(255, 255, 255, 0.62) 100%);
  backdrop-filter: blur(18px);
  z-index: 400;
  display: flex;
  justify-content: center;
  align-items: stretch;
  padding:
    max(12px, var(--safe-top))
    max(12px, var(--safe-right))
    max(12px, var(--safe-bottom))
    max(12px, var(--safe-left));
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
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bg-main) 94%, #eefbf3) 0%, var(--bg-main) 100%);
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
  padding: 10px 14px;
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: 999px;
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

.tab-btn {
  width: 100%;
  text-align: left;
  padding: 10px 14px;
  border: 1px solid transparent;
  border-radius: var(--radius-md, 0.5rem);
  background: transparent;
  color: var(--text-secondary, #888888);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  font-size: 0.95rem;
  font-weight: 500;
  line-height: 1.45;
}

.tab-btn.active {
  background: var(--accent-color, #31d279);
  color: white;
  font-weight: 600;
}

.tab-btn:hover:not(.active) {
  background: var(--border-color, #eaeaea);
  color: var(--text-primary, #333333);
}

.tab-label {
  display: inline-block;
}

.tab-icon {
  flex-shrink: 0;
  opacity: 0.8;
}

.tab-btn.active .tab-icon {
  color: white;
  opacity: 1;
}

.settings-nav {
  width: 280px;
  flex-shrink: 0;
  padding: 24px 20px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: color-mix(in srgb, var(--bg-main) 86%, #f2fbf6);
}

.settings-content {
  min-width: 0;
  padding: 24px 24px 32px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
  flex: 1;
  border-left: 1px solid var(--border-color, #eaeaea);
  scrollbar-width: none;
}

.settings-content::-webkit-scrollbar {
  display: none;
}



@media (max-width: 767px) {
  .settings-overlay {
    padding: 0;
  }

  .settings-panel {
    width: 100vw;
    height: 100dvh;
    transform: none;
    border-radius: 0;
    border: none;
    box-shadow: none;
  }

  .settings-header {
    padding: calc(16px + var(--safe-top)) 16px 14px;
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



  .tab-btn {
    width: auto;
    white-space: nowrap;
    flex-shrink: 0;
  }
}
</style>
