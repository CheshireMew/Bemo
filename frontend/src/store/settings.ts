import axios from 'axios';
import { reactive } from 'vue';
import { API_BASE } from '../config';

export type ImageCompressionMode = 'original' | 'balanced' | 'compact';
export type AiProvider = 'openai' | 'deepseek' | 'openai-compatible' | 'custom';
export type EditorMode = 'rich-text' | 'markdown';
export type CopyFormat = 'rich-text' | 'markdown';
export type AiPromptPreset = {
  id: string;
  content: string;
};

export interface AppSettings {
  importExport: {
    lastSection: 'export' | 'import';
  };
  aiPrompts: {
    presets: AiPromptPreset[];
  };
  editor: {
    autoSaveEnabled: boolean;
    autoSaveDelaySec: number;
    imageCompression: ImageCompressionMode;
    markdownGfm: boolean;
    markdownBreaks: boolean;
    preferredMode: EditorMode;
    copyFormat: CopyFormat;
  };
  ai: {
    enabled: boolean;
    provider: AiProvider;
    baseUrl: string;
    model: string;
    systemPrompt: string;
    hasApiKey: boolean;
    maskedApiKey: string;
  };
}

const SETTINGS_STORAGE_KEY = 'bemo.settings';

const defaultSettings: AppSettings = {
  importExport: {
    lastSection: 'export',
  },
  aiPrompts: {
    presets: [],
  },
  editor: {
    autoSaveEnabled: true,
    autoSaveDelaySec: 3,
    imageCompression: 'balanced',
    markdownGfm: true,
    markdownBreaks: true,
    preferredMode: 'rich-text',
    copyFormat: 'rich-text',
  },
  ai: {
    enabled: false,
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    systemPrompt: '',
    hasApiKey: false,
    maskedApiKey: '',
  },
};

type LocalSettings = Pick<AppSettings, 'importExport' | 'aiPrompts' | 'editor'>;

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
  };
}

export const settings = reactive<AppSettings>({ ...defaultSettings });

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
  };
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
}

export function upsertAiPromptPreset(payload: { id?: string; content: string }) {
  const trimmed = payload.content.trim();
  if (!trimmed) return;
  const preset: AiPromptPreset = {
    id: payload.id || `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    content: trimmed,
  };
  settings.aiPrompts.presets = [
    preset,
    ...settings.aiPrompts.presets.filter((item) => item.id !== preset.id && item.content !== trimmed),
  ].slice(0, 12);
  saveSettings();
}

export function removeAiPromptPreset(id: string) {
  settings.aiPrompts.presets = settings.aiPrompts.presets.filter((item) => item.id !== id);
  saveSettings();
}

interface AiSettingsResponse {
  enabled: boolean;
  provider: AiProvider;
  base_url: string;
  model: string;
  system_prompt: string;
  has_api_key: boolean;
  masked_api_key: string;
}

function applyAiSettings(data: AiSettingsResponse) {
  settings.ai.enabled = data.enabled;
  settings.ai.provider = data.provider;
  settings.ai.baseUrl = data.base_url;
  settings.ai.model = data.model;
  settings.ai.systemPrompt = data.system_prompt;
  settings.ai.hasApiKey = data.has_api_key;
  settings.ai.maskedApiKey = data.masked_api_key;
}

export async function loadAiSettings() {
  const res = await axios.get<AiSettingsResponse>(`${API_BASE}/settings/ai`);
  applyAiSettings(res.data);
}

export async function saveAiSettings(payload?: { apiKey?: string | null; clearApiKey?: boolean }) {
  const res = await axios.put<AiSettingsResponse>(`${API_BASE}/settings/ai`, {
    enabled: settings.ai.enabled,
    provider: settings.ai.provider,
    base_url: settings.ai.baseUrl,
    model: settings.ai.model,
    system_prompt: settings.ai.systemPrompt,
    api_key: payload?.apiKey ?? undefined,
    clear_api_key: payload?.clearApiKey ?? false,
  });
  applyAiSettings(res.data);
}

export async function clearAiApiKey() {
  const res = await axios.delete<AiSettingsResponse>(`${API_BASE}/settings/ai`);
  applyAiSettings(res.data);
}
