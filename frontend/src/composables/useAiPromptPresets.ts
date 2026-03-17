import { computed, ref, type Ref } from 'vue';
import type { AiPromptPreset } from '../store/settingsTypes';
import { settings } from '../store/settings';
import { removeAiPromptPreset, upsertAiPromptPreset } from '../services/aiPromptPresets';

type UseAiPromptPresetsOptions = {
  draft: Ref<string>;
};

export function useAiPromptPresets(options: UseAiPromptPresetsOptions) {
  const isPresetPanelOpen = ref(false);
  const presetDraft = ref('');
  const editingPresetId = ref<string | null>(null);
  const promptPresets = computed(() => settings.aiPrompts.presets);

  const togglePresetPanel = () => {
    isPresetPanelOpen.value = !isPresetPanelOpen.value;
  };

  const resetPresetEditor = () => {
    presetDraft.value = '';
    editingPresetId.value = null;
  };

  const savePreset = () => {
    if (!presetDraft.value.trim()) return;
    upsertAiPromptPreset({
      id: editingPresetId.value || undefined,
      content: presetDraft.value,
    });
    resetPresetEditor();
  };

  const usePromptPreset = (preset: string) => {
    options.draft.value = preset;
    isPresetPanelOpen.value = false;
  };

  const startEditPreset = (preset: AiPromptPreset) => {
    editingPresetId.value = preset.id;
    presetDraft.value = preset.content;
  };

  const removePrompt = (presetId: string) => {
    if (editingPresetId.value === presetId) {
      resetPresetEditor();
    }
    removeAiPromptPreset(presetId);
  };

  const handleClosed = () => {
    isPresetPanelOpen.value = false;
    resetPresetEditor();
  };

  return {
    editingPresetId,
    handleClosed,
    isPresetPanelOpen,
    presetDraft,
    promptPresets,
    removePrompt,
    resetPresetEditor,
    savePreset,
    startEditPreset,
    togglePresetPanel,
    usePromptPreset,
  };
}
