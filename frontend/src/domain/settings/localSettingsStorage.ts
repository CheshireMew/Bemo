import { defaultSettings } from './defaultSettings';
import { settings } from './settingsState';
import type { AppSettings } from './settingsTypes';

const SETTINGS_STORAGE_KEY = 'bemo.settings';

type LocalSettings = Pick<AppSettings, 'importExport' | 'aiPrompts' | 'editor' | 'sync' | 'ai'>;

function normalizePromptPreset(item: unknown) {
  if (typeof item === 'string') {
    const trimmed = item.trim();
    return trimmed ? { id: `preset-${trimmed.slice(0, 12)}-${Date.now()}`, content: trimmed } : null;
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
    return trimmed ? { id: item.id, content: trimmed } : null;
  }

  return null;
}

export function mergeLocalSettings(partial?: Partial<LocalSettings> | null): LocalSettings {
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
        const normalized = normalizePromptPreset(item);
        return normalized ? [normalized] : [];
      }),
    },
    editor: {
      ...defaultSettings.editor,
      ...(partial?.editor ?? {}),
    },
    ai: {
      ...defaultSettings.ai,
      ...(partial?.ai ?? {}),
      apiKey: partial?.ai?.apiKey ?? defaultSettings.ai.apiKey,
      hasApiKey: Boolean(partial?.ai?.apiKey ?? defaultSettings.ai.apiKey),
      maskedApiKey: partial?.ai?.apiKey ? maskApiKey(partial.ai.apiKey) : '',
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
  } catch (error) {
    console.warn('Failed to load local settings, using defaults.', error);
    Object.assign(settings, mergeLocalSettings());
  }
}

export function saveLocalSettings() {
  const payload: LocalSettings = {
    importExport: { ...settings.importExport },
    aiPrompts: {
      presets: settings.aiPrompts.presets.map((item) => ({ ...item })),
    },
    editor: { ...settings.editor },
    ai: {
      ...settings.ai,
      maskedApiKey: '',
      hasApiKey: Boolean(settings.ai.apiKey),
    },
    sync: { ...settings.sync },
  };
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
}

function maskApiKey(value: string) {
  if (!value) return '';
  if (value.length <= 8) return '********';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
