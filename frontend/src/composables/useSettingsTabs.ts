import { ref, watch, type Component } from 'vue';
import { Cloud, Paperclip, Download, PenTool, Keyboard, Bot, Palette, ShieldAlert } from 'lucide-vue-next';

import { settings } from '../store/settings';
import { saveSettings } from '../services/localSettings';

export type SettingsTabId =
  | 'sync'
  | 'conflicts'
  | 'appearance'
  | 'attachments'
  | 'import-export'
  | 'editor'
  | 'shortcuts'
  | 'ai';

export type SettingsTab = {
  id: SettingsTabId;
  label: string;
  icon: Component;
};

export const settingsTabs: SettingsTab[] = [
  { id: 'sync', label: '同步', icon: Cloud },
  { id: 'conflicts', label: '冲突处理', icon: ShieldAlert },
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'attachments', label: '附件', icon: Paperclip },
  { id: 'import-export', label: '导入导出', icon: Download },
  { id: 'editor', label: '编辑器', icon: PenTool },
  { id: 'shortcuts', label: '快捷键', icon: Keyboard },
  { id: 'ai', label: 'AI', icon: Bot },
];

export function useSettingsTabs() {
  const activeTab = ref<SettingsTabId>('sync');

  watch(activeTab, (tab) => {
    if (tab === 'import-export') {
      settings.importExport.lastSection = 'export';
      saveSettings();
    }
  });

  return {
    activeTab,
    tabs: settingsTabs,
  };
}
