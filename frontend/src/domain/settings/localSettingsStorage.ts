import { defaultSettings } from './defaultSettings';
import { settings } from './settingsState';
import type { AppSettings } from './settingsTypes';

const SETTINGS_STORAGE_KEY = 'bemo.settings';

type LocalSettings = Pick<AppSettings, 'importExport' | 'editor' | 'sync'>;

const REMOVED_FEATURE_STORAGE_KEYS = ['bemo.ai.conversations'];

export function mergeLocalSettings(partial?: Partial<LocalSettings> | null): LocalSettings {
  return {
    importExport: {
      ...defaultSettings.importExport,
      ...(partial?.importExport ?? {}),
    },
    editor: {
      ...defaultSettings.editor,
      ...(partial?.editor ?? {}),
    },
    sync: {
      ...defaultSettings.sync,
      ...(partial?.sync ?? {}),
    },
  };
}

export function initLocalSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<LocalSettings> : null;
    Object.assign(settings, mergeLocalSettings(parsed));
    REMOVED_FEATURE_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    saveLocalSettings();
  } catch (error) {
    console.warn('Failed to load local settings, using defaults.', error);
    Object.assign(settings, mergeLocalSettings());
  }
}

export function saveLocalSettings() {
  const payload: LocalSettings = {
    importExport: { ...settings.importExport },
    editor: { ...settings.editor },
    sync: { ...settings.sync },
  };
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
}
