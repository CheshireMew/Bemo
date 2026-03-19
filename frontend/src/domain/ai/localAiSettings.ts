import { saveLocalSettings } from '../settings/localSettingsStorage';
import { settings } from '../settings/settingsState';
import type { AiProvider } from '../settings/settingsTypes';

export type AiSettingsDraft = {
  enabled: boolean;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  systemPrompt: string;
};

function applyAiSettings() {
  settings.ai.hasApiKey = Boolean(settings.ai.apiKey);
  settings.ai.maskedApiKey = settings.ai.apiKey
    ? `${settings.ai.apiKey.slice(0, 4)}••••${settings.ai.apiKey.slice(-4)}`
    : '';
}

export async function loadAiSettings() {
  applyAiSettings();
}

export async function saveAiSettings(payload?: {
  values?: AiSettingsDraft;
  apiKey?: string | null;
  clearApiKey?: boolean;
}) {
  const values = payload?.values ?? {
    enabled: settings.ai.enabled,
    provider: settings.ai.provider,
    baseUrl: settings.ai.baseUrl,
    model: settings.ai.model,
    systemPrompt: settings.ai.systemPrompt,
  };

  settings.ai.enabled = values.enabled;
  settings.ai.provider = values.provider;
  settings.ai.baseUrl = values.baseUrl;
  settings.ai.model = values.model;
  settings.ai.systemPrompt = values.systemPrompt;

  if (payload?.clearApiKey) {
    settings.ai.apiKey = '';
  } else if (payload?.apiKey !== undefined && payload.apiKey !== null) {
    settings.ai.apiKey = payload.apiKey.trim();
  }

  applyAiSettings();
  saveLocalSettings();
}

export async function clearAiApiKey() {
  settings.ai.apiKey = '';
  applyAiSettings();
  saveLocalSettings();
}
