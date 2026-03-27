import { ref, watch, type Component } from 'vue';
import { Cloud, Paperclip, Download, PenTool, Keyboard, Bot, Palette, ShieldAlert, Trash2 } from 'lucide-vue-next';

import { settings } from '../store/settings';
import { saveSettings } from '../services/localSettings';
import { canShowShortcutSettingsTab } from '../domain/runtime/platformCapabilities.js';

export type SettingsTabId =
  | 'sync'
  | 'conflicts'
  | 'appearance'
  | 'attachments'
  | 'import-export'
  | 'editor'
  | 'shortcuts'
  | 'ai'
  | 'trash';

export type SettingsTab = {
  id: SettingsTabId;
  label: string;
  icon: Component;
};

const allSettingsTabs: SettingsTab[] = [
  { id: 'sync', label: '同步', icon: Cloud },
  { id: 'conflicts', label: '冲突处理', icon: ShieldAlert },
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'attachments', label: '附件', icon: Paperclip },
  { id: 'import-export', label: '导入导出', icon: Download },
  { id: 'editor', label: '编辑器', icon: PenTool },
  { id: 'shortcuts', label: '快捷键', icon: Keyboard },
  { id: 'ai', label: 'AI', icon: Bot },
  { id: 'trash', label: '回收站', icon: Trash2 },
];

export function useSettingsTabs() {
  const activeTab = ref<SettingsTabId>('sync');
  const tabs = canShowShortcutSettingsTab()
    ? allSettingsTabs
    : allSettingsTabs.filter((tab) => tab.id !== 'shortcuts');

  watch(activeTab, (tab) => {
    if (tab === 'import-export') {
      settings.importExport.lastSection = 'export';
      saveSettings();
    }
  });

  return {
    activeTab,
    tabs,
  };
}
