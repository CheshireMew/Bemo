import { saveSettings } from './localSettings';
import { settings } from '../store/settings';
import type { AiPromptPreset } from '../store/settingsTypes';

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
