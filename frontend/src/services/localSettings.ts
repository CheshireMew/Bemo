import { defaultSettings, settings } from '../store/settings';
import type { AppSettings } from '../store/settingsTypes';

const SETTINGS_STORAGE_KEY = 'bemo.settings';

type LocalSettings = Pick<AppSettings, 'importExport' | 'aiPrompts' | 'editor' | 'sync'>;

function mergeLocalSettings(partial?: Partial<LocalSettings> | null): LocalSettings {
  const rawPresets = Array.isArray((partial as { aiPrompts?: { presets?: unknown[] } } | null)?.aiPrompts?.presets)
    ? ((partial as { aiPrompts?: { presets?: unknown[] } }).aiPrompts?.presets ?? [])
    : [];

  return {
    importExport: {
      ...defaultSettings.importExport,
      ...(partial?.importExport ?? {}),
    },
    aiPrompts: {
      ...defaultSettings.aiPrompts,
      ...(partial?.aiPrompts ?? {}),
      presets: rawPresets.flatMap((item) => {
        if (typeof item === 'string') {
          const trimmed = item.trim();
          return trimmed ? [{ id: `preset-${trimmed.slice(0, 12)}-${Date.now()}`, content: trimmed }] : [];
        }
        if (
          item &&
          typeof item === 'object' &&
          'id' in item &&
          'content' in item &&
          typeof item.id === 'string' &&
          typeof item.content === 'string'
        ) {
          const trimmed = item.content.trim();
          return trimmed ? [{ id: item.id, content: trimmed }] : [];
        }
        return [];
      }),
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

export function initSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<LocalSettings> : null;
    Object.assign(settings, {
      ...settings,
      ...mergeLocalSettings(parsed),
    });
  } catch (error) {
    console.warn('Failed to load local settings, using defaults.', error);
    Object.assign(settings, {
      ...settings,
      ...mergeLocalSettings(),
    });
  }
}

export function saveSettings() {
  const payload: LocalSettings = {
    importExport: { ...settings.importExport },
    aiPrompts: {
      presets: settings.aiPrompts.presets.map((item) => ({ ...item })),
    },
    editor: { ...settings.editor },
    sync: { ...settings.sync },
  };
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
}
