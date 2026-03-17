import axios from 'axios';

import { API_BASE } from '../config';
import { settings } from '../store/settings';
import type { AiProvider } from '../store/settingsTypes';

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
